# API implementada no código inicial

OpenAPI executável: `/api/openapi/v1.json` (restrito ao admin fora de Development). O contrato em design/ é o alvo mais amplo. A tabela abaixo inventaria código presente; não afirma testes HTTP concluídos.

| Método | Caminho | Arquivo |
|---|---|---|
| GET | `/api/v1/admin/users` | AdminEndpoints.cs |
| POST | `/api/v1/admin/users/{id:guid}/block` | AdminEndpoints.cs |
| GET | `/api/v1/admin/jobs` | AdminEndpoints.cs |
| GET | `/api/v1/admin/purchases` | AdminEndpoints.cs |
| GET | `/api/v1/admin/audit` | AdminEndpoints.cs |
| GET | `/api/v1/admin/tickets` | AdminEndpoints.cs |
| POST | `/api/v1/admin/tickets/{id:guid}/reply` | AdminEndpoints.cs |
| POST | `/api/v1/admin/credits/adjust` | AdminEndpoints.cs |
| POST | `/api/v1/admin/credits/refund` | AdminEndpoints.cs |
| GET | `/api/v1/admin/settings` | AdminEndpoints.cs |
| PUT | `/api/v1/admin/settings/{key}` | AdminEndpoints.cs |
| POST | `/api/v1/auth/register` | AuthEndpoints.cs |
| POST | `/api/v1/auth/verify` | AuthEndpoints.cs |
| POST | `/api/v1/auth/login` | AuthEndpoints.cs |
| POST | `/api/v1/auth/logout` | AuthEndpoints.cs |
| POST | `/api/v1/auth/forgot` | AuthEndpoints.cs |
| POST | `/api/v1/auth/reset` | AuthEndpoints.cs |
| POST | `/api/v1/auth/mfa/enroll` | AuthEndpoints.cs |
| POST | `/api/v1/auth/mfa/confirm` | AuthEndpoints.cs |
| GET | `/api/v1/me` | AuthEndpoints.cs |
| GET | `/api/v1/packages` | Payments.cs |
| POST | `/api/v1/purchases` | Payments.cs |
| GET | `/api/v1/purchases` | Payments.cs |
| POST | `/api/v1/dev/purchases/{id:guid}/approve` | Payments.cs |
| POST | `/api/v1/webhooks/mercadopago` | Payments.cs |
| GET | `/api/v1/catalog` | ProjectEndpoints.cs |
| GET | `/api/v1/wallet` | ProjectEndpoints.cs |
| GET | `/api/v1/wallet/transactions` | ProjectEndpoints.cs |
| GET | `/api/v1/projects` | ProjectEndpoints.cs |
| GET | `/api/v1/projects/{id:guid}` | ProjectEndpoints.cs |
| POST | `/api/v1/projects/uploads` | ProjectEndpoints.cs |
| POST | `/api/v1/uploads/{id:guid}/parts` | ProjectEndpoints.cs |
| POST | `/api/v1/uploads/{id:guid}/complete` | ProjectEndpoints.cs |
| POST | `/api/v1/projects/imports` | ProjectEndpoints.cs |
| POST | `/api/v1/projects/{id:guid}/quotes` | ProjectEndpoints.cs |
| POST | `/api/v1/projects/{id:guid}/runs` | ProjectEndpoints.cs |
| GET | `/api/v1/projects/{id:guid}/clips` | ProjectEndpoints.cs |
| PUT | `/api/v1/clips/{id:guid}` | ProjectEndpoints.cs |
| POST | `/api/v1/projects/{id:guid}/exports` | ProjectEndpoints.cs |
| GET | `/api/v1/projects/{id:guid}/exports` | ProjectEndpoints.cs |
| POST | `/api/v1/projects/{id:guid}/alternatives` | ProjectEndpoints.cs |
| POST | `/api/v1/projects/{id:guid}/bundle` | ProjectEndpoints.cs |
| GET | `/api/v1/projects/{id:guid}/bundles` | ProjectEndpoints.cs |
| DELETE | `/api/v1/projects/{id:guid}` | ProjectEndpoints.cs |
| POST | `/api/v1/tickets` | ProjectEndpoints.cs |
| GET | `/api/v1/tickets` | ProjectEndpoints.cs |
| POST | `/internal/v1/jobs/{id:guid}/lease` | WorkerEndpoints.cs |
| POST | `/internal/v1/jobs/{id:guid}/heartbeat` | WorkerEndpoints.cs |
| GET | `/health` | Program.cs |
| GET | `/api/v1/auth/csrf` | Program.cs |
