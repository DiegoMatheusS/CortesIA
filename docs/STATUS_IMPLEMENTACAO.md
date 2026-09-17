# Status real da implementação — v0.2

**Esta entrega é uma base de código inicial com fluxos conectados, não o MVP completo das nove fases.** Nenhuma fase está declarada homologada ponta a ponta sem build/integracão correspondente. Requisitos pendentes continuam obrigatórios para o MVP.

| Fase | Código incluído | O que falta para concluir |
|---|---|---|
| 1 Fundação | API .NET 10/Identity/EF, cadastro, verificação por e-mail, login/logout/reset, MFA admin, CPF/HMAC, usuários, painel básico | Build .NET/Next, migrations EF versionadas, RBAC granular, verificação de telefone conforme decisão, sessões/step-up com testes E2E |
| 2 Créditos | Carteira por lotes, trial único, preços base/extras, quote, reserve/capture/refund parcial, ledger/idempotência, ajuste admin | Executar testes de concorrência/replay, catálogo totalmente versionado, combos/descontos, promo expiráveis e reprocessamento pesado cotado completo |
| 3 Upload | Multipart S3, 5 GB, validação ffprobe, histórico, jobs/outbox/SQS, link YouTube allowlisted | Teste integrado S3/SQS, teste real YouTube, retomar/cancelar upload na UI, limites de concorrência por conta, stage/status granulares |
| 4 Agente | Interface provider, fixture explícita, transcrição em chunks, seleção e revisão Terra/Sol, validação temporal/redação básica | Homologar modelos e API/timestamps; benchmark ≥50 vídeos; métricas/custo; dados incidentais e D25; providers alternativos |
| 5 Vídeo | Master completo, FFmpeg offline, cortes, proporções, legenda simples, zoom, blur, frame de capa, ZIP | Legenda dinâmica com alinhamento por palavra e tracking inteligente; corpus de qualidade/codecs/performance. São recusados na cotação, não cobrados como entregues. |
| 6 Editor | Prévias, escolher/rejeitar, título, início/fim, texto da legenda, desligar legenda, exportações, buscar outros pelo master/transcrição | Reposição de legenda/crop visual, escolha/edição de capa, presets de estilo/efeitos completos, nova prévia automática de cada edição e cotação de render adicional |
| 7 Pagamentos | Checkout Mercado Pago, assinatura webhook, consulta server-to-server, grant/bônus, modo local fictício | Sandbox real Pix/cartão; conciliação por busca de pagamento quando nenhum webhook chegar; estorno monetário completo e chargeback com saldo já gasto; contrato/valor comercial |
| 8 Segurança | Controles básicos desde início; offline media, SSRF/DNS, HMAC, CSRF/MFA, rate limit local, audit, antivirus adapter, scans CI | Pentest, rate limit distribuído, mTLS/IAM, hardening de todas as rotas/quotas, ClamAV 5GB homologado (falha fechada), secret rotation, teste de retenção/restore e exclusão completa da conta |
| 9 Produção | Dockerfiles/Compose, CI, Terraform de rede/RDS/S3/SQS/ECR/ECS/logs/alarme, runbooks | Deploy das aplicações/ECS services, domínio/TLS/WAF, roles de menor privilégio, SES, observabilidade completa, restore/RPO/RTO, rollback testado e aprovação comercial/jurídica |

Home: há visual escuro, água digital CSS, CTA e gaveta por scroll com pontas/um cartão destacado, sem mão. O vídeo da Home é ilustrativo, não amostra real de cliente. UI ainda exige revisão visual/browser e refinamento do design aprovado.

Suporte inicial permite abrir/listar/responder chamados; categorias completas, anexos em quarentena e fluxo granular não estão concluídos. Analytics consentido não está instalado; nenhum tracker de marketing é enviado por esta base. Termos da rota `/legal` são aviso de desenvolvimento, não texto jurídico definitivo.

## Verificado aqui

- 14 testes Python/FFmpeg passaram, incluindo processamento com provider fixture e storage em memória.
- Vídeo sintético realmente codificado, master realmente gerado, preview 9:16 com legenda/zoom/blur e capa extraída.
- Casos de timestamp inválido, arquivo falso/tamanho, URL/host/DNS privados, redaction e candidatos repetidos cobertos.
- JSON, YAML, XML de projetos e sintaxe Python inspecionados por scripts locais.

## Não executado aqui

.NET SDK, Docker e Terraform não estavam disponíveis; registries externos não estavam acessíveis para restore. Por isso **não houve build .NET/Next, aplicação de migrations, Compose integrado ou terraform validate**. Não foi usado um build fictício como prova. Testes C# e pipeline CI estão incluídos para executar em ambiente compatível. Não há lockfiles transitivos gerados offline artificialmente.

## Próximo gate concreto

Em máquina com Docker e acesso aos registries: executar bootstrap + build, corrigir qualquer incompatibilidade de pacote indicada pelo restore, rodar testes C#/PostgreSQL, testar cookie/CSRF/queue/manifestos/retention e o smoke completo. Depois completar os itens pendentes de cada fase. **Não abrir ao público apenas porque os containers iniciaram.**
