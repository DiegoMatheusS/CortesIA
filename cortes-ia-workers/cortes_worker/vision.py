import hashlib
import math
import os
import pathlib
import subprocess
import urllib.request

from .models import ProcessingError

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"


def _clamp(value, low=0.0, high=1.0):
    return max(low, min(high, float(value)))


def _crop_values(crop):
    crop = crop or {"x": 0, "y": 0, "width": 1, "height": 1}
    try:
        x = float(crop.get("x", crop.get("X", 0)))
        y = float(crop.get("y", crop.get("Y", 0)))
        width = float(crop.get("width", crop.get("Width", 1)))
        height = float(crop.get("height", crop.get("Height", 1)))
    except (TypeError, ValueError):
        raise ProcessingError("INVALID_CROP")
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > 1.000001 or y + height > 1.000001:
        raise ProcessingError("INVALID_CROP")
    return x, y, width, height


def _model_path():
    configured = os.getenv("MEDIAPIPE_FACE_MODEL")
    if configured:
        path = pathlib.Path(configured).expanduser()
    else:
        path = pathlib.Path.home() / ".cache" / "sliceflow" / "vision" / "blaze_face_short_range.tflite"

    if path.exists():
        return path

    if os.getenv("VISION_ALLOW_MODEL_DOWNLOAD", "false").lower() not in {"1", "true", "yes"}:
        raise ProcessingError("VISION_MODEL_MISSING")

    path.parent.mkdir(parents=True, exist_ok=True)
    url = os.getenv("MEDIAPIPE_FACE_MODEL_URL", MODEL_URL)
    tmp = path.with_suffix(".download")
    try:
        urllib.request.urlretrieve(url, tmp)
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        raise ProcessingError("VISION_MODEL_DOWNLOAD_FAILED", True) from exc

    expected = os.getenv("MEDIAPIPE_FACE_MODEL_SHA256", "").strip().lower()
    if expected:
        digest = hashlib.sha256(tmp.read_bytes()).hexdigest()
        if digest != expected:
            tmp.unlink(missing_ok=True)
            raise ProcessingError("VISION_MODEL_HASH_MISMATCH")

    tmp.replace(path)
    return path


def _sample_frames(source, start_ms, end_ms, fps=2.0, width=640, height=360):
    if end_ms <= start_ms:
        return
    duration = (end_ms - start_ms) / 1000
    args = [
        "ffmpeg", "-nostdin", "-v", "error",
        "-ss", f"{start_ms / 1000:.3f}", "-t", f"{duration:.3f}",
        "-i", str(source),
        "-vf", f"fps={fps},scale={width}:{height}",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ]
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    frame_size = width * height * 3
    index = 0
    try:
        while True:
            raw = process.stdout.read(frame_size) if process.stdout else b""
            if len(raw) < frame_size:
                break
            timestamp = start_ms + int(index * 1000 / fps)
            yield timestamp, raw, width, height
            index += 1
    finally:
        if process.stdout:
            process.stdout.close()
        _, stderr = process.communicate(timeout=30)
        if process.returncode not in (0, None):
            raise ProcessingError("VISION_DECODE_FAILED", True)


def _select_face(detections, previous=None):
    best = None
    best_score = -1.0
    for detection in detections:
        box = detection.bounding_box
        area = max(0, box.width) * max(0, box.height)
        if area <= 0:
            continue
        cx = box.origin_x + box.width / 2
        cy = box.origin_y + box.height / 2
        continuity = 0.0
        if previous is not None:
            dx = cx - previous[0]
            dy = cy - previous[1]
            continuity = 1.0 / (1.0 + math.sqrt(dx * dx + dy * dy))
        score = area * (1.0 + continuity * 0.35)
        if score > best_score:
            best = (cx, cy)
            best_score = score
    return best


def _smooth(points, alpha=0.35):
    if not points:
        return []
    result = []
    sx = points[0]["x"]
    sy = points[0]["y"]
    for point in points:
        sx = sx + alpha * (point["x"] - sx)
        sy = sy + alpha * (point["y"] - sy)
        result.append({"timeMs": int(point["timeMs"]), "x": _clamp(sx), "y": _clamp(sy)})
    return result


def track_faces(source, source_segments, crop=None, fps=2.0):
    """Return smoothed subject-center keyframes on the output timeline.

    Coordinates are normalized after the optional manual crop so media.render can
    apply the plan to the post-crop frame.
    """
    if os.getenv("VISION_PROVIDER", "none").lower() != "mediapipe":
        return []

    try:
        import mediapipe as mp
        import numpy as np
    except ImportError as exc:
        raise ProcessingError("VISION_PROVIDER_NOT_INSTALLED") from exc

    model = _model_path()
    options = mp.tasks.vision.FaceDetectorOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model)),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        min_detection_confidence=float(os.getenv("VISION_MIN_CONFIDENCE", "0.5")),
    )

    cx0, cy0, cw, ch = _crop_values(crop)
    raw_points = []
    output_offset = 0
    previous = None

    with mp.tasks.vision.FaceDetector.create_from_options(options) as detector:
        for segment in source_segments:
            start = int(segment.get("startMs", segment.get("start_ms", 0)))
            end = int(segment.get("endMs", segment.get("end_ms", 0)))
            for timestamp, raw, width, height in _sample_frames(source, start, end, fps=fps):
                array = np.frombuffer(raw, dtype=np.uint8).reshape((height, width, 3)).copy()
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=array)
                result = detector.detect_for_video(image, timestamp)
                selected = _select_face(result.detections, previous)
                if selected is None:
                    continue
                previous = selected
                norm_x = selected[0] / width
                norm_y = selected[1] / height
                norm_x = _clamp((norm_x - cx0) / cw)
                norm_y = _clamp((norm_y - cy0) / ch)
                raw_points.append({
                    "timeMs": output_offset + (timestamp - start),
                    "x": norm_x,
                    "y": norm_y,
                })
            output_offset += max(0, end - start)

    if len(raw_points) < 2:
        return []
    return _smooth(raw_points)
