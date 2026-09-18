# SliceFlow — base integrada v0.5

Projeto integrado com frontend Next.js/React, API .NET 10, workers Python/FFmpeg, editor short-form versionado, pipeline local de IA e fundação AWS.

**Estado real:** base funcional de desenvolvimento/homologação, ainda não release de produção. CI executa testes .NET, workers Python/FFmpeg, build Next.js, scans de segurança e validação Terraform. Recursos pendentes e diferenças entre contrato-alvo e runtime continuam documentados em `docs/STATUS_IMPLEMENTACAO.md`.

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

**IA local:** há dois modos.

- `docker compose up --build`: modo leve de desenvolvimento, com transcrição fixture e renderização FFmpeg real.
- `scripts/start-local-ai.ps1` (Windows) ou `scripts/start-local-ai.sh` (Linux/macOS): modo local real com Faster-Whisper para transcrição e Ollama + `qwen3:8b` para seleção/revisão semântica.

O modelo local padrão é somente `qwen3:8b`; não existe fallback automático para modelos menores. Consulte `docs/LOCAL_AI.md` para requisitos, diagnóstico e configuração. Compras locais continuam fictícias.

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

O modelo efetivamente usado está em `Infrastructure/Database.cs` e `Domain/Models.cs`. O bootstrap de desenvolvimento cria o schema inicial e aplica upgrades idempotentes necessários à base v0.5 do editor. Homologação/produção devem usar migrations EF revisadas e versionadas; não trate o bootstrap de desenvolvimento como mecanismo de deploy.

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
