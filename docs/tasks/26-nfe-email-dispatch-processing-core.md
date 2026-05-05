# Task 26 - NF-e Email Dispatch — núcleo do Workflow 2 de processamento

## Objetivo

Implementar o núcleo do Workflow 2 `processNfeEmailDispatchSales`, responsável por selecionar jobs elegíveis, iniciar child workflows por venda, fazer claim atômico, consultar contexto da venda no ERP, validar e-mails e preparar a finalização de status.

Esta task ainda não deve fechar a integração completa com PDF IXC e envio SMTP. Ela deve deixar o esqueleto do Workflow 2 pronto, com claim e consulta ERP funcionando.

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
- `docs/specs/nfe-email-dispatch/03-workflow-2-process-nfe-email-dispatch-sales.md`
- `docs/specs/nfe-email-dispatch/04-template-email-pdf-e-smtp.md`
- `docs/tasks/24-nfe-email-dispatch-foundation-and-modeling.md`
- `docs/tasks/25-nfe-email-dispatch-discovery-workflow.md`
- esta task

## Escopo permitido

O agente pode alterar apenas:

- `src/domain/nfe/**`
- `src/infra/config/**` se necessário
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

- não chamar ainda a API IXC para PDF nesta task;
- não enviar e-mail SMTP nesta task;
- não criar schedules nesta task;
- não implementar recovery de jobs `IN_PROGRESS` antigos;
- não criar rota HTTP;
- não alterar arquitetura de workers.

## Contexto funcional

Workflow 2 consumirá jobs de:

```text
nfe_email_dispatch_sale
```

com status:

```text
PENDING
FAILED_TRANSIENT com attempt_count < maxSendAttempts
```

Cada job será processado por um Child Workflow.

## Entregáveis obrigatórios

### 1. Query/repositório para carregar jobs elegíveis

Implementar no repositório:

```ts
loadEligibleNfeEmailDispatchSales(maxSendAttempts: number)
```

SQL:

```sql
SELECT
  id,
  erp_sale_id,
  attempt_count
FROM nfe_email_dispatch_sale
WHERE status = 'PENDING'
   OR (
        status = 'FAILED_TRANSIENT'
        AND attempt_count < ?
   )
ORDER BY created_at ASC, id ASC;
```

### 2. Activity `loadNfeEmailDispatchEligibleSales`

Criar:

```text
src/temporal/activities/nfe/load-nfe-email-dispatch-eligible-sales.activity.ts
```

Rodar em:

```text
automation-control
```

Responsabilidade:

- carregar jobs elegíveis;
- validar `maxSendAttempts`;
- retornar lista tipada.

### 3. Claim atômico do job

Implementar no repositório:

```ts
claimNfeEmailDispatchSale(input)
```

SQL:

```sql
UPDATE nfe_email_dispatch_sale
SET
  status = 'IN_PROGRESS',
  attempt_count = attempt_count + 1,
  last_attempt_at = ?,
  last_error_message = NULL
WHERE id = ?
  AND (
      status = 'PENDING'
      OR (
          status = 'FAILED_TRANSIENT'
          AND attempt_count < ?
      )
  );
```

Parâmetros:

```text
attemptStartedAt
nfeEmailDispatchSaleId
maxSendAttempts
```

Se `affectedRows = 1`, claim confirmado.

Se `affectedRows = 0`, validar se o claim já foi feito pela mesma execução:

```sql
SELECT
  id,
  attempt_count
FROM nfe_email_dispatch_sale
WHERE id = ?
  AND status = 'IN_PROGRESS'
  AND last_attempt_at = ?;
```

Se encontrar, seguir processamento.

Se não encontrar, child finaliza `SKIPPED`.

### 4. Activity `claimNfeEmailDispatchSale`

Criar:

```text
src/temporal/activities/nfe/claim-nfe-email-dispatch-sale.activity.ts
```

Rodar em:

```text
automation-control
```

A activity deve retornar:

```ts
type ClaimNfeEmailDispatchSaleResult =
  | { status: "CLAIMED"; attemptCount: number }
  | { status: "ALREADY_CLAIMED_BY_THIS_ATTEMPT"; attemptCount: number }
  | { status: "SKIPPED" };
```

### 5. Query ERP para contexto de e-mail

Adicionar em:

```text
src/integrations/erp-db/erp-db.queries.ts
```

Query base:

```sql
SELECT
  CASE
    WHEN TRIM(c.email) REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}([[:space:]]*;[[:space:]]*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})*$'
      THEN TRIM(c.email)
    ELSE NULL
  END AS email,
  c.razao AS nome_cliente,
  vd.id AS id_venda,
  vd.valor_total,
  vd.numero_nf,
  vd.nfe_chave
FROM vd_saida vd
JOIN cliente c ON c.id = vd.id_cliente
JOIN nfe_xml_pdf nf ON nf.id_saida = vd.id
JOIN retorno_envio_nfe rnf ON rnf.id_saida = vd.id
WHERE vd.id = ?
  AND vd.modelo_nf = 62
  AND vd.status = 'F'
LIMIT 1;
```

