# IA local — Faster-Whisper + qwen3:8b

Este modo executa o pipeline sem usar um LLM externo para seleção de cortes.

## Componentes

- Transcrição: Faster-Whisper
- Seleção/revisão semântica: Ollama
- Modelo local aprovado: `qwen3:8b`
- Renderização: FFmpeg

Não existe fallback automático para `qwen3:4b` ou `qwen3:1.7b`.

## 1. Instalar Ollama no host

Instale o Ollama no Windows/Linux/macOS e baixe o modelo:

```bash
ollama pull qwen3:8b
```

Confirme:

```bash
ollama list
```

O Ollama deve estar ouvindo em `127.0.0.1:11434`. O worker Docker acessa o host por `host.docker.internal`.

## 2. Preparar os segredos locais

```bash
python scripts/bootstrap.py
```

## 3. Subir o modo local real

```bash
docker compose -f compose.yaml -f compose.local-ai.yaml up --build
```

O override troca apenas o worker para o target `local-ai`, ativa Faster-Whisper e mantém o restante da stack local.

Na primeira transcrição, o Faster-Whisper baixa o modelo configurado para um volume Docker persistente em `/home/cortes/.cache`.

Configuração padrão do override:

```env
AI_RUNTIME_PROFILE=LOCAL
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen3:8b
TRANSCRIPTION_PROVIDER=faster-whisper
FASTER_WHISPER_MODEL=medium
FASTER_WHISPER_DEVICE=cpu
FASTER_WHISPER_COMPUTE_TYPE=int8
```

## 4. Verificar antes de processar vídeos

```bash
docker compose -f compose.yaml -f compose.local-ai.yaml run --rm worker python -m cortes_worker.local_check
```

O comando verifica:
- acesso ao Ollama;
- presença do `qwen3:8b`;
- instalação do Faster-Whisper;
- caminho do cache de modelos.

## Fluxo

1. FFmpeg extrai áudio mono 16 kHz.
2. Faster-Whisper gera segmentos com timestamps.
3. A transcrição é dividida em janelas limitadas.
4. `qwen3:8b` gera candidatos com JSON estruturado.
5. O backend valida timestamps, duração, sobreposição e schema.
6. Uma segunda revisão do modelo compara os candidatos.
7. FFmpeg cria as prévias selecionadas.
8. O usuário edita revisões não destrutivas no editor.
9. O render final usa apenas parâmetros validados e allowlisted.

O LLM não recebe permissão para executar ferramentas, shell ou comandos FFmpeg.

## Ajustes de máquina

O override reserva até 8 GB para o worker porque a transcrição local exige mais memória que o modo fixture. O `qwen3:8b` roda no processo do Ollama no host e, portanto, não está incluído nesse limite do container.

Se a máquina tiver GPU compatível, a configuração do Faster-Whisper pode ser alterada explicitamente depois de validar drivers e runtime. Não há troca automática de modelo LLM por hardware.
