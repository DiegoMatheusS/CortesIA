$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
if (!(Test-Path .env)) { python scripts/bootstrap.py }

if (!(Get-Command ollama -ErrorAction SilentlyContinue)) {
    throw "Ollama não está instalado ou não está no PATH."
}

Write-Host "Verificando se o qwen3:8b está disponível no Ollama..."
$models = ollama list
if ($models -notmatch "qwen3:8b") {
    Write-Host "Baixando qwen3:8b..."
    ollama pull qwen3:8b
}

docker compose -f compose.yaml -f compose.local-ai.yaml up --build