### 6. Activity `fetchNfeSaleEmailContextFromErp`

Criar:

```text
src/temporal/activities/nfe/fetch-nfe-sale-email-context-from-erp.activity.ts
```

Rodar em:

```text
automation-erp-read
```

Responsabilidade:

- consultar ERP por `erpSaleId`;
- retornar contexto da venda;
- tratar 0 linhas como falha final de negócio;
- tratar e-mail `NULL` como falha final de negócio;
- separar múltiplos e-mails por `;`;
- validar lista final não vazia.

Retorno recomendado:

```ts
type FetchNfeSaleEmailContextFromErpResult =
  | {
      status: "SUCCESS";
      data: {
        recipients: string[];
        nomeCliente: string;
        idVenda: number;
        valorTotal: number;
        numeroNf: string;
        nfeChave: string | null;
      };
    }
  | {
      status: "FAILED_FINAL";
      errorMessage: string;
    };
```

Falhas transitórias técnicas devem ser lançadas como erro transitório para retry da activity.

### 7. Finalização inicial de status

Implementar no repositório e em activity:

```text
src/temporal/activities/nfe/finalize-nfe-email-dispatch-sale.activity.ts
```

Rodar em:

```text
automation-control
```

Nesta task, a finalização deve suportar pelo menos:

```text
FAILED_FINAL
FAILED_TRANSIENT
DELIVERY_UNKNOWN
SENT
```

Mesmo que `SENT` só seja usado de verdade na Task 27.

Regras:

- `SENT` preenche `sent_at = NOW(3)` e limpa erro;
- status de falha seta `sent_at = NULL` e grava `last_error_message`;
- se resultado transitório e tentativa atual `>= maxSendAttempts`, gravar `FAILED_FINAL`;
- update final deve ter `WHERE id = ? AND status = 'IN_PROGRESS'`;
- se `affectedRows = 0`, consultar estado atual e considerar idempotente se já estiver no status esperado.

### 8. Parent Workflow `processNfeEmailDispatchSalesWorkflow`

Criar:

```text
src/temporal/workflows/nfe/process-nfe-email-dispatch-sales.workflow.ts
```

Responsabilidade:

1. carregar jobs elegíveis;
2. se lista vazia, finalizar sucesso;
3. iniciar child workflow por job;
4. respeitar `maxConcurrentChildren = 5`;
5. aguardar conclusão dos children;
6. consolidar resultado.

### 9. Child Workflow `processSingleNfeEmailDispatchSaleWorkflow`

Criar:

```text
src/temporal/workflows/nfe/process-single-nfe-email-dispatch-sale.workflow.ts
```

Responsabilidade nesta task:

1. gerar `attemptStartedAt` uma única vez no workflow;
2. chamar claim;
3. se `SKIPPED`, encerrar sem ERP/IXC/SMTP;
4. consultar contexto da venda no ERP;
5. se falha final de contexto, finalizar job como `FAILED_FINAL`;
6. se sucesso no contexto, retornar status intermediário controlado, sem ainda buscar PDF/enviar SMTP.

Para não marcar job como enviado sem envio real, há duas opções aceitáveis nesta task:

1. deixar uma falha controlada/documentada indicando que a etapa de envio ainda não foi implementada, gravando `FAILED_TRANSIENT` com mensagem clara; ou
2. estruturar o workflow com um placeholder interno que será substituído na Task 27, sem executar em produção ainda.

A opção 1 é mais segura se a task for rodada em ambiente real acidentalmente.

Mensagem sugerida:

```text
Envio de NF-e por e-mail ainda não implementado nesta etapa da entrega.
```

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
  loadNfeEmailDispatchEligibleSalesActivity
  claimNfeEmailDispatchSaleActivity
  finalizeNfeEmailDispatchSaleActivity

erpReadWorkerActivities:
  fetchNfeSaleEmailContextFromErpActivity
```

## Critérios de aceite

A task está pronta se:

- parent Workflow 2 existe e compila;
- child Workflow 2 existe e compila;
- load elegíveis funciona por repository/activity;
- claim atômico funciona por repository/activity;
- validação de claim já feito pela mesma tentativa existe;
- query ERP de contexto existe;
- activity ERP de contexto existe;
- e-mails são normalizados por `;`;
- e-mail inválido/vazio gera `FAILED_FINAL`;
- finalização de status existe e é idempotente;
- nenhuma chamada IXC PDF/SMTP foi implementada por engano;
- activities/workflows estão exportados e registrados;
- `pnpm typecheck` passa;
- `pnpm lint` passa;
- `docs/CURRENT_STATE.md` e `docs/TASK_BOARD.md` foram atualizados.

## Validação mínima

Executar:

```bash
pnpm typecheck
pnpm lint
```

## Atualização de documentação ao final

Atualizar:

- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`

No `TASK_BOARD`, adicionar a Task 26 como concluída somente se os critérios de aceite foram cumpridos.

## Ao terminar

Responder com:

1. resumo curto do que foi feito;
2. arquivos alterados;
3. validações executadas;
4. pendências ou riscos;
5. confirmação de atualização de docs.
