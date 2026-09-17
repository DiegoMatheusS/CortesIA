# Contratos 0.1

`openapi.json` é um contrato de desenho OpenAPI 3.1, não uma API já executável. Endpoints internos exigem autenticação workload; `serviceAuth` representa mTLS, a provisionar no ingresso privado. A sessão pública é cookie opaco. Swagger administrativo deve permanecer restrito.

Schemas de configuração, render e políticas têm limites configuráveis: os números finais dependem de D15. Nos DTOs de administração, objetos livres são somente drafts com schemaVersion; publicar exige validação tipada de domínio. Nunca executar um comando/filtro recebido do catálogo.

`configurationVersion` e If-Match previnem edição perdida; Idempotency-Key garante resposta repetível em comandos. Retenção HTTP não substitui dedupe permanente por operação financeira/pagamento/job. Algumas respostas 202 usam `TaskAccepted` em vez do recurso final; acompanhar statusUrl e recurso correspondente. Exemplos UUID são fictícios.

Para upload, a API devolve `uploadUrl` e cabeçalhos necessários apenas ao titular. Validação final usa o objeto real. Para cartão, `paymentToken` é token de uso restrito emitido pelo SDK do gateway; não é PAN/CVV. Payload bruto de webhook segue o provedor e é validado pela assinatura e reconciliação, por isso não recebe schema de negócio inventado neste pacote.

Manifestos de jobs ficam privados no storage; mensagens contêm somente IDs opacos. Os JSON Schemas são estritos e não aceitam propriedades extras. Timestamps/ownership/entitlements e fencing exigem validação semântica, além do schema. IA nunca escolhe object keys arbitrárias.

## Erros de domínio

| Code | HTTP | Comportamento |
|---|---:|---|
| VALIDATION_ERROR | 400 | Corrigir campos |
| SESSION_REQUIRED | 401 | Autenticar |
| STEP_UP_REQUIRED / ROLE_DENIED / CSRF_INVALID | 403 | Reautenticar ou negar |
| RESOURCE_NOT_FOUND | 404 | Não revelar recurso alheio |
| QUOTE_STALE / IDEMPOTENCY_CONFLICT / INSUFFICIENT_CREDITS | 409 | Reobter quote ou corrigir requisição |
| MEDIA_EXPIRED | 410 | Mostrar indisponibilidade, não cobrar retry impossível |
| REVISION_CONFLICT | 412 | Recarregar revisão |
| FILE_TOO_LARGE | 413 | Aplicar limite público |
| UNSUPPORTED_MEDIA | 415 | Formato não suportado |
| SOURCE_RESTRICTED / INVALID_TIME_RANGE | 422 | Explicar restrição sem infraestrutura interna |
| RATE_LIMITED | 429 | Respeitar Retry-After |
| PROVIDER_UNAVAILABLE | 503 | Retry controlado, sem novo débito |

## Eventos e manifestos

Comando `stage` admite validação, importação, áudio, transcrição, seleção, revisão, prévia, render, capa e bundle. Resultado de seleção deve guardar candidatos/reasons em objeto privado; saída inline da fila contém somente referências e métricas.

Manifesto de entrada: schemaVersion, jobId, projectId, generation, inputAssets (assetId, hash, size), configurationVersion, revisionId quando aplicável, plan (estrutura validada), policyVersion e budgets. Credenciais/URLs efêmeras são emitidas pelo endpoint interno após lease e não persistidas no manifesto.

Manifesto de saída: schemaVersion, jobId, attemptId, leaseToken, outputs (assetId, kind, hash, size, metadata), resultCode e métricas. `.NET` valida a associação à tentativa e os objetos permitidos antes de publicar resultados. Receber `succeeded` não transforma automaticamente um caminho arbitrário em mídia confiável.
