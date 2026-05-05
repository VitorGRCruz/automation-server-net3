# Task 24 - NF-e Email Dispatch — fundação, contratos e modelagem

## Objetivo

Criar a fundação do módulo `nfe` para a automação de envio automático de NF-e por e-mail, incluindo contratos tipados, migration das tabelas da automação, repositório inicial do banco da automação, template HTML e ajustes mínimos de build/configuração.

Esta task não deve implementar ainda os workflows completos.

## Leitura obrigatória antes de codar

- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CODEX_EXECUTION_PROTOCOL.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ARCHITECTURE.md`
- `docs/TEMPORAL_RULES.md`
- `docs/ERROR_CLASSIFICATION.md`
- `docs/INTEGRATIONS_RULES.md`
- `docs/specs/nfe-email-dispatch/README.md`
- `docs/specs/nfe-email-dispatch/00-contexto-e-mapa-de-implementacao.md`
- `docs/specs/nfe-email-dispatch/01-modelagem-banco-automacao.md`
- `docs/specs/nfe-email-dispatch/04-template-email-pdf-e-smtp.md`
- esta task

## Escopo permitido

O agente pode alterar apenas:

- `src/domain/nfe/**`
- `src/infra/system-db/**`
- `src/infra/config/**`
- `src/temporal/activities/nfe/**` apenas para scaffolding exportável, se necessário
- `src/temporal/workflows/nfe/**` apenas para scaffolding exportável, se necessário
- `src/temporal/activities/index.ts` apenas se criar exports mínimos de activities NFE
- `src/temporal/workflows/index.ts` apenas se criar exports mínimos de workflows NFE
- `package.json` apenas para copiar template HTML no build ou adicionar scripts estritamente necessários nesta task
- `.env.example`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- documentação dentro de `docs/specs/nfe-email-dispatch/**` se precisar corrigir algo descoberto durante a task

## Não pode

- não implementar ainda o Workflow 1 completo;
- não implementar ainda o Workflow 2 completo;
- não criar schedules nesta task;
- não criar rotas HTTP;
- não alterar regra de negócio dos módulos `csat` ou `cobrancas`;
- não alterar a topologia de task queues;
- não criar outro banco fora do `system-db`;
- não criar outro client SMTP;
- não introduzir biblioteca nova sem necessidade objetiva.

## Contexto

A automação precisa de duas tabelas no banco da automação:

```text
nfe_email_dispatch_customer
nfe_email_dispatch_sale
```

A tabela de clientes define quem participa da automação. A tabela de vendas representa os jobs de envio.

A modelagem deve permitir redescoberta periódica sem duplicar jobs, por meio da unique key:

```text
(nfe_email_dispatch_customer_id, erp_sale_id)
```

## Entregáveis obrigatórios

### 1. Criar estrutura de domínio NFE

Criar pasta:

```text
src/domain/nfe/
```

Criar arquivo:

```text
src/domain/nfe/nfe-email-dispatch.types.ts
```

Tipos mínimos esperados:

```ts
export type NfeEmailDispatchSaleStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "SENT"
  | "FAILED_TRANSIENT"
  | "FAILED_FINAL"
  | "DELIVERY_UNKNOWN";
```

Também definir tipos para:

- cliente cadastrado na automação;
- venda candidata do ERP;
- job elegível de envio;
- input/output do Workflow 1 parent;
- input/output do Workflow 1 child;
- input/output do Workflow 2 parent;
- input/output do Workflow 2 child;
- contexto da venda para e-mail;
- resultado de PDF local;
- resultado final de envio.

Não precisa preencher todos os campos de todos os workflows se alguma etapa ainda será criada em tasks posteriores, mas os contratos centrais de status e entidades devem existir.

### 2. Criar template HTML no caminho oficial

Inserir o template em:

```text
src/domain/nfe/templates/nfe-email-template.html
```

O arquivo já está neste pacote.

### 3. Garantir que o template seja empacotado no build

O runtime Docker copia apenas `dist`.

Ajustar `package.json` para que `pnpm build` copie:

```text
src/domain/nfe/templates/*.html
```

para:

```text
dist/domain/nfe/templates/
```

Preservar a cópia atual de migrations.

### 4. Criar migration das tabelas

Criar:

```text
src/infra/system-db/migrations/003_create_nfe_email_dispatch_tables.sql
```

A migration deve seguir a especificação de `docs/specs/nfe-email-dispatch/01-modelagem-banco-automacao.md`.

Usar `CREATE TABLE IF NOT EXISTS`.

DDL esperado, adaptado para migration idempotente:

- `nfe_email_dispatch_customer`
- `nfe_email_dispatch_sale`
- FK com `ON DELETE CASCADE`
- unique key do cliente por `erp_customer_id`
- unique key da venda por `(nfe_email_dispatch_customer_id, erp_sale_id)`
- índices de status, cliente/data e chave NF-e
- constraints de consistência se suportadas pelo banco alvo

Se alguma constraint `CHECK` não for compatível com a versão real do MariaDB/MySQL usada no ambiente, documentar e compensar no repositório/application-side. Não remover silenciosamente.

### 5. Registrar a migration no runner

Atualizar:

```text
src/infra/system-db/run-system-db-migrations.ts
```

A nova migration deve ser aplicada no startup da API/workers como as atuais.

Como a migration deve ser idempotente, não criar tabela auxiliar de controle de migration nesta task.

### 6. Criar repositório inicial do banco da automação

Criar:

```text
src/infra/system-db/nfe-email-dispatch.repository.ts
```

Nesta task, implementar ou ao menos preparar de forma compilável as funções que serão usadas nas próximas tasks.

Funções esperadas ao longo da trilha:

```ts
loadNfeEmailDispatchCustomers
insertNfeEmailDispatchSalesIdempotently
loadEligibleNfeEmailDispatchSales
claimNfeEmailDispatchSale
findClaimedNfeEmailDispatchSaleByAttemptStartedAt
finalizeNfeEmailDispatchSale
findNfeEmailDispatchSaleStatus
```

Nesta task é aceitável implementar apenas as funções diretamente relacionadas à modelagem e deixar as demais como contratos/assinaturas somente se isso não gerar código morto confuso. Preferir código compilável e simples.

### 7. Configuração base

Adicionar em `src/infra/config/env.ts` e `.env.example` os valores operacionais centrais, com defaults:

```text
NFE_EMAIL_DISPATCH_DISCOVERY_WINDOW_DAYS=15
NFE_EMAIL_DISPATCH_MAX_CONCURRENT_CHILDREN=5
NFE_EMAIL_DISPATCH_MAX_SEND_ATTEMPTS=3
NFE_EMAIL_DISPATCH_PDF_TMP_DIR=/var/tmp/nfe-email-dispatch
```

Se optar por deixar essas constantes fixas em código, justificar na documentação. Como o projeto já usa env para schedules e runtime, a recomendação é expor em env.

### 8. Não quebrar o runtime atual

Garantir que os módulos existentes continuem compilando.

## Critérios de aceite

A task está pronta se:

- `src/domain/nfe/nfe-email-dispatch.types.ts` existe e compila;
- `src/domain/nfe/templates/nfe-email-template.html` existe;
- `pnpm build` copia o template para `dist/domain/nfe/templates/`;
- `003_create_nfe_email_dispatch_tables.sql` existe;
- `run-system-db-migrations.ts` inclui a nova migration;
- as duas tabelas estão modeladas conforme a spec;
- `.env.example` documenta as novas variáveis centrais;
- nenhum workflow completo foi implementado ainda por engano;
- `pnpm typecheck` passa;
- `pnpm lint` passa;
- `pnpm build` passa se o build foi alterado;
- `docs/CURRENT_STATE.md` e `docs/TASK_BOARD.md` foram atualizados.

## Validação mínima

Executar:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Se `pnpm build` falhar por ambiente local sem dependências, informar claramente o motivo e executar ao menos `pnpm typecheck` e `pnpm lint`.

## Atualização de documentação ao final

Atualizar:

- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`

No `TASK_BOARD`, adicionar a Task 24 como concluída somente se os critérios de aceite foram cumpridos.

## Ao terminar

Responder com:

1. resumo curto do que foi feito;
2. arquivos alterados;
3. validações executadas;
4. pendências ou riscos;
5. confirmação de atualização de `docs/CURRENT_STATE.md` e `docs/TASK_BOARD.md`.
