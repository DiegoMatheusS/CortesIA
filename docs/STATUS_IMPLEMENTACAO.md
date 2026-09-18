# Status real da implementação — SliceFlow v0.5

Este documento descreve o que existe **no código atual**. Itens ainda não homologados para produção continuam pendentes mesmo quando a base técnica já existe.

| Fase | Implementado atualmente | Principais pendências |
|---|---|---|
| 1 Fundação | API .NET 10/Identity/EF, cadastro, confirmação de e-mail, login/logout/reset, CPF/HMAC, trial único, MFA administrativo, ownership, UI responsiva e CI com build .NET/Next | Migrations EF versionadas para homologação/produção, RBAC granular, sessões/step-up E2E e política final de telefone |
| 2 Créditos | Carteira por lotes, comprado/bônus separados, quote discriminada, reserve/capture/refund, ledger, idempotência, ajuste admin e estorno de extra não entregue | Testes ampliados de concorrência/replay, catálogo comercial versionado, combos/promoções e regras comerciais finais |
| 3 Upload | Multipart S3, formatos/tamanho/duração validados, upload/link, jobs/outbox/SQS, master privado, status e progresso granular até a UI | Retomar/cancelar upload pela interface, limites de concorrência por conta, homologação real de YouTube/S3/SQS e políticas comerciais de importação |
| 4 Agente / IA | Perfil local real Faster-Whisper → Ollama `qwen3:8b`, JSON estruturado, chunking, segunda revisão, validação temporal, redaction básica e fallback fixture de desenvolvimento. Integração cloud timestamped preparada com `whisper-1` | Benchmark ≥50 vídeos, avaliação de qualidade/custo/p95, homologação dos providers cloud, tratamento ampliado de dados incidentais e observabilidade de IA |
| 5 Vídeo | Working master, FFmpeg offline, 9:16/4:5/1:1/16:9/original, segmentos concatenáveis, legenda simples, **legenda dinâmica por palavra**, zoom, blur, capa automática, moods visuais, crop manual, **reenquadramento inteligente com MediaPipe**, previews e ZIP | Golden corpus de codecs/qualidade/performance, empacotar/homologar modelo de visão para produção, melhorar tracking multi-pessoa/cortes complexos e edição avançada de capa |
| 6 Editor | Editor short-form, corte manual, timeline por segmentos, dividir/remover trecho, revisão não destrutiva, desfazer/refazer local, edição de texto/sincronismo, presets de legenda, estilos visuais, crop, histórico de revisões, preview regenerável/versionado e export por revisão | Restaurar revisão antiga pela UI/API, edição/seleção de capa, reposicionamento visual direto sobre o canvas, quote para operações pesadas adicionais e testes E2E completos |
| 7 Pagamentos | Estrutura de checkout Mercado Pago, webhook assinado, grants/bônus e modo local fictício | Homologação real Pix/cartão, conciliação sem webhook, estorno monetário/chargeback e aprovação de preços/contrato |
| 8 Segurança | Ownership, CSRF/MFA, HMAC de CPF, SSRF/DNS, storage privado, audit, adapter antivírus, scans CI, worker token, fencing/leases e validações server-side | Pentest/ASVS, rate limit distribuído, IAM/mTLS, rotação de secrets, ClamAV para arquivos grandes, exclusão completa de conta e testes de retenção/restore |
| 9 Produção | Dockerfiles/Compose, modo local leve, modo local IA real, Terraform base, CI com backend/web/workers/security/Terraform e runbooks iniciais | ECS/services finais, domínio/TLS/WAF, SES, IAM mínimo, observabilidade completa, migrations/rollback, restore/RPO/RTO e smoke de produção |

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

1. Restaurar uma revisão histórica como **nova revisão**, sem sobrescrever histórico.
2. Seleção/edição de capa a partir do master.
3. Migrations EF versionadas e baseline de banco.
4. Testes E2E navegador → API → worker → storage.
5. Benchmark real de qualidade da IA e tracking.
6. Homologação de pagamento e infraestrutura de produção.

Não abrir o serviço ao público apenas porque os containers e o CI passam; pagamentos, migrations, políticas jurídicas e operação de produção ainda exigem homologação.
