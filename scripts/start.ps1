$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
if (!(Test-Path .env)) { python scripts/bootstrap.py }
docker compose up --build
