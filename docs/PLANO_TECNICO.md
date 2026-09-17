# Plano técnico atualizado v0.2 — 17/09/2026

Fonte mais recente: `DECISOES_APROVADAS_v0.2.txt`. Prevalece em D01/D02/D07/D08/D15/D16/D19. Os PDFs de requisitos e segurança continuam sendo a base. O plano v0.1 em `baseline/` é histórico e não prevalece sobre este documento. Nenhuma funcionalidade foi removida do backlog por não estar pronta nesta primeira entrega de código.

## Decisões encerradas

| ID | Estado | Regra vigente |
|---|---|---|
| D01 | RESOLVIDO/APROVADO | Original pode sair 48h após primeiro processamento concluído, somente com master de trabalho completo durável e privado; master sustenta edição/novos cortes e segue retenção por atividade. Sem master após limpeza, novo envio/importação. |
| D02 | RESOLVIDO/APROVADO | Extras por execução PER_RUN, não por corte. Breakdown obrigatório. Edições leves gratuitas; trabalho pesado adicional exige nova cotação e confirmação. Redes que usam o mesmo arquivo 9:16 não multiplicam cobrança. |
| D07 | RESOLVIDO/APROVADO | PURCHASED e PURCHASE_BONUS não expiram. PROMOTION tem validade explícita opcional. TRIAL uma vez por CPF, sem expiração silenciosa. Limpeza de mídia não altera carteira. |
| D08 | RESOLVIDO/APROVADO | Falha interna antes de previews úteis e zero bons cortes: 100%. Retry técnico grátis. Output isolado falho preserva os demais e pode tentar novamente. Extra não entregue em nenhum output estorna apenas seu item. Rejeição subjetiva não estorna automaticamente. Teto do estorno é o cobrado. |
| D15 | RESOLVIDO/APROVADO | 180 min, 5 GB (implementação usa 5.000.000.000 bytes), MP4/MOV/MKV/WebM, até 4K conforme codecs. Final até 1080p quando fonte permitir, sem qualidade nativa fictícia por upscale. Validação server-side. |
| D16 | RESOLVIDO/APROVADO | YouTube primeiro adaptador, somente se permitido e tecnicamente acessível. Metadados/restrições → duração/cotação → confirmação → ingestão/processamento. Sem fetch genérico ou bypass. |
| D19 | RESOLVIDO/APROVADO | NO_SUITABLE_CLIPS é outcome próprio, não pane técnica; estorno integral, histórico e explicação. |

Demais D03–D25 não foram aprovadas implicitamente pelo documento v0.2. Permanecem com o estado anterior, exceto as sete acima. Em particular: preço acima de 90 min, composição do Premium, modelo/regras de saldo misto, SMS, preços comerciais, políticas jurídicas e dados incidentais da transcrição exigem suas decisões específicas. Configurações provisórias de desenvolvimento são identificadas, não novas regras comerciais.

## Arquitetura implementada nesta base

Browser/Next → API .NET/Identity/EF → PostgreSQL (metadados, lotes, ledger, projetos, outbox) → SQS jobs → worker Python → spool privado de tarefa → FFmpeg offline → S3 privado → manifesto de evento → SQS events → consumidor .NET. Redis está provisionado localmente para evolução do rate limit distribuído; não é usado para garantir saldo.

A API decide autenticação, ownership, cotação, reservas, captura e estorno. Python nunca escreve na carteira ou no banco. Os containers media não recebem credenciais e usam network_mode:none no Compose. API interna local usa segredo separado; mTLS/IAM é gate de produção. Eventos de fila carregam IDs/referências, não transcrição nem CPF.

No código inicial, INGEST/PROCESS/ALTERNATIVES/RENDER/BUNDLE são jobs mais agregados que os jobs por etapa do desenho-alvo. As subetapas Python permanecem separadas em funções. A extração por stage/fila, telemetria fina e state machine completa estão no backlog, sem afirmar que já foram implementadas.

## Crédito e consistência

Carteira serializada por row lock PostgreSQL. Lotes com available/reserved; ledger append-only por operação/lote. Reserva, execução e outbox no mesmo commit. Compra/grant usa chave única; estorno item + run idempotente. Captura ocorre ao entregar previews úteis; zero candidatos libera tudo. Valores ficam em inteiros; reais em centavos.

Banco contém outcomes SUCCESS, NO_SUITABLE_CLIPS, SYSTEM_FAILURE, SOURCE_RESTRICTED e USER_CANCELLED. O runtime grava textos controlados no domínio; o DDL-alvo possui CHECK explícito. A interface distingue nenhum trecho de erro/restrição.

SQS pode redeliver. Lease com fencing impede aceitar tentativa antiga. Heartbeat e watchdog recuperam worker morto. Manifestos/outputs têm prefixo por job/fence; .NET verifica objetos e tamanho. Retry de export mantém o export/revisão e não cria cobrança. Idempotência de todos os fluxos e concorrência ainda exigem execução de testes .NET/DB e cenários adversariais, não apenas leitura de código.

## Retenção

Originais com 48h e master presente são apagados; master de vídeo completo e artefatos ficam até política de atividade. Avisos 105/115/119 com chave por ciclo; limpeza 120 dias. A rotina serializa cutoff com atividade de conta e registra auditoria. Exclusão verifica objetos registrados e prefixo de manifestos/outputs. Retenção de logs, backups, PII financeira e pedidos completos LGPD continua gate jurídico/operacional. Arquivos de spool órfãos requerem janitor operacional.

## Repositórios e contratos

Cinco pastas correspondem aos cinco repositórios propostos. `cortes-ia-contracts/design/openapi.json` é contrato-alvo atualizado; não alegação de todos os endpoints implementados. OpenAPI real é gerado pelo ASP.NET em `/api/openapi/v1.json`. `API_IMPLEMENTADA.md` lista os endpoints escritos e seus DTOs. Modelo EF executável e DDL-alvo estão separados intencionalmente; não aplicar ambos no mesmo schema.

## Segurança

Cookies HttpOnly/SameSite e Secure em produção; CSRF; Identity/lockout/reset; MFA admin; HMAC CPF; antifraude de grant; ownership; assinatura/reconciliação de pagamento; quarantine/antivírus; domínio/IP/redirect do importador; FFmpeg com argv e sandbox offline; constraints/ledger auditável; budget de chamadas do provider. Os controles têm níveis diferentes de validação descritos no relatório. Não há certificação ASVS, pentest, homologação de gateway, deploy AWS ou garantia de produção nesta entrega.
