#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] || python3 scripts/bootstrap.py
docker compose up --build
