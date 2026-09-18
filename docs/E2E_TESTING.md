# Testes E2E — SliceFlow

O gate E2E valida a integração real entre navegador, frontend, API, PostgreSQL, LocalStack/S3/SQS, worker e media runner.

## Cenário principal

O teste `cortes-ia-web/e2e/full-flow.spec.ts` executa:

1. cadastro no navegador;
2. recebimento do e-mail no Mailpit;
3. confirmação do e-mail usando o link transacional real;
4. login;
5. upload multipart de um MP4 sintético;
6. validação da fonte pelo worker;
7. cálculo da cotação;
8. reserva de créditos;
9. processamento com provider fixture determinístico;
10. criação de preview real pelo FFmpeg;
11. abertura do corte no editor;
12. seleção e salvamento de nova revisão;
13. solicitação de exportação final;
14. espera pelo render;
15. download da exportação pela URL assinada do storage.

O teste não usa Ollama, OpenAI, YouTube externo ou pagamento real.

## Perfil E2E

`compose.e2e.yaml` sobrescreve apenas dependências não determinísticas:

```yaml
AI_RUNTIME_PROFILE: FIXTURE
AI_PROVIDER: fixture
TRANSCRIPTION_PROVIDER: fixture
YOUTUBE_ENABLED: false
```

Todo o restante — banco, filas, storage, worker e FFmpeg — roda de verdade.

## Executar localmente

Requisitos: Docker Compose, Node 22+, Python 3.12+, FFmpeg.

```bash
python scripts/bootstrap.py
docker compose -f compose.yaml -f compose.e2e.yaml up -d --build

cd cortes-ia-web
npm install --package-lock-only
npm ci
npx playwright install chromium
npm run e2e
```

Ao terminar:

```bash
docker compose -f compose.yaml -f compose.e2e.yaml down -v --remove-orphans
```

Use um ambiente descartável. O E2E cria conta, carteira, projeto e objetos no storage local.

## Diagnóstico

Em falha no GitHub Actions:
- Playwright mantém trace, screenshot e vídeo do navegador;
- o workflow publica os artifacts;
- os últimos logs de todos os containers são impressos;
- a stack é destruída com volumes ao final.

Esse teste não substitui smoke tests de providers externos. YouTube, Mercado Pago, SES e modelos reais precisam de homologação própria.
