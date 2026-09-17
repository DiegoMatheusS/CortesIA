# Fase 9 — implantação e gates

Terraform neste pacote provisiona a fundação AWS: rede, RDS privado/Multi-AZ/backups, S3 privado, SQS/DLQ, ECR, cluster ECS, Secrets Manager, logs e alarmes. **Não publica o aplicativo nem cria domínio automaticamente.** Não execute `apply` sem revisar custo, região e plano. NAT, RDS Multi-AZ e logs geram custo.

Antes de ECS: compilar e homologar todos os containers; promover por digest; gerar/revisar migration EF em staging (bootstrap EnsureCreated é só banco vazio); separar role DDL e runtime; não usar usuário mestre RDS na aplicação.

API e frontend: Fargate atrás de ALB TLS com certificado ACM e regras de rota para `/api` e web. Configurar DNS no Route53/provedor; WAF e headers CSP ajustados aos assets. Não expor `/internal` pelo ALB público; permitir worker somente em ingresso privado com autenticação workload. Token compartilhado fornecido é integração local; trocar por mTLS/IAM para produção.

Worker e mídia: ECS EC2 com tarefas separadas ou task bridge com volume compartilhado controlado e `disableNetworking=true` no container media; nunca dar ao FFmpeg as credenciais do worker. Fargate `awsvpc` compartilha rede entre containers e não reproduz o isolamento offline do Compose automaticamente. Homologar o runtime antes de escolher o capacity provider. Limpar tasks órfãs e dimensionar disco temporário para originais/masters de 5 GB.

Segredos: configurar `CPF_HMAC_KEY`, `WORKER_TOKEN` (somente local até mTLS), OpenAI, Mercado Pago, SMTP/SES e DSN como secrets. Persistir/proteger chave Data Protection da API. Não alterar CPF_HMAC_KEY sem plano de rotação/migração: quebraria dedupe de benefício.

Modo real: `ASPNETCORE_ENVIRONMENT=Production`, `AI_PROVIDER=openai`, `PAYMENTS_MODE=mercadopago`, `SCAN_MODE=required`; o código proíbe fixture/local payments fora de Development. `YOUTUBE_ENABLED=true` somente após validar acesso e política da plataforma. Não contornar bloqueios.

Backups: RDS retém 14 dias na configuração inicial. Aprovar RPO/RTO, exercitar PITR em instância isolada, verificar ledger e reaplicar tombstones antes de reabrir. Testar restore e documentar tempos. Alteração de schema deve ser expand/contract.

Alertas: DLQ e idade da fila estão em Terraform. Completar alarmes de erros API/provider, custo, CPU/disco, conciliação, fraude, acesso admin e retenção. Confirmar inscrição SNS. Dedupe e auditoria de entregas de e-mail precisam de teste antes do lançamento.

Rollback: retornar digest anterior, pausar consumidor/novos jobs, não reverter ledger nem apagar migrations. Retry técnico mantém execução e cobrança original. Reconciliação compara lotes/projeção/ledger, pagamentos e reservas.

Esta é uma entrega de código inicial. Nenhum ambiente AWS, DNS ou pagamento real foi ativado nesta conversa. Gates não comprovados estão em `docs/STATUS_IMPLEMENTACAO.md`.
