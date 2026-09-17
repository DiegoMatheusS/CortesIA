# Integrações externas

## OpenAI

Criar `compose.override.yaml` local (sem commitar segredos):

```yaml
services:
  worker:
    environment:
      AI_PROVIDER: openai
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      TRANSCRIPTION_MODEL: gpt-transcribe
      TRIAL_SELECTION_MODEL: gpt-5.6-terra
      PAID_SELECTION_MODEL: gpt-5.6-sol
      AI_MAX_CALLS: "60"
```

Os nomes seguem os anexos e ficam configuráveis. O adaptador requer transcrição com timestamps de segmento em resposta verbose_json; se o modelo configurado não suportar esse contrato, retorna erro explícito e a execução deve compensar créditos. Homologar endpoint/model ID e capacidade na conta real antes de habilitar; não há troca silenciosa para modelo diferente. Dinâmica por palavra requer alinhamento ainda não implementado. Pagos/grátis não são escolhidos pelo modelo; a API informa modalidade.

Transcrição de áudio pode conter PII incidental: máscara regex no texto antes da seleção não garante anonimização do áudio enviado para transcrever. D25 continua exigindo decisão e revisão de privacidade. Nunca enviar dados cadastrais/financeiros como contexto.

## Mercado Pago

Modo real: `PAYMENTS_MODE=mercadopago`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_COLLECTOR_ID`, `MP_WEBHOOK_URL` HTTPS e `PUBLIC_URL`; `MP_SANDBOX=true` usa link de sandbox retornado pelo gateway. Checkout hospedado evita cartões passando pela API; testar Pix e cartão na conta habilitada. Callback do navegador não libera crédito. O webhook é assinado e depois consultado server-to-server.

A conciliação inicial reprocessa eventos recebidos ainda pendentes; busca ativa de compras sem evento, reembolso monetário automatizado e tratamento completo de créditos gastos após chargeback precisam ser concluídos. Eventos de reversão bloqueiam conta e geram auditoria para revisão; não inventam saldo negativo.

## YouTube

`YOUTUBE_ENABLED=true` somente em ambiente de homologação autorizado. Usa adaptador específico, nenhum cookie/credencial para ultrapassar bloqueio; metadados e formato HTTPS MP4 muxado acessível. URLs e resolução DNS validadas; transferências usam conexão HTTPS com IP validado e SNI correto. Alguns vídeos não oferecem o formato/capacidade exigidos e serão bloqueados. Não promete suporte universal.

## Antivírus

Subir `docker compose --profile antivirus up --build` e definir `SCAN_MODE=required` no worker. O adapter INSTREAM falha fechado quando scanner retorna erro/limite/indisponibilidade. Homologar suporte efetivo a arquivos de 5 GB: configurar limites não garante que a versão do ClamAV aceite a faixa toda. Se necessário, implementar scanning local por volume/engine compatível; não desabilitar scan em produção para contornar limite.

## Documentação usada

- [AWS SDK SQS .NET](https://www.nuget.org/packages/AWSSDK.SQS)
- [AWS SDK S3 .NET](https://www.nuget.org/packages/AWSSDK.S3/4.0.20.4)
- [Npgsql EF 10](https://www.npgsql.org/efcore/release-notes/10.0.html)
- [Mercado Pago webhooks](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks)
- [yt-dlp no PyPI](https://pypi.org/project/yt-dlp/)

Versões diretas foram declaradas no código; restore/build, dependências transitivas, imagens e ações CI ainda precisam de homologação e lockfiles/digests.
