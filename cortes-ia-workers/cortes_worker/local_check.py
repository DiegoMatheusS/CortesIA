import os
import sys

from .models import ProcessingError
from .provider import OllamaProvider


def main():
    errors = []

    try:
        provider = OllamaProvider()
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

    cache = os.path.expanduser("~/.cache")
    print(f"[info] Cache de modelos: {cache}")

    if errors:
        print("[falha] Ambiente local de IA incompleto: " + ", ".join(errors))
        sys.exit(1)

    print("[ok] Ambiente local pronto para transcrição + seleção semântica")


if __name__ == "__main__":
    main()
