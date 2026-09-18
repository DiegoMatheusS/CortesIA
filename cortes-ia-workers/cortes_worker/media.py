import json
import math
import os
import pathlib
import resource
import subprocess

from .models import ProcessingError


def _limits():
    resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_FSIZE, (12_000_000_000, 12_000_000_000))


def command(args, timeout=7200):
    try:
        process = subprocess.run(
            args,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
            preexec_fn=_limits,
        )
    except subprocess.TimeoutExpired:
        raise ProcessingError("MEDIA_TIMEOUT", True)
    if process.returncode:
        raise ProcessingError("MEDIA_COMMAND_FAILED")
    return process.stdout


def probe(source, max_bytes=5_000_000_000, max_duration_ms=10_800_000):
    source = pathlib.Path(source)
    if source.stat().st_size > max_bytes:
        raise ProcessingError("FILE_TOO_LARGE")
    raw = command(
        [
            "ffprobe",
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            str(source),
        ],
        30,
    )
    try:
        data = json.loads(raw)
        video = next(s for s in data["streams"] if s["codec_type"] == "video")
        duration = int(float(data["format"]["duration"]) * 1000)
    except (KeyError, ValueError, StopIteration):
        raise ProcessingError("INVALID_MEDIA")

    formats = set(data["format"].get("format_name", "").split(","))
    if not formats.intersection({"mov", "mp4", "matroska", "webm"}):
        raise ProcessingError("UNSUPPORTED_CONTAINER")
    if video.get("codec_name") not in {
        "h264",
        "hevc",
        "vp8",
        "vp9",
        "av1",
        "mpeg4",
        "prores",
    }:
        raise ProcessingError("UNSUPPORTED_CODEC")
    if not 0 < duration <= max_duration_ms:
        raise ProcessingError("INVALID_DURATION")

    width, height = int(video["width"]), int(video["height"])
    if max(width, height) > 4096 or min(width, height) > 2160:
        raise ProcessingError("RESOLUTION_LIMIT")

    return {
        "duration_ms": duration,
        "width": width,
        "height": height,
        "audio": any(s["codec_type"] == "audio" for s in data["streams"]),
    }


def normalize(source, target, meta):
    command(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-y",
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            str(source),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
            "-threads",
            "2",
            str(target),
        ]
    )


def audio(source, target):
    command(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-y",
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            str(source),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(target),
        ]
    )


def ass_escape(text):
    return (
        str(text)
        .replace("\\", "/")
        .replace("{", "(")
        .replace("}", ")")
        .replace("\r", "")
        .replace("\n", "\\N")
    )


def ass_time(ms):
    cs = max(0, int(ms)) // 10
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02}:{s:02}.{cs:02}"


CAPTION_STYLES = {
    "Clean": dict(size=.032, primary="&H00FFFFFF", secondary="&H0000FFFF", outline="&H00101010", back="&H80000000", bold=1, border=1, outline_w=2, shadow=1),
    "Bold": dict(size=.038, primary="&H00FFFFFF", secondary="&H0000FFFF", outline="&H00000000", back="&H70000000", bold=1, border=1, outline_w=4, shadow=1),
    "Viral": dict(size=.040, primary="&H00FFFFFF", secondary="&H0000FFFF", outline="&H00202020", back="&H90000000", bold=1, border=1, outline_w=3, shadow=2),
    "Podcast": dict(size=.033, primary="&H00FFFFFF", secondary="&H00FFFFFF", outline="&H00181818", back="&H85000000", bold=1, border=3, outline_w=1, shadow=0),
    "Karaoke": dict(size=.036, primary="&H00FFFFFF", secondary="&H0000D7FF", outline="&H00101010", back="&H70000000", bold=1, border=1, outline_w=3, shadow=1),
    "Pop": dict(size=.038, primary="&H00F0F0FF", secondary="&H00FF80D0", outline="&H00402040", back="&H78000000", bold=1, border=1, outline_w=3, shadow=2),
    "Minimal": dict(size=.030, primary="&H00FFFFFF", secondary="&H00FFFFFF", outline="&H00303030", back="&H00000000", bold=0, border=1, outline_w=1, shadow=0),
    "Box": dict(size=.033, primary="&H00FFFFFF", secondary="&H00FFFFFF", outline="&H00000000", back="&HCC161616", bold=1, border=3, outline_w=0, shadow=0),
    "News": dict(size=.030, primary="&H00FFFFFF", secondary="&H00FFFFFF", outline="&H00181818", back="&HBB301000", bold=1, border=3, outline_w=0, shadow=0),
    "Dark": dict(size=.034, primary="&H00E8E8E8", secondary="&H00FFFFFF", outline="&H00000000", back="&HBB000000", bold=1, border=3, outline_w=0, shadow=0),
    "Neon": dict(size=.036, primary="&H00FFF0FF", secondary="&H00FF70E0", outline="&H00602060", back="&H70000000", bold=1, border=1, outline_w=3, shadow=3),
    "Impacto": dict(size=.042, primary="&H00FFFFFF", secondary="&H0000D7FF", outline="&H00000000", back="&H80000000", bold=1, border=1, outline_w=5, shadow=2),
    "Emoji": dict(size=.034, primary="&H00FFFFFF", secondary="&H0000FFFF", outline="&H00101010", back="&H80000000", bold=1, border=1, outline_w=2, shadow=1),
    "Subtitle Classic": dict(size=.030, primary="&H00FFFFFF", secondary="&H00FFFFFF", outline="&H00000000", back="&H90000000", bold=0, border=1, outline_w=2, shadow=1),
    "Creator": dict(size=.036, primary="&H00FFFFFF", secondary="&H00D0FF90", outline="&H00101010", back="&H80000000", bold=1, border=1, outline_w=3, shadow=1),
    "Custom": dict(size=.032, primary="&H00FFFFFF", secondary="&H0000FFFF", outline="&H00101010", back="&H80000000", bold=1, border=1, outline_w=2, shadow=1),
}


