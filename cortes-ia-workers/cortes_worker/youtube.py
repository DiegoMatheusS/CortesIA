import os

from .security import validate_url, youtube_dns_guard, download_https
from .models import ProcessingError

DEFAULT_MAX_DURATION_MS = 25_200_000


def _enabled():
    return os.getenv("YOUTUBE_ENABLED", "false").lower() in {"1", "true", "yes"}


def _restricted_error(exc):
    message = str(exc).lower()
    markers = (
        "private video",
        "video unavailable",
        "members-only",
        "members only",
        "age-restricted",
        "age restricted",
        "sign in to confirm",
        "login required",
        "not available in your country",
        "copyright",
    )
    return any(marker in message for marker in markers)


def metadata(url, max_bytes=None, max_duration_ms=None):
    validate_url(url, ("youtube.com", "youtu.be"))
    if not _enabled():
        raise ProcessingError("YOUTUBE_NOT_ENABLED", outcome="SOURCE_RESTRICTED")

    import yt_dlp

    duration_limit = int(
        max_duration_ms
        or os.getenv("YOUTUBE_MAX_DURATION_MS", str(DEFAULT_MAX_DURATION_MS))
    )
    socket_timeout = int(os.getenv("YOUTUBE_SOCKET_TIMEOUT_SECONDS", "30"))
    retries = int(os.getenv("YOUTUBE_METADATA_RETRIES", "2"))

    options = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
        "socket_timeout": socket_timeout,
        "retries": retries,
        "fragment_retries": retries,
        "proxy": "",
        # Prefer one direct HTTPS A/V stream so the secure pinned downloader
        # does not need to merge arbitrary remote streams.
        "format": "best[protocol^=http][vcodec!=none][acodec!=none][height<=1080]",
    }

    with youtube_dns_guard():
        try:
            with yt_dlp.YoutubeDL(options) as y:
                info = y.extract_info(url, download=False)
        except ProcessingError:
            raise
        except Exception as exc:
            if _restricted_error(exc):
                raise ProcessingError(
                    "SOURCE_RESTRICTED", outcome="SOURCE_RESTRICTED"
                ) from exc
            raise ProcessingError("YOUTUBE_METADATA_FAILED", True) from exc

    if (
        not info
        or info.get("is_live")
        or info.get("age_limit", 0) > 0
        or info.get("availability") not in (None, "public", "unlisted")
    ):
        raise ProcessingError("SOURCE_RESTRICTED", outcome="SOURCE_RESTRICTED")

    duration = int((info.get("duration") or 0) * 1000)
    if not 0 < duration <= duration_limit:
        raise ProcessingError("INVALID_DURATION")

    filesize = info.get("filesize") or info.get("filesize_approx")
    if max_bytes and filesize and int(filesize) > int(max_bytes):
        raise ProcessingError("FILE_TOO_LARGE")

    media = info.get("url", "")
    validate_url(media)

    return {
        "duration_ms": duration,
        "url": media,
        "title": info.get("title", "Vídeo"),
        "filesize": int(filesize) if filesize else None,
        "height": info.get("height"),
        "ext": info.get("ext"),
    }


def download(url, path, max_bytes, max_duration_ms=None):
    attempts = max(1, int(os.getenv("YOUTUBE_DOWNLOAD_ATTEMPTS", "2")))
    last = None

    for _ in range(attempts):
        try:
            info = metadata(
                url,
                max_bytes=max_bytes,
                max_duration_ms=max_duration_ms,
            )
            download_https(info["url"], path, max_bytes)
            return info
        except ProcessingError as exc:
            last = exc
            if not exc.retryable:
                raise

    raise last or ProcessingError("YOUTUBE_DOWNLOAD_FAILED", True)
