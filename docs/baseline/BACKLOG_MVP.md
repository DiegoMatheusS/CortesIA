# Backlog do MVP e critérios de conclusão

Ordem sugerida por dependência, sem remover funcionalidades dos anexos. Estimativas de prazo não foram inventadas: dependem de equipe, corpus de vídeo e decisões de produto. Cada etapa vira um épico; os itens listados são tickets implementáveis. E00–E14 são códigos usados na matriz de rastreabilidade.

**Definition of Done de todo ticket:** código revisado; build/lint aprovados; testes proporcionais ao risco; tratamento de erro; autorização e validação; observabilidade sem PII; documentação/contrato/migration atualizados quando mudam; evidência anexada ao PR. Trabalho visual inclui desktop/mobile/teclado/reduced-motion. “Pronto” não significa apenas endpoint retornar 200.

## E00 — Decisões de domínio e contrato de escopo

**Depende de:** anexos. **Responsáveis:** produto + tech lead + segurança, jurídico nos pontos pertinentes.

- Registrar D01–D25 com responsável, alternativa escolhida e data.
- Fechar retenção versus edição, unidade de preço, faixas fracionárias, trial/mistura de créditos, zero candidatos, falhas parciais e reprocessamentos.
- Definir limites, fontes de links, objetivos de carga/RPO/RTO e orçamento; documentar questões jurídicas pendentes sem presumir aprovação.
- Aprovar mapa de telas e design system em Figma conforme R23; contratos nesta versão viram baseline de PR.

**Conclusão:** decisões bloqueantes de fundação registradas; cada pendência restante tem gate explícito; nenhum valor proposto aparece como preço ativo. A cobertura contém todos os RF/RN/RNF/UC/CA e SEC encontrados. O escopo completo prevalece sobre critérios mínimos mais estreitos.

## E01 — Repositórios, ambiente local e CI/CD

**Depende de:** E00 técnico. **Responsáveis:** infra + leads de cada runtime.

- Criar cinco repositórios definidos, ownership, main protegida e revisão obrigatória.
- Inicializar Next/React, .NET 10/EF, Python 3.12 e contratos; fixar versões/lockfiles.
- Compose com PostgreSQL/Redis/S3-SQS simulados, provider/gateway fake e e-mail de teste.
- Pipelines build/lint/testes/SAST/SCA/secrets/container scan; OIDC, ECR e Terraform por ambiente.
- OpenAPI/schema compatibility check; SBOM sugerido desde a primeira release.

**Conclusão:** checkout limpo sobe ambiente documentado; CI executa sem chaves reais e sem cobrança externa; push direto em main bloqueado; segredo de teste e vulnerabilidade crítica de fixture bloqueiam o gate conforme política; imagens identificadas por digest. Nenhuma chamada real de IA em unit tests.

## E02 — Identidade, CPF, sessão e autorização

**Depende de:** E01. **Responsáveis:** backend + frontend + segurança.

- ASP.NET Core Identity, cadastro nome/e-mail/telefone/CPF/senha, verificação e recuperação.
- Sessão cookie revogável, logout, CSRF, rate limit, reautenticação e MFA obrigatório admin/financeiro.
- HMAC CPF versionado, máscara, ciphertext apenas se necessário; trial_claim atômico (grant integrado em E03).
- Perfil, alteração sensível com step-up, papéis e políticas por recurso; consentimento versionado.
- E-mails de verificação/reset/alertas com outbox; política de telefone D14.

**Conclusão:** CA01 (com E03); cadastros concorrentes para mesmo CPF não duplicam benefício; reset usado/expirado falha; logout e mudança de senha revogam sessão; cookie possui flags; CSRF cross-site recusado; admin sem MFA não entra; resposta não enumera CPF/e-mail. CPF não aparece em logs, fila, analytics ou provider.

## E03 — Catálogo, carteira, cotação e ledger

**Depende de:** E02 e decisões D02/D03/D06/D07/D08/D17/D19. **Responsáveis:** backend + produto.

