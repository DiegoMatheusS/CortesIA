# YouTube e podcasts longos — SliceFlow

O SliceFlow aceita importação de vídeos públicos ou não listados do YouTube, sem cookies/login e sem contornar restrições da plataforma.

## Limites atuais

- duração máxima técnica: **7 horas**;
- tamanho máximo atual: **5 GB**;
- resolução aceita na fonte: até 4K; o working master é normalizado para no máximo 1080p quando recodificação for necessária;
- links suportados: `youtube.com`, `www.youtube.com`, `m.youtube.com` e `youtu.be`;
- lives, vídeos privados, restritos por idade/autenticação e fontes indisponíveis são recusados sem consumo de créditos.

## Segurança

A importação mantém:

- HTTPS obrigatório;
- allowlist de hosts YouTube/Google Video;
- bloqueio de IP privado/link-local/metadata;
- resolução DNS guardada durante o uso do yt-dlp;
- download por conexão HTTPS pinada a endereços públicos;
- limite de bytes durante streaming;
- sem proxy, cookies ou login;
- sem playlists.

## Robustez para 4–7 horas

O pipeline foi ajustado para fontes longas:

1. metadata e download usam o mesmo limite de 7h;
2. timeouts de metadata/download são configuráveis;
3. falhas transitórias podem ser repetidas sem nova cobrança;
4. fontes H.264/HEVC/MPEG-4 até 1080p podem virar working master por **remux**, evitando recodificar o vídeo inteiro;
5. áudio é extraído separadamente para ASR;
6. seleção semântica usa janelas long-form configuráveis;
7. candidatos de todas as janelas são ranqueados globalmente antes da segunda revisão, evitando favorecer apenas o começo do podcast.

Configuração padrão:

```env
YOUTUBE_ENABLED=true
YOUTUBE_MAX_DURATION_MS=25200000
YOUTUBE_SOCKET_TIMEOUT_SECONDS=60
YOUTUBE_METADATA_RETRIES=2
YOUTUBE_DOWNLOAD_ATTEMPTS=2
AI_LONGFORM_WINDOW_MS=900000
AI_LONGFORM_OVERLAP_MS=90000
MEDIA_NORMALIZE_TIMEOUT_SECONDS=28800
MEDIA_AUDIO_TIMEOUT_SECONDS=14400
```

## Smoke test real

Não há URL externa fixa no CI, para evitar teste instável/dependência de conteúdo de terceiros.

No ambiente de homologação, rode com um vídeo público que você escolher:

```bash
YOUTUBE_ENABLED=true python -m cortes_worker.youtube_check "https://www.youtube.com/watch?v=..."
```

Para validar também o download completo:

```bash
YOUTUBE_ENABLED=true YOUTUBE_SMOKE_DOWNLOAD=true python -m cortes_worker.youtube_check "https://www.youtube.com/watch?v=..."
```

O teste deve confirmar metadata, duração e, quando solicitado, download dentro do limite de 5 GB.

## Produção

`YOUTUBE_ENABLED` continua sendo feature flag. O Compose local/homologação usa `true` por padrão para permitir testes. Em produção, habilite somente depois de executar smoke tests com fontes reais e validar política operacional/comercial para vídeos longos.
