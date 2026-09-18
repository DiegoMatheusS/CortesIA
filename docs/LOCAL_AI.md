# IA local — Faster-Whisper + qwen3:8b

Este modo executa o pipeline sem usar um LLM externo para seleção de cortes.

## Componentes

- Transcrição: Faster-Whisper
- Seleção/revisão semântica: Ollama
- Modelo local aprovado: `qwen3:8b`
- Visão/reenquadramento: MediaPipe Face Detector
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
VISION_PROVIDER=mediapipe
VISION_ALLOW_MODEL_DOWNLOAD=true
VISION_SAMPLE_FPS=2
```

## 4. Verificar antes de processar vídeos

```bash
docker compose -f compose.yaml -f compose.local-ai.yaml run --rm worker python -m cortes_worker.local_check
```

O comando verifica:
- acesso ao Ollama;
- presença do `qwen3:8b`;
- instalação do Faster-Whisper;
- instalação do MediaPipe quando a visão está habilitada;
- presença (ou download permitido) do modelo de detecção facial;
- caminho do cache de modelos.

## Fluxo

1. FFmpeg extrai áudio mono 16 kHz.
2. Faster-Whisper gera segmentos com timestamps.
3. A transcrição é dividida em janelas limitadas.
4. `qwen3:8b` gera candidatos com JSON estruturado.
5. O backend valida timestamps, duração, sobreposição e schema.
6. Uma segunda revisão do modelo compara os candidatos.
7. Quando o extra de reenquadramento está habilitado, MediaPipe amostra o vídeo, detecta o rosto principal e gera pontos suavizados de centro ao longo do tempo.
8. FFmpeg usa esses pontos para um crop dinâmico determinístico; se nenhum reenquadramento inteligente for entregue nas prévias, o extra é marcado como não entregue para estorno.
9. FFmpeg cria as prévias selecionadas.
10. O usuário edita revisões não destrutivas no editor.
11. O render final usa apenas parâmetros validados e allowlisted.

O LLM não recebe permissão para executar ferramentas, shell ou comandos FFmpeg.

## Ajustes de máquina

O override reserva até 8 GB para o worker porque a transcrição local exige mais memória que o modo fixture. O `qwen3:8b` roda no processo do Ollama no host e, portanto, não está incluído nesse limite do container.

Se a máquina tiver GPU compatível, a configuração do Faster-Whisper pode ser alterada explicitamente depois de validar drivers e runtime. Não há troca automática de modelo LLM por hardware.


## Reenquadramento inteligente

O recurso `tracking` não fica disponível por padrão. A API só aceita a cobrança quando `TRACKING_ENABLED=true`.

No perfil `compose.local-ai.yaml`, o worker instala MediaPipe e ativa o provider. O modelo de face é mantido no volume de cache. Em desenvolvimento local o download do modelo oficial pode ser permitido; em produção, prefira empacotar um modelo aprovado na imagem e configurar `MEDIAPIPE_FACE_MODEL`/hash.

A visão não gera comandos FFmpeg. Ela retorna apenas pontos normalizados `x/y` ao longo do tempo. O filtro de crop é construído pelo código do SliceFlow.