- Migrations de catálogo/versionamento, wallet/lots/reservations/ledger e idempotência.
- Grant trial 10 único; compras/promo/bônus separados; saldo e extrato.
- Faixas 10/30 e proposta 60 draft; extras e combos sem dupla cobrança; pacote base/bônus/total/preço.
- Quotes imutáveis vinculadas a fonte/configuração e calculadora frontend.
- Reserve/capture/release/refund/expire/adjust em transação; projeções reconciliáveis.

**Conclusão:** CA05/13/16/17; limites exatos 30:00.000, 30:00.001, 90:00.000 e 90:00.001 testados; manipular preço no cliente não altera cobrança; 100 requisições com mesma chave geram um efeito; duas reservas simultâneas não deixam saldo negativo; mesmo erro não estorna duas vezes; total estornado ≤ capturado; comprado não expira; limpeza não altera carteira. Crash antes/depois do commit não cria débito órfão.

## E04 — Compra Pix/cartão e conciliação

**Depende de:** E03. **Responsáveis:** backend + frontend + financeiro.

- Checkout tokenizado, compra com snapshot e chave do gateway, Pix e cartão.
- Webhook assinado, inbox, replay protection, consulta server-to-server e grant único.
- Compra pendente/aprovada/rejeitada/expirada/cancelada/reembolsada/chargeback.
- Conciliação periódica, estorno monetário separado de crédito técnico, notificação e histórico.

**Conclusão:** CA02/19 em sandbox para os dois meios; retorno do navegador nunca credita; webhook falso/valor/BRL/recebedor divergentes não creditam; mesmo paymentId com eventIds distintos credita uma vez; evento atrasado não ressuscita reembolso; pagamento aprovado com webhook perdido é recuperado por reconciliação. Nenhum PAN/CVV em schema/logs. Política de créditos já gastos em chargeback definida.

## E05 — Upload privado, validação e histórico

**Depende de:** E02/E03; pode desenvolver UI com contratos antes de E04. **Responsáveis:** mídia + backend + frontend.

- Sessão de upload/quarentena, nome UUID, URL curta, multipart/resume conforme tamanho aprovado.
- Validação server-side de tamanho/container/MIME/codec/duração via ffprobe sandbox; scan quando aplicável.
- Histórico imediato, progresso e bloqueio de segundo upload na mesma tela; abort e limpeza de multipart.
- Cotação verificada pós-ingestão, sem custo de IA antes de confirmar; código público de erro claro.

**Conclusão:** CA03/06; arquivo válido aparece no histórico ao aceitar; upload interrompido não inicia IA nem perde créditos; extensão falsa/truncado/oversize rejeitados; nomes hostis não viram paths/shell; bucket privado; usuário B não conclui sessão nem lê arquivo de A; timeout não derruba worker. Validação não aceita duração do browser como verdade.

## E06 — Importação por link com proteção SSRF

**Depende de:** E05 e D16. **Responsáveis:** mídia + segurança.

- Adaptadores permitidos, preflight de metadados e indicação de restrições.
- DNS/IP pinning, allowlist, redirects validados, egress, limites de resposta/banda/tempo.
- Registro no histórico, importação em fila, nova validação do conteúdo; fonte restrita sem consumo.

**Conclusão:** CA04; ao menos uma fonte aprovada funciona com fixture e caso autorizado real; bloqueios da plataforma não são contornados; suite IPv4/IPv6/IPv4-mapped/DNS rebinding/redirect/metadata/credentials passa; domínio fora da lista não é conectado. Restrição tardia libera reserva idempotentemente, se houver.

## E07 — Orquestração e agente IA

**Depende de:** E03/E05; E06 adiciona fontes. **Responsáveis:** backend + IA.

- Outbox/inbox, SQS por etapa/DLQ, leases/fencing, heartbeat, watchdog, retry/deadline e circuit breaker.
- Extração de áudio, transcrição timestamped, provider interface, prompts/model IDs versionados.
- Geração de candidatos e segunda revisão; qualidade/contexto/início-fim/repetição; justificativa simples.
- Modalidade grátis/paga e budgets; JSON/Pydantic/timebounds; sinais auxiliares quando viáveis; fechar D25 sobre conteúdo incidental antes de IA em nuvem.
- Execução standalone com fixture; contadores de custo/latência; outcome zero candidatos.

