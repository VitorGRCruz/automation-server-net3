# Task 25 - NF-e Email Dispatch — Workflow 1 de descoberta de vendas candidatas

## Objetivo

Implementar o Workflow 1 `fetchCustomerNfeSalesCandidates`, responsável por descobrir vendas no ERP IXC com NF-e pronta e enfileirar jobs `PENDING` no banco da automação.

Este workflow não envia e-mail, não baixa PDF e não atualiza status final de envio.

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
- `docs/specs/nfe-email-dispatch/02-workflow-1-fetch-customer-nfe-sales-candidates.md`
- `docs/tasks/24-nfe-email-dispatch-foundation-and-modeling.md`
- esta task

## Escopo permitido

O agente pode alterar apenas:

- `src/domain/nfe/**`
- `src/infra/config/**` se precisar usar config criada na Task 24
- `src/infra/system-db/nfe-email-dispatch.repository.ts`
- `src/integrations/erp-db/erp-db.queries.ts`
- `src/temporal/activities/nfe/**`
- `src/temporal/workflows/nfe/**`
- `src/temporal/activities/index.ts`
- `src/temporal/workflows/index.ts`
- `src/temporal/worker/worker-activity-groups.ts`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`

## Não pode

- não implementar envio de e-mail;
- não implementar busca de PDF via IXC;
- não implementar Workflow 2 completo;
- não criar schedules ainda;
- não alterar banco do ERP;
- não criar rota HTTP;
- não alterar arquitetura de workers.

## Contexto funcional

Fluxo esperado:

```text
Parent Workflow: fetchCustomerNfeSalesCandidates
  ↓
Activity: loadNfeEmailDispatchCustomers
  ↓
Child Workflow por cliente: fetchSingleCustomerNfeSalesCandidates
  ↓
Activity ERP: fetchCustomerNfeSalesCandidatesFromErp
  ↓
Activity system-db: enqueueNfeEmailDispatchSales
```

## Entregáveis obrigatórios

### 1. Activity `loadNfeEmailDispatchCustomers`

Criar:

```text
src/temporal/activities/nfe/load-nfe-email-dispatch-customers.activity.ts
```

Responsabilidade:

```sql
SELECT
  id,
  erp_customer_id,
  created_at
FROM nfe_email_dispatch_customer;
```

Retorno esperado:

```ts
type NfeEmailDispatchCustomer = {
  id: number;
  erpCustomerId: number;
  createdAt: string;
};
```

Rodar em:

```text
automation-control
```

### 2. Query ERP de vendas candidatas

Adicionar em:

```text
src/integrations/erp-db/erp-db.queries.ts
```

Query base:

```sql
SELECT
  vd.id AS id_venda,
  vd.nfe_chave,
  rnf.data_recebimento AS data_emissao_nfe
FROM vd_saida vd
JOIN cliente c ON c.id = vd.id_cliente
JOIN nfe_xml_pdf nf ON nf.id_saida = vd.id
JOIN retorno_envio_nfe rnf ON rnf.id_saida = vd.id
WHERE vd.modelo_nf = 62
  AND vd.status = 'F'
  AND vd.id_cliente = ?
  AND rnf.data_recebimento >= ?;
