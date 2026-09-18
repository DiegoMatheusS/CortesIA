# Banco e migrations EF — SliceFlow

O schema do SliceFlow é versionado por Entity Framework Core. O caminho normal de inicialização não usa mais `EnsureCreated` nem ALTER TABLE de bootstrap.

## Fonte de verdade

- Modelo EF: `cortes-ia-api/Infrastructure/Database.cs` + `Domain/Models.cs`.
- Migrations: `cortes-ia-api/Migrations/`.
- Tooling fixado: `.config/dotnet-tools.json`.
- Inicialização local/ambiente: `dotnet ... --init-db`, que executa `Database.MigrateAsync()`.

A migration inicial `SliceFlowBaseline` foi gerada pelo `dotnet-ef` 10.0.12 a partir do modelo atual e revisada antes do commit.

## Controles que não vêm automaticamente do modelo EF

A migration baseline também cria a função/trigger PostgreSQL que torna estas tabelas append-only:

- `Ledger`
- `Audit`

Tentativas de UPDATE/DELETE nessas tabelas devem falhar no banco. Inserts continuam permitidos.

## CI obrigatório

O job `migrations`:

1. compila a API;
2. aplica todas as migrations em PostgreSQL limpo;
3. reverte até migration `0`;
4. executa `dotnet ef migrations has-pending-model-changes`.

Uma alteração de modelo sem migration correspondente deve quebrar o CI.

## Criar uma nova migration

Depois de alterar o modelo:

```bash
dotnet tool restore
dotnet ef migrations add NomeDaMudanca \
  --project cortes-ia-api/Cortes.Api.csproj \
  --output-dir Migrations
```

Revise o Up/Down, índices, FKs, constraints e qualquer SQL customizado antes do merge.

## Banco local antigo, criado antes do baseline

Bancos de desenvolvimento criados pelo protótipo com `EnsureCreated` não possuem histórico EF. O SliceFlow **não marca automaticamente esse schema como migrado**, porque isso poderia esconder diferenças reais no banco.

Para ambiente local descartável, a opção mais segura é:

1. fazer backup de qualquer dado que queira manter;
2. recriar o banco/volume local;
3. executar o `db-init`, que aplicará as migrations do zero.

Para um banco legado que precise ser preservado, faça um processo de adoção controlado após comparar o schema real com o baseline. Não insira manualmente uma linha em `__EFMigrationsHistory` sem essa verificação.

## Homologação e produção

- Aplicar migrations em etapa explícita de deploy, antes de subir a nova versão da API.
- Não dar permissão DDL à role de runtime da aplicação quando a infraestrutura final separar as roles.
- Backup/restore e rollback de migrations ainda precisam ser homologados no ambiente de produção.