**Conclusão:** CA07/18/19; transcrição de teste executa sem .NET; morte do worker em cada fronteira não duplica cobrança; evento antigo não vence fencing novo; mensagem repetida é no-op; provider timeout/429/JSON inválido recebe tratamento limitado; injeção falada não habilita tool; timestamps inválidos não chegam ao FFmpeg. Cobrança só no marco aprovado, zero candidatos explicado sem inventar conteúdo.

## E08 — Prévias, editor, legendas e efeitos

**Depende de:** E07 e D01/D09/D18/D20. **Responsáveis:** mídia + frontend + IA.

- Quantidades 3/5/10/20/personalizada e duração até 1/1–2/2–3/auto, respeitando qualidade.
- Prévia cortada/legendada/reenquadrada; player e seleção/rejeição; buscar outros evitando rejeitados.
- Revisões de corte com tempos/título/estilo/crop; legenda editar/sincronizar/desativar.
- Dinâmica palavra a palavra, zoom, blur, tracking, capa e combos Básico/Social/Viral/Podcast/Premium.
- Entitlements vinculados à quote; editor não ativa extra não comprado; edição leve gratuita.

**Conclusão:** CA08/09/10/16/17; revisão concorrente com If-Match velho retorna 412; retry de preview não cobra; texto de legenda não injeta filtro/HTML; movimentos/safe area e sincronismo avaliados por golden fixtures; menos trechos bons que quantidade pedida gera menos com explicação. Todas as opções aprovadas existem, sem esconder extras para chamar MVP de concluído. Retenção/edição após expiração tem comportamento aprovado e visível.

## E09 — Exportações finais, múltiplos presets e ZIP

**Depende de:** E08. **Responsáveis:** mídia + backend + frontend.

- Render apenas selecionados, baseado em revision/preset/config imutáveis.
- 9:16, 4:5, 1:1, 16:9 e original; todos destinos de R16; múltiplos selecionáveis.
- Qualidade final 1080p quando fonte permite, safe areas, áudio/legenda e capa.
- Download individual e ZIP privado; grants curtos; retry/erro parcial/compensação.

**Conclusão:** CA11/12/13; ffprobe confirma dimensões/duração/codecs; golden vídeos verificam legenda/crop/áudio; múltiplas redes geram versões corretas; ZIP contém somente arquivos autorizados e nomes seguros; URL expirada falha; delete durante render não ressuscita projeto; export antigo não se mistura com revisão nova; falha interna terminal aciona política de créditos uma vez.

## E10 — Histórico, dashboard, suporte e administração

**Depende de:** E04/E07/E09. **Responsáveis:** backend + frontend + suporte/financeiro.

- Dashboard/perfil com criações, saldo discriminado, vídeos/cortes/capas; histórico e reabrir conforme disponibilidade.
- Tickets gerais/vinculados, oito categorias, imagens em quarentena, mensagens e status.
- Admin usuários/bloqueio/créditos/compras/estornos/filas/retry/custos/config IA e catálogo.
- RBAC, MFA/step-up, motivos/auditoria, acesso excepcional temporal a mídia.

**Conclusão:** CA14/15; suporte sem papel financeiro não ajusta carteira; todos os ajustes/bloqueios/estornos/retries têm actor/alvo/motivo/data/correlationId; admin não apaga audit pela UI; anexos passam validação; ticket não referencia projeto de outra conta; métricas não confundem preview e export. Bloqueio de conta é aplicado no servidor.

## E11 — Home, experiência responsiva, SEO e consentimento

**Depende de:** E00 design, E01; integrar CTAs após E02/E05. **Responsáveis:** frontend + design + produto.

- Implementar H1–H20 preservando água digital, gaveta com pontas, retirada sem mão e scroll.
- Navbar/hero/CTAs/como funciona/diferenciais/redes/créditos/footer; separar da plataforma.
- Mobile/tablet/reduced-motion/GPU fraca, lazy assets e vídeos, teclado/foco/contraste.
- SEO indexável, metadata/canonical/sitemap/robots, analytics consentido e eventos mínimos de R28.