```

Parâmetros:

```text
erpCustomerId
effectiveStart
```

### 3. Activity `fetchCustomerNfeSalesCandidatesFromErp`

Criar:

```text
src/temporal/activities/nfe/fetch-customer-nfe-sales-candidates-from-erp.activity.ts
```

Rodar em:

```text
automation-erp-read
```

Responsabilidade:

- validar input;
- consultar ERP via `getSharedErpDbClient()`;
- mapear rows snake_case para camelCase;
- retornar lista de candidatas;
- classificar falhas permanentes/transitórias usando os erros compartilhados existentes.

Retorno:

```ts
type ErpNfeSaleCandidate = {
  automationCustomerId: number;
  erpCustomerId: number;
  erpSaleId: number;
  erpInvoiceKey: string | null;
  erpInvoiceEmittedAt: string;
};
```

### 4. Activity `enqueueNfeEmailDispatchSales`

Criar:

```text
src/temporal/activities/nfe/enqueue-nfe-email-dispatch-sales.activity.ts
```

Rodar em:

```text
automation-control
```

Responsabilidade:

- receber candidatas;
- inserir no banco da automação com status `PENDING`;
- ignorar duplicidade;
- retornar contadores.

Insert idempotente:

```sql
INSERT INTO nfe_email_dispatch_sale (
  nfe_email_dispatch_customer_id,
  erp_sale_id,
  erp_invoice_key,
  erp_invoice_emitted_at,
  status,
  created_at,
  updated_at
) VALUES
  (?, ?, ?, ?, 'PENDING', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  id = id;
```

Se houver múltiplas candidatas, montar batch parametrizado sem interpolar valores diretamente na string SQL.

### 5. Child Workflow `fetchSingleCustomerNfeSalesCandidatesWorkflow`

Criar:

```text
src/temporal/workflows/nfe/fetch-single-customer-nfe-sales-candidates.workflow.ts
```

Responsabilidade:

1. receber cliente e contexto da descoberta;
2. calcular:

```text
discoveryWindowStart = discoveryStartedAt - discoveryWindowDays
effectiveStart = max(customerCreatedAt, discoveryWindowStart)
```

3. chamar activity ERP;
4. se lista vazia, finalizar sucesso;
5. se houver candidatas, chamar activity de enqueue;
6. retornar resumo por cliente.

Input:

```ts
type FetchSingleCustomerNfeSalesCandidatesInput = {
  automationCustomerId: number;
  erpCustomerId: number;
  customerCreatedAt: string;
  discoveryStartedAt: string;
  discoveryWindowDays: number;
};
```

Resultado:

```ts
type FetchSingleCustomerNfeSalesCandidatesResult = {
  automationCustomerId: number;
  erpCustomerId: number;
  status: "SUCCESS" | "FAILED";
  foundSales: number;
  queuedSales: number;
  errorMessage?: string;
};
```

### 6. Parent Workflow `fetchCustomerNfeSalesCandidatesWorkflow`

Criar:

```text
src/temporal/workflows/nfe/fetch-customer-nfe-sales-candidates.workflow.ts
```

Responsabilidade:

1. gerar `discoveryStartedAt` no workflow;
2. chamar `loadNfeEmailDispatchCustomersActivity`;
3. se não houver clientes, finalizar sucesso;
4. iniciar Child Workflows por cliente;
5. respeitar `maxConcurrentChildren = 5`;
6. aguardar conclusão dos children;
7. consolidar resultados.

O parent deve consolidar:

```ts
type FetchCustomerNfeSalesCandidatesSummary = {
  totalCustomers: number;
  successCustomers: number;
  failedCustomers: number;
  totalFoundSales: number;
  totalQueuedSales: number;
  failedCustomerIds: number[];
};
```

### 7. Paralelismo dos children

Implementar limite de 5 child workflows simultâneos.

Preferência:

- implementar um pool determinístico simples dentro do workflow;
- iniciar novos children conforme os anteriores terminarem;
- se ficar mais simples e legível, batches de 5 são aceitáveis apenas se documentado como decisão da primeira versão.

Não iniciar 200 children de uma vez.

### 8. Workflow IDs

Usar workflow IDs estáveis e legíveis para children.

Sugestão:

```text
nfe-email-dispatch/fetch-candidates/customer-<automationCustomerId>/<yyyy-mm-dd>
```

Evitar incluir dados sensíveis.

### 9. Retry policies

Para activities de banco/ERP:

```text
maximumAttempts = 3
initialInterval = 1 minute
backoffCoefficient = 2
maximumInterval = 5 minutes
nonRetryableErrorTypes = ["PermanentIntegrationError"]
```

Pode usar intervalos menores em dev se o projeto já usa padrão mais curto, mas manter a intenção da spec.

### 10. Registro nos workers

Atualizar:

```text
src/temporal/worker/worker-activity-groups.ts
src/temporal/activities/index.ts
src/temporal/workflows/index.ts
```

Mapeamento:

```text
controlWorkerActivities:
  loadNfeEmailDispatchCustomersActivity
  enqueueNfeEmailDispatchSalesActivity

erpReadWorkerActivities:
  fetchCustomerNfeSalesCandidatesFromErpActivity
```

## Critérios de aceite

A task está pronta se:

- Workflow 1 parent existe e compila;
- Workflow 1 child existe e compila;
- activities de load/enqueue/ERP existem e compilam;
- query ERP está em `erp-db.queries.ts`;
- SQL de insert é idempotente;
- duplicidade não falha a activity;
- parent respeita paralelismo máximo;
- falhas por cliente são consolidadas;
- workflows/activities estão exportados e registrados nos workers corretos;
- nenhum envio de e-mail/PDF foi implementado por engano;
- `pnpm typecheck` passa;
- `pnpm lint` passa;
- `docs/CURRENT_STATE.md` e `docs/TASK_BOARD.md` foram atualizados.

## Validação mínima

Executar:

```bash
pnpm typecheck
pnpm lint
```

Se possível, executar o worker control e erp-read em ambiente local com banco fake/credenciais reais controladas, mas não exigir envio nem IXC nesta task.

## Atualização de documentação ao final

Atualizar:

- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`

No `TASK_BOARD`, adicionar a Task 25 como concluída somente se os critérios de aceite foram cumpridos.

## Ao terminar

Responder com:

1. resumo curto do que foi feito;
2. arquivos alterados;
3. validações executadas;
4. pendências ou riscos;
5. confirmação de atualização de docs.
