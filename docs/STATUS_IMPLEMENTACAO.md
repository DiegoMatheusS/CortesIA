# Status real da implementação — SliceFlow v0.5

Este documento descreve o que existe **no código atual**. Itens ainda não homologados para produção continuam pendentes mesmo quando a base técnica já existe.

| Fase | Implementado atualmente | Principais pendências |
|---|---|---|
| 1 Fundação | API .NET 10/Identity/EF, cadastro, confirmação de e-mail, login/logout/reset, CPF/HMAC, trial único, **RBAC granular Support/Finance/Security/Admin com MFA**, ownership, UI responsiva, baseline EF versionado e CI com build .NET/Next | Sessões/step-up E2E, política final de telefone e separação da role DDL/runtime em produção |
| 2 Créditos | Carteira por lotes, comprado/bônus separados, quote discriminada, reserve/capture/refund, ledger, idempotência, ajuste admin e estorno de extra não entregue | Testes ampliados de concorrência/replay, catálogo comercial versionado, combos/promoções e regras comerciais finais |
| 3 Upload | Multipart S3, formatos/tamanho/duração validados, **limite técnico de até 7 horas**, upload/link, jobs/outbox/SQS, master privado, status e progresso granular até a UI | Retomar/cancelar upload pela interface, limite atual de 5 GB, limites de concorrência por conta, homologação real de YouTube/S3/SQS e políticas comerciais de importação |
| 4 Agente / IA | Pipeline com **slots independentes por etapa**: transcrição, seleção, segunda revisão e visão. Perfil local usa Faster-Whisper + Ollama, com `qwen3:8b` como padrão separado para seleção/revisão, MediaPipe para visão, JSON estruturado, chunking, validação temporal e redaction básica. | Benchmark ≥50 vídeos, avaliação de qualidade/custo/p95, homologação de outros providers/modelos por etapa, tratamento ampliado de dados incidentais e observabilidade de IA |
| 5 Vídeo | Working master, FFmpeg offline, 9:16/4:5/1:1/16:9/original, segmentos concatenáveis, legenda simples, **legenda dinâmica por palavra**, zoom, blur, capa automática, moods visuais, crop manual, **reenquadramento inteligente com MediaPipe**, previews e ZIP | Golden corpus de codecs/qualidade/performance, empacotar/homologar modelo de visão para produção, melhorar tracking multi-pessoa/cortes complexos e edição avançada de capa |
| 6 Editor | Editor short-form, corte manual, timeline por segmentos, dividir/remover trecho, revisão não destrutiva, desfazer/refazer local, edição de texto/sincronismo, presets de legenda, estilos visuais, crop, histórico, **restauração de revisão como nova revisão**, **seleção de capa a partir de frame real do master**, preview regenerável/versionado e export por revisão | Reposicionamento visual direto sobre o canvas, edição avançada da capa, quote para operações pesadas adicionais e testes E2E completos |
| 7 Pagamentos | Estrutura de checkout Mercado Pago, webhook assinado, grants/bônus e modo local fictício | Homologação real Pix/cartão, conciliação sem webhook, estorno monetário/chargeback e aprovação de preços/contrato |
| 8 Segurança | Ownership, CSRF/MFA, HMAC de CPF, SSRF/DNS, storage privado, audit, adapter antivírus, scans CI, worker token, fencing/leases e validações server-side | Pentest/ASVS, rate limit distribuído, IAM/mTLS, rotação de secrets, ClamAV para arquivos grandes, exclusão completa de conta e testes de retenção/restore |
| 9 Produção | Dockerfiles/Compose, modo local leve, modo local IA real, Terraform base, CI com backend/web/workers/security/Terraform, **CI de migrations com apply/rollback/drift**, runbooks iniciais e módulo transacional de notificações | ECS/services finais, domínio/TLS/WAF, SES, IAM mínimo, observabilidade completa, homologação de rollback/restore em produção, RPO/RTO e smoke de produção |

## Produto e frontend

O nome público do produto é **SliceFlow**. Os diretórios e namespaces internos ainda usam `cortes-ia-*` para evitar uma renomeação técnica desnecessária durante o desenvolvimento.

A Home possui narrativa pinned controlada por scroll, fundo interativo, demonstração do fluxo IA + editor, tutorial, presets de legenda e estilos visuais. O CTA abre a criação antes do login; autenticação é solicitada quando o usuário inicia upload/importação.

O dashboard separa créditos comprados, bônus, benefícios e reservados. A tela do projeto recebe progresso granular do worker e o editor salva revisões reais no backend.