VISUAL_FILTERS = {
    "Cinema": "eq=contrast=1.12:saturation=0.88:brightness=-0.02,vignette=PI/7",
    "Divertido": "eq=contrast=1.03:saturation=1.28:brightness=0.035",
    "Animado": "eq=contrast=1.08:saturation=1.42:brightness=0.02",
    "Sombrio": "eq=contrast=1.24:saturation=0.72:brightness=-0.08,vignette=PI/5",
    "Quente": "eq=contrast=1.06:saturation=1.18:brightness=0.01,colorbalance=rs=.05:gs=.015:bs=-.04",
    "Frio": "eq=contrast=1.06:saturation=0.9:brightness=-0.01,colorbalance=rs=-.035:gs=.01:bs=.055",
    "Clean": "eq=contrast=1.02:saturation=1.0:brightness=0.0",
    "Podcast": "eq=contrast=1.05:saturation=.95:brightness=0.0",
    "Impactante": "eq=contrast=1.2:saturation=1.2:brightness=-0.015",
    "Viral": "eq=contrast=1.1:saturation=1.3:brightness=.015",
}


def _word_items(segment):
    start = int(segment.get("startMs", segment.get("start_ms", 0)))
    end = int(segment.get("endMs", segment.get("end_ms", 0)))
    words = segment.get("words") or []
    valid = []
    for item in words:
        word_start = item.get("startMs", item.get("start_ms"))
        word_end = item.get("endMs", item.get("end_ms"))
        token = str(item.get("word", "")).strip()
        if word_start is None or word_end is None or not token:
            continue
        word_start, word_end = int(word_start), int(word_end)
        if start <= word_start < word_end <= end:
            valid.append({"startMs": word_start, "endMs": word_end, "word": token})
    if valid:
        return valid

    tokens = [token for token in str(segment.get("text", "")).split() if token]
    if not tokens or end <= start:
        return []
    weights = [max(1, len(token.strip(".,!?;:()[]{}\"'"))) for token in tokens]
    total_weight = max(1, sum(weights))
    cursor = start
    result = []
    for index, (token, weight) in enumerate(zip(tokens, weights)):
        if index == len(tokens) - 1:
            word_end = end
        else:
            word_end = cursor + max(10, int((end - start) * weight / total_weight))
            word_end = min(end, word_end)
        if word_end <= cursor:
            word_end = min(end, cursor + 10)
        result.append({"startMs": cursor, "endMs": word_end, "word": token})
        cursor = word_end
    if result:
        result[-1]["endMs"] = end
    return result


def _dynamic_dialogues(segment, words_per_line=4):
    words = _word_items(segment)
    if not words:
        return []
    lines = []
    for offset in range(0, len(words), max(1, words_per_line)):
        group = words[offset:offset + max(1, words_per_line)]
        start = group[0]["startMs"]
        end = group[-1]["endMs"]
        parts = []
        for word in group:
            duration_cs = max(1, int(round((word["endMs"] - word["startMs"]) / 10)))
            safe = ass_escape(word["word"]).replace("\\N", " ").strip()
            parts.append(f"{{\\kf{duration_cs}}}{safe}")
        lines.append((start, end, " ".join(parts)))
    return lines


