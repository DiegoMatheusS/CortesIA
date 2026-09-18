$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
if (!(Test-Path .env)) { python scripts/bootstrap.py }

Write-Host "Verificando se o qwen3:8b está disponível no Ollama..."
$models = ollama list 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "Ollama não está disponível. Instale/inicie o Ollama antes de subir o modo local."
}
if ($models -notmatch "qwen3:8b") {
    Write-Host "Baixando qwen3:8b..."
    ollama pull qwen3:8b
}

docker compose -f compose.yaml -f compose.local-ai.yaml up --build