## IA local atual

Configuração padrão aprovada:

```env
AI_RUNTIME_PROFILE=LOCAL
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:8b
```

Não existe fallback automático para `qwen3:4b` ou `qwen3:1.7b`.

No perfil local completo:
- Faster-Whisper faz transcrição;
- `qwen3:8b` faz seleção/revisão semântica;
- MediaPipe pode gerar o plano de reenquadramento;
- FFmpeg executa os renders determinísticos.

## Legendas dinâmicas

Quando o extra é usado, timestamps por palavra são preservados quando o transcritor os fornece. O render ASS usa sincronismo por palavra. Conteúdo legado, fixture ou texto alterado manualmente usa alinhamento proporcional como fallback explícito.

A edição manual de uma legenda invalida os word timings anteriores daquele texto para impedir sincronismo enganoso.

## Reenquadramento inteligente

O tracking é habilitado somente quando o ambiente declara `TRACKING_ENABLED=true` e possui provider de visão. A visão retorna pontos normalizados ao longo do tempo; não gera shell nem comandos FFmpeg.

Se nenhuma prévia da execução entregar o tracking, o extra é marcado como não entregue para o fluxo de estorno existente.

## Verificado no CI

O workflow atual valida, em conjunto:

- testes .NET com PostgreSQL;
- build e typecheck do Next.js;
- testes Python/FFmpeg com vídeo sintético real;
- render de múltiplos segmentos;
- preview por revisão;
- crop dinâmico de tracking;
- legenda dinâmica por palavra;
- segurança com Gitleaks/Trivy;
- `terraform validate`.

Os últimos PRs desses recursos passaram o workflow completo antes do merge.

## Próximos gates recomendados

1. Testes E2E navegador → API → worker → storage.
2. Benchmark real de qualidade da IA e tracking.
3. Reposicionamento visual direto no canvas e edição avançada de capa.
4. Homologação de pagamento e infraestrutura de produção.
5. Separar role de migration/DDL da role runtime e homologar backup/restore.

Não abrir o serviço ao público apenas porque os containers e o CI passam; pagamentos, políticas jurídicas, rollback/restore e operação de produção ainda exigem homologação.


## Pontos ainda frágeis / incompletos

| Tema | Estado atual |
|---|---|
| Migrations EF | **Baseline implementado e versionado.** `--init-db` usa `MigrateAsync()`; CI aplica, reverte e checa drift. Falta homologar adoção de banco legado que precise ser preservado e separar permissões DDL/runtime em produção. |
| YouTube | Host/URL e segurança estão preparados, mas o feature flag local continua desligado e falta homologação ponta a ponta. |
| Legenda dinâmica | **Implementada.** Timestamps por palavra quando disponíveis e fallback proporcional explícito. |
| Tracking / reenquadramento | **Implementado**, condicionado a provider de visão habilitado. Ainda falta homologação de qualidade/multi-pessoa. |
| Pagamentos reais | Estrutura Mercado Pago existe, mas homologação real Pix/cartão, conciliação completa e chargeback ainda estão pendentes. |
| RBAC granular | **Implementado no backend e painel operacional**: Support, Finance, Security e Admin, todos com MFA; escrita exige step-up recente. Falta ampliar testes E2E de autorização/negação. |
| Testes C# | Existem e rodam no CI com PostgreSQL isolado; o ambiente de teste exige banco `cortes_test` quando executado manualmente. |
| OpenAPI | Exposto em desenvolvimento; fora de desenvolvimento permanece restrito a Admin. |
| Notificações | Central interna, preferências e principais eventos transacionais estão implementados. Ainda faltam sinais reais de login suspeito e homologação do provedor de e-mail de produção. |

## Limite de vídeo longo

O limite técnico passa a ser **7 horas**. O limite de arquivo continua em **5 GB**. Em produção, vídeos acima de 90 minutos continuam dependentes de aprovação explícita da política comercial; em desenvolvimento/homologação é possível testar o pipeline longo sem esse bloqueio.

## Notificações transacionais

O backend agora separa evento, categoria, leitura, visibilidade interna, política de e-mail e estado de envio. O sino na plataforma e o e-mail usam a mesma origem. Estados intermediários de progresso não disparam e-mail.

Preferências configuráveis: processamento, suporte, saldo baixo e marketing. Segurança, pagamentos/créditos críticos e armazenamento são obrigatórios.

Detalhes em `docs/NOTIFICACOES_TRANSACIONAIS.md`.