**Conclusão:** revisão visual desktop/mobile; somente 5–15% das pontas visíveis no estado inicial; vídeo escolhido sobe e demais ficam guardados; sem mão/carrossel comum; fallback preserva conteúdo/CTA; WebGL não bloqueia LCP; orçamento de performance medido em hardware-alvo; navegação teclado funciona. Sem consentimento aplicável não carrega marketing; scanner dos eventos não encontra CPF/transcrição/URL assinada. Hover nas pontas continua opcional.

## E12 — Retenção, exclusão e privacidade

**Depende de:** E05/E09/E10 e D01/D12/D13/D22/D23. **Responsáveis:** backend + infra + segurança + jurídico.

- Última atividade/epoch; e-mails 105/115/119; cleanup 120 dias; política de original aprovada.
- Exclusão manual de projeto/conta com tombstone, cancellation, inventário de objetos e retries.
- Retenção separada de dados, ledger, tickets, audit e backups; provider data handling.
- Reaplicar exclusão após restore; limpeza de órfãos/multipart/intermediários/thumbnails.

**Conclusão:** relógio simulado verifica os três avisos uma vez por ciclo; atividade reinicia prazo; corrida login/cleanup testada; 120 dias remove mídia e mantém pagos; delete parcial é retomado e auditado; falha de e-mail e storage alerta. Exclusão inclui áudio/transcrição/derivados previstos, não só vídeo final. Conta excluída não recebe novo trial por lacuna de HMAC, conforme política aprovada.

## E13 — Qualidade, custos, carga e segurança de produção

**Depende de:** E01–E12. **Responsáveis:** QA + segurança + infra + IA + produto.

- Benchmark ≥50 vídeos variados, avaliação humana cega e alternativas Anthropic/Google conforme R24.
- Medir p95 de custo nas faixas 15/30/60/90/180 minutos com/sem efeitos; validar margem e pacote.
- Carga metadados/status/upload/checkout/filas; fault injection de broker/DB/provider/worker.
- Pentest independente; restore/rollback/rotação; incident tabletop e contatos.
- Inventário de provedores, revisão jurídica dos textos, política de dados e limites técnicos publicados.

**Conclusão:** relatório com métricas e limiares aprovados; nenhuma regressão de prompt contra referência; custo p95 cabe na política comercial; achados críticos bloqueantes corrigidos e retestados; backup restaura e RPO/RTO medidos; DLQ/budget/login/admin/webhook/retention alertam; kill switches de importação/IA/render testados. Sem preço “aprovado” baseado apenas nas hipóteses dos PDFs.

## E14 — Beta controlado e lançamento

**Depende de:** E13 e todos os MUST do baseline; recomendações não implementadas registradas.

- Smoke completo cadastro → verificação → trial/compra → upload/link → cotação → prévias → editar → exportar → baixar → suporte → excluir.
- Verificar todos CA01–CA20 e testes ampliados de escopo; consentimento, contratos e URLs corretos.
- Aprovar rollout gradual com responsáveis de suporte/operação; promover imagens já testadas.
- Executar rollback e verificar ausência de inconsistência em ledger/jobs/migrations.

**Conclusão:** evidência de aceitação por requisito; riscos e exceções assinados por responsáveis apropriados; políticas publicadas; nenhuma pendência bloqueante de D01–D25 ou MUST; monitoramento ativo e equipe capaz de atender falhas/estornos. Publicar é uma etapa futura, não executada por este pacote.

## Dependências e trabalho que pode começar

E00 → E01 → E02 → E03. Depois, E04 (pagamento) e E05/E06 (ingestão) têm desenvolvimento independente; E07 → E08 → E09 fecha o fluxo de vídeo. E10 integra operação; E11 pode avançar após design sem bloquear o core. E12 deve ser projetada cedo, concluída antes de E13. E13 → E14 fecha lançamento. Trabalho em paralelo é sugestão de organização da equipe, não delegação executada nesta entrega.

Primeiro incremento verificável: ambiente local + login seguro + grant único por CPF + carteira/quote + upload privado e validação, com provider fake. Isso demonstra a fundação sem declarar o MVP concluído ou cortar os demais requisitos.
