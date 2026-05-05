# Execução dev/test dos workflows Temporal

## Objetivo

Os comandos `temporal:dev:*` iniciam os mesmos workflows e activities de produção, mas com uma `runtimePolicy` explícita de desenvolvimento.

Essa policy usa o modo `run-scoped`:

- parent workflow IDs recebem `/dev/<testRunId>`;
- child workflow IDs recebem `/dev/<testRunId>`;
- idempotência durável usa `dev:<testRunId>`;
- o módulo `nfe` usa `runtime_scope = 'dev:<testRunId>'` na tabela `nfe_email_dispatch_sale`.

Produção continua igual quando `runtimePolicy` está ausente.

## Variáveis

Adicionar ou revisar no `.env`:

```env
AUTOMATION_RUNTIME_MODE=production
AUTOMATION_DEV_IDEMPOTENCY_SCOPE_STRATEGY=run-scoped
AUTOMATION_DEV_ALLOW_COMPLETED_CHILD_WORKFLOW_RERUN=true
TEST_RUN_ID=
```

`TEST_RUN_ID` pode ficar vazio. Os scripts dev geram um valor automaticamente e imprimem no output.

## Preparação local

Subir a infraestrutura e os workers necessários:

```bash
pnpm docker:dev:up
```

Ou fora do compose:

```bash
pnpm temporal:workers:all
```

## Comandos

CSAT:

```bash
TEST_RUN_ID=csat-a pnpm temporal:dev:csat
TEST_RUN_ID=csat-b pnpm temporal:dev:csat
```

Cobrancas:

```bash
TEST_RUN_ID=cobrancas-a pnpm temporal:dev:cobrancas
TEST_RUN_ID=cobrancas-b pnpm temporal:dev:cobrancas
```

NF-e discovery e processing no mesmo escopo:

```bash
TEST_RUN_ID=nfe-a pnpm temporal:dev:nfe:discovery
TEST_RUN_ID=nfe-a pnpm temporal:dev:nfe:processing
```

Repetição com outro escopo:

```bash
TEST_RUN_ID=nfe-b pnpm temporal:dev:nfe:discovery
TEST_RUN_ID=nfe-b pnpm temporal:dev:nfe:processing
```

## Output esperado

Os scripts imprimem um resumo JSON com:

- `mode`
- `testRunId`
- `idempotencyScope`
- `namespace`
- `taskQueue`
- `workflowType`
- `workflowId`
- `runId`
- `requestId`

## Observações operacionais

- Os comandos dev continuam usando integrações reais, sem mocks embutidos no workflow.
- Trocar o `TEST_RUN_ID` força uma nova rodada lógica do mesmo caso de negócio sem limpar o histórico do Temporal.
- Reexecutar o mesmo `TEST_RUN_ID` reaproveita o mesmo escopo lógico de idempotência.
- O `nfe` agora separa jobs por `runtime_scope`, então discovery e processing precisam usar o mesmo `TEST_RUN_ID` quando fizerem parte da mesma rodada.