def subtitles(path, segments, width, height, preset="Clean", dynamic=False):
    style = CAPTION_STYLES.get(preset)
    if style is None:
        raise ProcessingError("INVALID_CAPTION_PRESET")
    font_size = max(18, int(height * style["size"]))
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,{font_size},{style["primary"]},{style["secondary"]},{style["outline"]},{style["back"]},{style["bold"]},0,0,0,100,100,0,0,{style["border"]},{style["outline_w"]},{style["shadow"]},2,{int(width*.08)},{int(width*.08)},{int(height*.13)},1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    for segment in segments:
        start = segment.get("startMs", segment.get("start_ms"))
        end = segment.get("endMs", segment.get("end_ms"))
        if start is None or end is None or end <= start:
            raise ProcessingError("INVALID_SUBTITLE")
        if dynamic:
            for line_start, line_end, text in _dynamic_dialogues(segment):
                lines.append(
                    f"Dialogue: 0,{ass_time(line_start)},{ass_time(line_end)},Default,,0,0,0,,{text}"
                )
        else:
            lines.append(
                f'Dialogue: 0,{ass_time(start)},{ass_time(end)},Default,,0,0,0,,{ass_escape(segment["text"])}'
            )
    pathlib.Path(path).write_text(header + "\n".join(lines) + "\n", encoding="utf-8")


def _source_segments(source_segments, start_ms, end_ms, duration_ms):
    items = source_segments or [{"startMs": start_ms, "endMs": end_ms}]
    if not isinstance(items, list) or not items or len(items) > 64:
        raise ProcessingError("INVALID_SEGMENTS")
    normalized = []
    previous = -1
    total = 0
    for item in items:
        start = item.get("startMs", item.get("start_ms"))
        end = item.get("endMs", item.get("end_ms"))
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
            raise ProcessingError("INVALID_SEGMENTS")
        start, end = int(start), int(end)
        if start < 0 or end <= start or end > duration_ms or start < previous:
            raise ProcessingError("INVALID_SEGMENTS")
        normalized.append((start, end))
        previous = end
        total += end - start
    if total <= 0 or total > 180_000:
        raise ProcessingError("INVALID_SEGMENTS")
    return normalized, total


def _crop_filter(crop):
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
    if abs(x) < 1e-9 and abs(y) < 1e-9 and abs(width - 1) < 1e-9 and abs(height - 1) < 1e-9:
        return None
    return f"crop=w='iw*{width:.6f}':h='ih*{height:.6f}':x='iw*{x:.6f}':y='ih*{y:.6f}'"



def _piecewise_center_expr(points, field):
    clean = sorted(
        [
            (max(0.0, float(item.get("timeMs", 0)) / 1000.0), max(0.0, min(1.0, float(item[field]))))
            for item in (points or [])
            if field in item
        ],
        key=lambda item: item[0],
    )
    if not clean:
        return "0.5"
    if len(clean) == 1:
        return f"{clean[0][1]:.6f}"

    expression = f"{clean[-1][1]:.6f}"
    for index in range(len(clean) - 2, -1, -1):
        t0, v0 = clean[index]
        t1, v1 = clean[index + 1]
        duration = max(0.001, t1 - t0)
        slope = (v1 - v0) / duration
        linear = f"({v0:.6f}+({slope:.8f})*(t-{t0:.3f}))"
        expression = f"if(lt(t\\,{t1:.3f})\\,{linear}\\,{expression})"
    first_t, first_v = clean[0]
    if first_t > 0:
        expression = f"if(lt(t\\,{first_t:.3f})\\,{first_v:.6f}\\,{expression})"
    return expression


