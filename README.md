# Cortes IA — código inicial v0.2

Projeto organizado nas nove fases solicitadas, com as decisões aprovadas v0.2 incorporadas. Contém código .NET 10, Next.js/React, Python/FFmpeg, configuração local e fundação AWS.

**Estado real:** implementação inicial para desenvolvimento e homologação, não MVP completo nem release de produção. Python/FFmpeg tiveram execução de testes reais. .NET, Next e Docker precisam do primeiro build integrado em ambiente com SDKs e acesso aos registries. Recursos ainda não implementados e diferenças entre contrato-alvo e runtime estão discriminados em `docs/STATUS_IMPLEMENTACAO.md`; o escopo aprovado foi mantido no backlog.

## Começar no Windows

Requisitos: Docker Desktop com containers Linux/WSL2 e Compose, Python 3.12+, acesso a Docker Hub/MCR/NuGet/npm/PyPI para baixar dependências. Reserve memória e disco compatíveis com FFmpeg; vídeos grandes usam múltiplas cópias temporárias.

Na pasta descompactada:

```powershell
python scripts/bootstrap.py
docker compose up --build
```

Alternativa: `powershell -ExecutionPolicy Bypass -File scripts/start.ps1` para executar apenas este script local revisável. Não muda a política permanente do Windows.

Linux/macOS: `sh scripts/start.sh`.

- Plataforma: http://localhost:3000
- Caixa de e-mails de desenvolvimento: http://localhost:8025
- OpenAPI da API local, após iniciar: http://localhost:3000/api/openapi/v1.json
- S3/SQS local: localhost:4566, apenas para desenvolvimento.

Cadastre sua conta, abra o e-mail no Mailpit e confirme. Você recebe um benefício de 10 créditos uma vez por CPF válido. A senha usa a política do ASP.NET Identity (mínimo 12 caracteres e requisitos de complexidade).

**IA local:** usa fixture explícita de cinco segundos; não interpreta áudio real. Para testar o fluxo sem cobrança externa, envie um vídeo de pelo menos cinco segundos, com áudio. O título do corte identifica a fixture. Renderização é real com FFmpeg. Compras locais são fictícias, não cobram Pix/cartão.

Para transcrição/seleção real, configure o override descrito em `docs/INTEGRACOES.md`; valide modelos, timestamps, orçamento e privacidade antes de usar dados reais.

## Admin

Não há senha administrativa no ZIP. Depois de cadastrar e verificar sua conta:

```powershell
docker compose run --rm -e ADMIN_EMAIL=seu-email@exemplo.com api --make-admin
```

Entre novamente, ative o autenticador na plataforma e faça novo login com código MFA. Ações administrativas sensíveis exigem login recente (cinco minutos). O painel inicial permite consultas e ajustes auditados. A role inicial é Admin; divisão granular Finance/Support/Security permanece no backlog.

## Pastas / repositórios

| Pasta | Responsabilidade |
|---|---|
| `cortes-ia-api` | Identity, domínio, carteira, projetos, jobs/outbox, pagamentos e administração |
| `cortes-ia-web` | Home, cadastro/login, painel, upload, cotação, revisão/editor e admin |
| `cortes-ia-workers` | Agente, integração IA, importador, FFmpeg offline e testes |
| `cortes-ia-contracts` | Contratos-alvo atualizados e eventos do runtime |
| `cortes-ia-infra` | Ambiente local, Terraform e runbooks |
| `docs` | Decisões, fases, rastreabilidade e situação da implementação |

O ZIP é um workspace integrado para facilitar o primeiro uso. As cinco pastas podem virar repositórios privados separados; Compose/build contexts e workflows precisam ser ajustados se forem separados. Nenhum repositório remoto foi criado.

## Testes

```bash
cd cortes-ia-workers
python -m unittest discover -s tests -v
```

É necessário FFmpeg/ffprobe no PATH. Os testes Python não usam OpenAI, Mercado Pago ou AWS real.

Para C#: `dotnet test cortes-ia-api/Tests/Cortes.Tests.csproj`. O teste de carteira exige PostgreSQL isolado em `TEST_DATABASE_URL`, com banco **cortes_test**, e se recusa a usar outro nome.

Frontend: `npm install --package-lock-only`, `npm ci`, `npm run typecheck`, `npm run build`. Não foi possível gerar um lockfile confiável offline; gere/commite os locks no primeiro restore. O CI incluso executa esses passos. Para release, fixe digests das imagens e SHAs das actions após homologação.

## Banco

O modelo efetivamente usado está em `Infrastructure/Database.cs` e `Domain/Models.cs`; `--init-db` cria banco **vazio** explicitamente com Identity e constraints. Não altera automaticamente banco existente. O DDL em `docs/database/modelo.sql` é o domínio-alvo ampliado, não deve ser aplicado por cima do schema EF.

Antes da primeira evolução de banco de homologação, gerar/revisar migration EF e baseline do schema, substituir bootstrap por processo controlado, testar upgrade/rollback e separar role runtime de DDL. A entrega não inclui migration gerada por ferramenta sem tê-la executado.

## Cuidados operacionais concretos

- `.env` é gerado com segredos aleatórios; nunca commitar ou mandar a terceiros.
- Não usar `docker compose down -v` em dados que queira manter: remove volumes.
- O Compose abre somente portas localhost. Não é configuração de produção.
- Banco e carteira são reais no ambiente local; os créditos/compras são de teste.
- Antivírus vem desativado somente no modo de desenvolvimento e identificado em Compose. Ative o perfil e `SCAN_MODE=required` para homologação; arquivos acima do limite suportado pelo ClamAV devem falhar fechados, nunca passar sem scan.
- YouTube fica desligado até habilitação e teste. Restrições retornam bloqueio sem consumo; não se promete acesso a qualquer vídeo.
- Legenda dinâmica e tracking seguem no escopo, mas esta versão recusa sua cobrança enquanto a implementação não estiver concluída.
- A faixa acima de 90 minutos e os preços comerciais permanecem sob as decisões pendentes do plano, sem transformar sugestões em valores aprovados.

Comece por `docs/STATUS_IMPLEMENTACAO.md` e `docs/BACKLOG_MVP.md` para decidir o próximo incremento sem confundir código presente com fase homologada.
