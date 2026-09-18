#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] || python3 scripts/bootstrap.py

if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama não está instalado ou não está no PATH." >&2
  exit 1
fi

if ! ollama list | grep -q 'qwen3:8b'; then
  ollama pull qwen3:8b
fi

docker compose -f compose.yaml -f compose.local-ai.yaml up --build
