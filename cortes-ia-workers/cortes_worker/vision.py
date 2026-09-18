import contextlib
import hashlib
import math
import os
import pathlib
import subprocess
import urllib.request

from .models import ProcessingError

FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
PERSON_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite"


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


def _model_path(path_env, url_env, filename, default_url):
    configured = os.getenv(path_env)
    if configured:
        path = pathlib.Path(configured).expanduser()
    else:
        path = pathlib.Path.home() / ".cache" / "sliceflow" / "vision" / filename

    if path.exists():
        return path

    if os.getenv("VISION_ALLOW_MODEL_DOWNLOAD", "false").lower() not in {"1", "true", "yes"}:
        raise ProcessingError("VISION_MODEL_MISSING")

    path.parent.mkdir(parents=True, exist_ok=True)
    url = os.getenv(url_env, default_url)
    tmp = path.with_suffix(path.suffix + ".download")
    try:
        urllib.request.urlretrieve(url, tmp)
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        raise ProcessingError("VISION_MODEL_DOWNLOAD_FAILED", True) from exc

    expected = os.getenv(path_env + "_SHA256", "").strip().lower()
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
        if process.stderr:
            process.stderr.read()
            process.stderr.close()
        try:
            returncode = process.wait(timeout=30)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
            raise ProcessingError("VISION_DECODE_FAILED", True)
        if returncode != 0:
            raise ProcessingError("VISION_DECODE_FAILED", True)


def _select_detection(detections, previous=None):
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
        confidence = 1.0
        categories = getattr(detection, "categories", None) or []
        if categories:
            confidence = max(.05, float(getattr(categories[0], "score", 1.0) or 1.0))
        score = area * confidence * (1.0 + continuity * 0.45)
        if score > best_score:
            best = (cx, cy)
            best_score = score
    return best


def _smooth(points, alpha=0.28):
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


def track_subjects(source, source_segments, crop=None, fps=2.0):
    """Track a face first and fall back to a person detector.

    Returned coordinates are smoothed normalized subject-center keyframes on the
    output timeline. If neither detector sees the subject briefly, the previous
    center is held to avoid abrupt crop jumps.
    """
    if os.getenv("VISION_PROVIDER", "none").lower() != "mediapipe":
        return []

    try:
        import mediapipe as mp
        import numpy as np
    except ImportError as exc:
        raise ProcessingError("VISION_PROVIDER_NOT_INSTALLED") from exc

    face_model = _model_path(
        "MEDIAPIPE_FACE_MODEL",
        "MEDIAPIPE_FACE_MODEL_URL",
        "blaze_face_short_range.tflite",
        FACE_MODEL_URL,
    )
    person_model = None
    if os.getenv("VISION_PERSON_FALLBACK", "true").lower() in {"1", "true", "yes"}:
        try:
            person_model = _model_path(
                "MEDIAPIPE_PERSON_MODEL",
                "MEDIAPIPE_PERSON_MODEL_URL",
                "efficientdet_lite0.tflite",
                PERSON_MODEL_URL,
            )
        except ProcessingError:
            person_model = None

    face_options = mp.tasks.vision.FaceDetectorOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(face_model)),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        min_detection_confidence=float(os.getenv("VISION_MIN_CONFIDENCE", "0.5")),
    )

    person_options = None
    if person_model is not None:
        person_options = mp.tasks.vision.ObjectDetectorOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(person_model)),
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            score_threshold=float(os.getenv("VISION_PERSON_MIN_CONFIDENCE", "0.45")),
            category_allowlist=["person"],
            max_results=4,
        )

    cx0, cy0, cw, ch = _crop_values(crop)
    raw_points = []
    output_offset = 0
    previous = None

    with contextlib.ExitStack() as stack:
        face_detector = stack.enter_context(
            mp.tasks.vision.FaceDetector.create_from_options(face_options)
        )
        person_detector = (
            stack.enter_context(mp.tasks.vision.ObjectDetector.create_from_options(person_options))
            if person_options is not None
            else None
        )

        for segment in source_segments:
            start = int(segment.get("startMs", segment.get("start_ms", 0)))
            end = int(segment.get("endMs", segment.get("end_ms", 0)))
            for timestamp, raw, width, height in _sample_frames(source, start, end, fps=fps):
                array = np.frombuffer(raw, dtype=np.uint8).reshape((height, width, 3)).copy()
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=array)

                face_result = face_detector.detect_for_video(image, timestamp)
                selected = _select_detection(face_result.detections, previous)

                if selected is None and person_detector is not None:
                    person_result = person_detector.detect_for_video(image, timestamp)
                    selected = _select_detection(person_result.detections, previous)

                if selected is None:
                    selected = previous
                if selected is None:
                    continue

                previous = selected
                norm_x = _clamp((selected[0] / width - cx0) / cw)
                norm_y = _clamp((selected[1] / height - cy0) / ch)
                raw_points.append({
                    "timeMs": output_offset + (timestamp - start),
                    "x": norm_x,
                    "y": norm_y,
                })
            output_offset += max(0, end - start)

    if len(raw_points) < 2:
        return []
    return _smooth(
        raw_points,
        alpha=float(os.getenv("VISION_SMOOTHING_ALPHA", "0.28")),
    )


def track_faces(source, source_segments, crop=None, fps=2.0):
    """Backward-compatible alias for older worker callers."""
    return track_subjects(source, source_segments, crop=crop, fps=fps)
