import os
import pathlib
import sys
import tempfile

from .models import ProcessingError
from . import youtube


def main():
    url = os.getenv("YOUTUBE_SMOKE_URL") or (sys.argv[1] if len(sys.argv) > 1 else "")
    if not url:
        print("Uso: YOUTUBE_ENABLED=true python -m cortes_worker.youtube_check <url>")
        raise SystemExit(2)

    max_bytes = int(os.getenv("YOUTUBE_SMOKE_MAX_BYTES", "5000000000"))
    max_duration = int(os.getenv("YOUTUBE_MAX_DURATION_MS", "25200000"))

    try:
        info = youtube.metadata(url, max_bytes=max_bytes, max_duration_ms=max_duration)
        print(f"[ok] título: {info['title']}")
        print(f"[ok] duração_ms: {info['duration_ms']}")
        print(f"[ok] altura: {info.get('height')}")
        print(f"[ok] tamanho_estimado: {info.get('filesize') or 'desconhecido'}")

        if os.getenv("YOUTUBE_SMOKE_DOWNLOAD", "false").lower() in {"1", "true", "yes"}:
            with tempfile.TemporaryDirectory(prefix="sliceflow-youtube-") as tmp:
                target = pathlib.Path(tmp) / "source"
                youtube.download(url, target, max_bytes, max_duration)
                print(f"[ok] download concluído: {target.stat().st_size} bytes")
    except ProcessingError as exc:
        print(f"[erro] {exc.code}; retryable={exc.retryable}; outcome={exc.outcome}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
