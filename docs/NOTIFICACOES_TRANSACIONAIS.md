# Notificações transacionais — SliceFlow

O SliceFlow usa um único evento transacional como origem para a central interna e para e-mail. Estados intermediários de progresso continuam apenas na interface do projeto.

## Canais

Fluxo:

```
evento -> notificação interna -> política de e-mail -> envio
```

Cada notificação registra:
- evento;
- categoria;
- assunto e corpo;
- data de criação;
- leitura;
- política de e-mail;
- estado de envio;
- chave de deduplicação.

## Categorias e preferências

### Configuráveis

- **Processamento** — ligado por padrão.
- **Suporte** — ligado por padrão.
- **Saldo baixo** — desligado por padrão; limite inicial de aviso: abaixo de 10 créditos.
- **Novidades/promocionais** — desligado por padrão.

### Obrigatórias

- **Segurança** — confirmação de conta, recuperação e alterações sensíveis.
- **Pagamentos/créditos importantes** — aprovação, recusa, devolução, reembolso e chargeback.
- **Armazenamento** — avisos de retenção e exclusão de arquivos.

As categorias obrigatórias não são expostas como toggles editáveis.

## Eventos implementados

| Evento | Central | E-mail |
|---|---:|---:|
| Confirmação de e-mail | não, porque contém link sensível | obrigatório |
| Conta confirmada / boas-vindas | sim | obrigatório |
| Solicitação de redefinição de senha | não, porque contém link sensível | obrigatório |
| Senha alterada | sim | obrigatório |
| Vídeo recebido | sim | somente conforme preferência; vídeos longos recebem e-mail por padrão |
| Retry automático | sim | não |
| Processamento falhou definitivamente | sim | conforme preferência de processamento |
| Fonte restrita/indisponível | sim | conforme preferência de processamento |
| Pré-cortes prontos para revisão | sim | conforme preferência de processamento |
| Nenhum bom trecho encontrado | sim | conforme preferência de processamento |
| Créditos devolvidos | sim | obrigatório |
| Renderizações finais prontas | sim | conforme preferência de processamento |
| ZIP pronto | sim | conforme preferência de processamento |
| Compra aprovada | sim | obrigatório |
| Pagamento recusado/expirado | sim | obrigatório |
| Reembolso/chargeback informado pelo provedor | sim | obrigatório |
| Saldo baixo | sim | opcional, desligado por padrão |
| Resposta do suporte | sim | conforme preferência de suporte |
| Chamado resolvido | sim | conforme preferência de suporte |
| Avisos de 105/115/119 dias | sim | obrigatório |
| Arquivos removidos por inatividade | sim | obrigatório |

## Não enviar por e-mail

Não são criados e-mails para estados como:

- transcrevendo;
- analisando;
- gerando corte 3/8;
- renderizando uma prévia;
- preparando IA;
- percentual de progresso.

Esses estados pertencem à barra de progresso do projeto.

## APIs

- `GET /api/v1/notifications`
- `POST /api/v1/notifications/{id}/read`
- `POST /api/v1/notifications/read-all`
- `GET /api/v1/notification-preferences`
- `PUT /api/v1/notification-preferences`

O frontend usa essas APIs para o sino e para a página de preferências.

## Próximos eventos

Ainda vale evoluir:
- login suspeito baseado em sinal real de risco, sem heurística inventada;
- confirmação de estorno monetário concluído depois da conciliação;
- notificações push/mobile caso sejam adotadas;
- digest opcional para usuários com muitos projetos.
