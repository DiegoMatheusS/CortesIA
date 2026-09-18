import os
import sys

from .models import ProcessingError
from .provider import OllamaProvider


def main():
    errors = []

    try:
        default_model = os.getenv("OLLAMA_MODEL", "qwen3:8b")
        models = {
            os.getenv("OLLAMA_SELECTION_MODEL", default_model),
            os.getenv("OLLAMA_REVIEW_MODEL", default_model),
        }
        providers = [OllamaProvider(model) for model in sorted(models)]
        for provider in providers:
            provider.health()
            print(f"[ok] Ollama acessível: {provider.base}")
            print(f"[ok] Modelo local disponível: {provider.model}")
    except ProcessingError as exc:
        errors.append(exc.code)
        print(f"[erro] Ollama: {exc.code}")

    try:
        import faster_whisper  # noqa: F401
        print("[ok] faster-whisper instalado")
    except ImportError:
        errors.append("FASTER_WHISPER_NOT_INSTALLED")
        print("[erro] faster-whisper não está instalado neste worker")

    if os.getenv("VISION_PROVIDER", "none").lower() == "mediapipe":
        try:
            import mediapipe  # noqa: F401
            from .vision import _model_path
            model = _model_path()
            print(f"[ok] MediaPipe instalado; modelo de face: {model}")
        except Exception as exc:
            errors.append("VISION_NOT_READY")
            print(f"[erro] visão local: {getattr(exc, 'code', type(exc).__name__)}")

    cache = os.path.expanduser("~/.cache")
    print(f"[info] Cache de modelos: {cache}")

    if errors:
        print("[falha] Ambiente local de IA incompleto: " + ", ".join(errors))
        sys.exit(1)

    print("[ok] Ambiente local pronto para transcrição + seleção semântica + visão configurada")


if __name__ == "__main__":
    main()