def _tracking_crop_filter(aspect, points):
    if aspect == "original" or not points:
        return None
    ratios = {"9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1.0, "16:9": 16 / 9}
    ratio = ratios.get(aspect)
    if ratio is None:
        raise ProcessingError("INVALID_ASPECT")

    center_x = _piecewise_center_expr(points, "x")
    center_y = _piecewise_center_expr(points, "y")
    width = f"if(gt(iw/ih\\,{ratio:.8f})\\,ih*{ratio:.8f}\\,iw)"
    height = f"if(gt(iw/ih\\,{ratio:.8f})\\,ih\\,iw/{ratio:.8f})"
    x = f"max(0\\,min(iw-ow\\,({center_x})*iw-ow/2))"
    y = f"max(0\\,min(ih-oh\\,({center_y})*ih-oh/2))"
    return f"crop=w='{width}':h='{height}':x='{x}':y='{y}'"


def render(
    source,
    target,
    start_ms,
    end_ms,
    segments,
    features=(),
    aspect="9:16",
    preview=False,
    style="simple",
    source_segments=None,
    caption_preset="Clean",
    visual_style="Cinema",
    crop=None,
    tracking_plan=None,
):
    meta = probe(source, max_bytes=12_000_000_000)
    source_ranges, output_duration_ms = _source_segments(
        source_segments, start_ms, end_ms, meta["duration_ms"]
    )

    sizes = {
        "9:16": (1080, 1920),
        "4:5": (1080, 1350),
        "1:1": (1080, 1080),
        "16:9": (1920, 1080),
        "original": (meta["width"], meta["height"]),
    }
    if aspect not in sizes:
        raise ProcessingError("INVALID_ASPECT")
    if visual_style not in VISUAL_FILTERS:
        raise ProcessingError("INVALID_VISUAL_STYLE")

    w, h = sizes[aspect]
    factor = (
        min(1, meta["width"] / w, meta["height"] / h)
        if "blur" not in features
        else min(1, max(meta["width"], meta["height"]) / max(w, h))
    )
    if preview:
        factor = min(factor, 720 / max(w, h))
    w = max(2, int(w * factor) // 2 * 2)
    h = max(2, int(h * factor) // 2 * 2)

    work = pathlib.Path(target).parent
    ass = work / "captions.ass"
    subtitles(ass, segments, w, h, caption_preset, dynamic="dynamic_captions" in features)
    safe_ass = (
        str(ass).replace("\\", "/").replace(":", r"\:").replace("'", r"\'")
    )

    graph = []
    video_labels = []
    audio_labels = []
    for index, (segment_start, segment_end) in enumerate(source_ranges):
        start = segment_start / 1000
        end = segment_end / 1000
        graph.append(
            f"[0:v]trim=start={start:.3f}:end={end:.3f},setpts=PTS-STARTPTS[sv{index}]"
        )
        video_labels.append(f"[sv{index}]")
        if meta["audio"]:
            graph.append(
                f"[0:a]atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS[sa{index}]"
            )
            audio_labels.append(f"[sa{index}]")

    if len(source_ranges) == 1:
        graph.append(f"{video_labels[0]}null[vbase]")
        if meta["audio"]:
            graph.append(f"{audio_labels[0]}anull[abase]")
    elif meta["audio"]:
        joined = "".join(
            video_labels[index] + audio_labels[index]
            for index in range(len(source_ranges))
        )
        graph.append(
            f"{joined}concat=n={len(source_ranges)}:v=1:a=1[vbase][abase]"
        )
    else:
        graph.append(
            f"{''.join(video_labels)}concat=n={len(source_ranges)}:v=1:a=0[vbase]"
        )

    current = "vbase"
    crop_filter = _crop_filter(crop)
    if crop_filter:
        graph.append(f"[{current}]{crop_filter}[vcrop]")
        current = "vcrop"

    tracking_filter = _tracking_crop_filter(aspect, tracking_plan)
    if tracking_filter:
        graph.append(f"[{current}]{tracking_filter}[vtrack]")
        current = "vtrack"

    if "blur" in features:
        graph.append(f"[{current}]split=2[bgsrc][fgsrc]")
        graph.append(
            f"[bgsrc]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=20:2[bg]"
        )
        graph.append(
            f"[fgsrc]scale={w}:{h}:force_original_aspect_ratio=decrease[fg]"
        )
        graph.append(
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[vscaled]"
        )
    else:
        graph.append(
            f"[{current}]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1[vscaled]"
        )
    current = "vscaled"

    graph.append(f"[{current}]{VISUAL_FILTERS[visual_style]}[vlook]")
    current = "vlook"

    if "zoom" in features:
        graph.append(
            f"[{current}]zoompan=z='1.03+0.03*sin(on/50)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={w}x{h}:fps=30[vzoom]"
        )
        current = "vzoom"

    if style != "none":
        graph.append(f"[{current}]ass='{safe_ass}'[vsub]")
        current = "vsub"

    args = [
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        str(source),
        "-filter_complex",
        ";".join(graph),
        "-map",
        f"[{current}]",
    ]
    if meta["audio"]:
        args += ["-map", "[abase]"]
    args += [
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "26" if preview else "20",
        "-pix_fmt",
        "yuv420p",
    ]
    if meta["audio"]:
        args += ["-c:a", "aac", "-b:a", "160k"]
    args += [
        "-movflags",
        "+faststart",
        "-threads",
        "2",
        str(target),
    ]

    command(args)
    return {"width": w, "height": h, "duration_ms": output_duration_ms}


def cover(source, target, at_ms=0):
    command(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-y",
            "-protocol_whitelist",
            "file,pipe",
            "-ss",
            str(at_ms / 1000),
            "-i",
            str(source),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(target),
        ],
        120,
    )
