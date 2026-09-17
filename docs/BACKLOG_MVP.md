# Backlog reordenado nas nove fases

E00: D01, D02, D07, D08, D15, D16 e D19 resolvidos. Não pedir aprovação novamente. Demais decisões mantêm seu estado; v0.2 não aprovou preços ou políticas não citados. A implementação inicial não remove tickets não concluídos.

| Fase | Entregas e critérios de conclusão | Dependência |
|---|---|---|
| 1 Fundação | Build limpo; Identity/DB/migrations; cadastro/verificação/login/reset/logout; CPF/HMAC/trial único; MFA admin; testes de ownership/CSRF/revogação; UI responsiva. | Decisões técnicas e ambiente |
| 2 Créditos | Lotes separados; comprado/bônus sem validade; quote PER_RUN discriminada; reserve/capture/release/refund; combos sem duplicar; 100 replays/corridas não duplicam nem deixam saldo negativo; D08 e teto de estorno provados em DB real. | F1 |
| 3 Upload | Multipart até 5GB, formatos aprovados, max180min/4K server-side, histórico imediato, botões bloqueados; fila/outbox; YouTube metadata/restrições antes da confirmação; SSRF/rebinding e MIME falsos recusados; storage privado. | F1/F2 |
| 4 Agente | Timestamps, candidatos e segunda revisão, Terra/Sol por modalidade, budgets, schema, prompt injection; zero bons cortes outcome NO_SUITABLE_CLIPS e 100% devolvido; retry sem cobrança; fixture independente da API. | F3 |
| 5 Vídeo | Original → master completo durável; preview/render, 9:16/4:5/1:1/16:9/original; legenda simples/dinâmica, zoom/blur/tracking/capa; FFmpeg offline; propriedades e qualidade em golden corpus; preservar outputs bons em falha parcial. | F4 |
| 6 Editor | Assistir/selecionar/rejeitar/buscar outros; título/tempos/legenda/crop/capas/efeitos; edits leves grátis; pesado só com nova quote; master disponível até retenção; revisão concorrente recusada; export multiplataforma sem multiplicar cobrança do mesmo arquivo e ZIP seguro. | F5 |
| 7 Pagamentos | Pix e cartão homologados; assinatura/replay/valor/moeda/recebedor verificados; grant único; bônus sem expiração; conciliação mesmo com webhook perdido; estornos monetários/chargeback; sem PAN/CVV no inventário. | F2; integrar antes do lançamento |
| 8 Segurança | Hardening de controles já iniciados em F1: rate limit distribuído, RBAC, auditoria, scan upload, quotas, SSRF, secrets, rotação, ASVS/pentest, account deletion, retenção105/115/119/120, termos e consentimento. Backups/restore e incident tabletop comprovados. | Transversal F1–F7 |
| 9 Produção | AWS/app services/roles/TLS/domínio/WAF/SES/logs/alertas; CI scans/build/tests/migration/rollback; benchmark50vídeos e custo p95 nas faixas; smoke completo; todos os MUST resolvidos. | F1–F8 |

## Regras obrigatórias de teste de D08

1. Falha antes de preview: devolução integral uma única vez.
2. Nenhum bom trecho: outcome próprio, mensagem aprovada e devolução integral.
3. Timeout/redelivery/worker morto: retry sem segundo débito.
4. Um export falha: bons outputs preservados; mesmo resultado pode tentar novamente sem recobrar.
5. Extra falha em todos os outputs: estorno do item, base mantida quando entregue.
6. Usuário rejeita cortes tecnicamente válidos: sem estorno automático por gosto; buscar outros conforme limites.
7. Soma de estornos nunca supera valor da execução; mesmas chaves não repetem.

## Retenção aprovada

Antes de remover original48h, provar master completo e utilizável. Editar e buscar outros depois de 48h deve continuar funcionando. Após120dias sem atividade, remover master e todos os artefatos e manter carteira. Simular login disputando cutoff, storage parcialmente indisponível, e-mail falho, retry e restore de backup com tombstones.

## Escopo que não pode desaparecer

RF01–RF47/RN01–RN25/RNF01–RNF14/UC01–UC25/CA01–CA20, controles SEC e Home H1–H20 seguem rastreados. Ver `RASTREABILIDADE.csv`. Critério mínimo9:16 não autoriza retirar outros formatos; pagamento por um método no teste mínimo não retira Pix/cartão. Recursos avançados não implementados nesta entrega são pendências, não cancelamentos.
