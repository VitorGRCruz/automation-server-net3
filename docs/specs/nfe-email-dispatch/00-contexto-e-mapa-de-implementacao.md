# NF-e Email Dispatch — contexto e mapa de implementação

## Estado atual relevante do projeto

O projeto já possui a infraestrutura necessária para implementar a automação de NF-e:

- Node.js + TypeScript + Fastify + Temporal;
- workers segmentados por task queue:
  - `automation-control`;
  - `automation-erp-read`;
  - `automation-opa`;
  - `automation-ixc`;
- MySQL próprio do sistema em `src/infra/system-db/`;
- integração read-only com ERP em `src/integrations/erp-db/`;
- integração IXC em `src/integrations/ixc/`;
- integração SMTP em `src/integrations/smtp/`;
- activity compartilhada `sendSmtpEmailActivity` em `src/temporal/activities/shared/`;
- mecanismo de migrations do banco da automação em `src/infra/system-db/migrations/`.

O módulo `nfe` ainda não existe no código. A implementação deve adicioná-lo sem refatorar módulos já existentes.

## Nome do módulo

Usar o módulo de negócio:

```text
nfe
```

## Workflows alvo

```text
src/temporal/workflows/nfe/fetch-customer-nfe-sales-candidates.workflow.ts
src/temporal/workflows/nfe/fetch-single-customer-nfe-sales-candidates.workflow.ts
src/temporal/workflows/nfe/process-nfe-email-dispatch-sales.workflow.ts
src/temporal/workflows/nfe/process-single-nfe-email-dispatch-sale.workflow.ts
src/temporal/workflows/nfe/index.ts
```

Nomes exportados sugeridos:

```ts
fetchCustomerNfeSalesCandidatesWorkflow
fetchSingleCustomerNfeSalesCandidatesWorkflow
processNfeEmailDispatchSalesWorkflow
processSingleNfeEmailDispatchSaleWorkflow
```

## Types e regras de domínio

Criar contratos explícitos em:

```text
src/domain/nfe/nfe-email-dispatch.types.ts
```

O arquivo deve concentrar, no mínimo:

- tipos dos clientes cadastrados;
- tipos de venda candidata retornada pelo ERP;
- tipos de job de envio no banco da automação;
- tipos de input/output dos workflows pai e child;
- status oficiais dos jobs;
- constantes ou unions para falhas finais, transitórias e delivery unknown;
- helpers puros de domínio, quando fizer sentido, sem I/O.

## Activities alvo

Criar pasta:

```text
src/temporal/activities/nfe/
```

Activities sugeridas:

```text
load-nfe-email-dispatch-customers.activity.ts
fetch-customer-nfe-sales-candidates-from-erp.activity.ts
enqueue-nfe-email-dispatch-sales.activity.ts
load-nfe-email-dispatch-eligible-sales.activity.ts
claim-nfe-email-dispatch-sale.activity.ts
fetch-nfe-sale-email-context-from-erp.activity.ts
fetch-nfe-pdf-from-ixc.activity.ts
render-nfe-email-template.activity.ts
finalize-nfe-email-dispatch-sale.activity.ts
index.ts
```

A activity SMTP compartilhada existente deve ser reutilizada:

```text
src/temporal/activities/shared/send-smtp-email.activity.ts
```

Não criar outro client SMTP sem motivo claro.

## Repositório do banco da automação

Criar repositório específico do módulo:

```text
src/infra/system-db/nfe-email-dispatch.repository.ts
```

Responsabilidades desse repositório:

- carregar clientes cadastrados;
- inserir vendas candidatas idempotentemente;
- carregar vendas elegíveis para envio;
- fazer claim atômico do job;
- validar claim já feito pela mesma execução;
- finalizar job com status `SENT`, `FAILED_TRANSIENT`, `FAILED_FINAL` ou `DELIVERY_UNKNOWN`;
- consultar status atual para idempotência da finalização.

Não espalhar SQL do banco da automação dentro dos workflows.

## Migration do banco da automação

Criar:

```text
src/infra/system-db/migrations/003_create_nfe_email_dispatch_tables.sql
```

Atualizar:

```text
src/infra/system-db/run-system-db-migrations.ts
```

A migration deve criar as tabelas:

```text
nfe_email_dispatch_customer
nfe_email_dispatch_sale
```

Usar `CREATE TABLE IF NOT EXISTS` para manter o runner idempotente, seguindo o padrão da primeira migration existente.

## ERP read-only

Adicionar queries no arquivo existente:

```text
src/integrations/erp-db/erp-db.queries.ts
```

Queries novas esperadas:

```ts
fetchCustomerNfeSalesCandidates
fetchNfeSaleEmailContext
```

A conexão ERP continua read-only. Não executar insert/update/delete no ERP.

## IXC API

Adicionar ao client IXC uma operação para buscar o PDF/base64 da NF-e:

```text
POST imprimir_nota
payload: { id: <id_venda>, base64: "S" }
```

A activity `fetchNfePdfFromIxcActivity` deve:

1. chamar o client IXC;
2. validar conteúdo base64;
3. decodificar para buffer;
4. validar que o buffer começa com `%PDF`;
5. salvar em `/var/tmp/nfe-email-dispatch`;
6. retornar apenas `{ pdfPath }`.

## Template HTML

Template sugerido:

```text
src/domain/nfe/templates/nfe-email-template.html
```

Como o `Dockerfile` copia apenas `dist` para runtime, o build precisa copiar esse template para `dist/domain/nfe/templates/`.

Uma solução simples é ajustar o script `build` do `package.json` para copiar também os templates após o `tsc`, por exemplo com `mkdir -p` e `cp`.

Não importar HTML diretamente como módulo TypeScript sem configurar explicitamente o build.

## Task queues

Mapeamento recomendado:

```text
automation-control
  - todos os workflows nfe
  - loadNfeEmailDispatchCustomersActivity
  - enqueueNfeEmailDispatchSalesActivity
  - loadNfeEmailDispatchEligibleSalesActivity
  - claimNfeEmailDispatchSaleActivity
  - renderNfeEmailTemplateActivity
  - finalizeNfeEmailDispatchSaleActivity
  - sendSmtpEmailActivity existente
  - activity leve para verificar se Workflow 1 está ativo, se criada

automation-erp-read
  - fetchCustomerNfeSalesCandidatesFromErpActivity
  - fetchNfeSaleEmailContextFromErpActivity

automation-ixc
  - fetchNfePdfFromIxcActivity
```

## Atenção: PDF local e workers separados

A especificação pede que a activity de PDF retorne um caminho local, não base64.

No projeto atual, `fetchNfePdfFromIxcActivity` tende a rodar no worker `automation-ixc`, enquanto `sendSmtpEmailActivity` já roda no worker `automation-control`.

Se os workers estiverem em containers diferentes, o caminho `/var/tmp/nfe-email-dispatch/...pdf` só funcionará se esse diretório for compartilhado entre os containers/processos envolvidos.

Decisão recomendada para a primeira versão:

```text
Montar /var/tmp/nfe-email-dispatch como volume compartilhado entre worker-control e worker-ixc.
```

Em Docker Compose, isso significa adicionar um volume nomeado comum aos serviços desses workers. Em produção, a mesma regra vale: os dois processos precisam enxergar o mesmo diretório.

Alternativa possível, mas menos alinhada à arquitetura atual:

```text
Executar a busca do PDF e o envio SMTP no mesmo worker/contexto, evitando passagem de caminho entre hosts.
```

Não escolher a alternativa sem registrar a decisão em `docs/CURRENT_STATE.md`.

## Schedules esperados

Criar clients explícitos em:

```text
src/temporal/client/nfe-email-dispatch-discovery-schedule.client.ts
src/temporal/client/nfe-email-dispatch-processing-schedule.client.ts
```

Criar scripts:

```text
src/temporal/client/ensure-nfe-email-dispatch-discovery-schedule.ts
src/temporal/client/describe-nfe-email-dispatch-discovery-schedule.ts
src/temporal/client/delete-nfe-email-dispatch-discovery-schedule.ts
src/temporal/client/ensure-nfe-email-dispatch-processing-schedule.ts
src/temporal/client/describe-nfe-email-dispatch-processing-schedule.ts
src/temporal/client/delete-nfe-email-dispatch-processing-schedule.ts
```

Adicionar scripts no `package.json` seguindo a convenção dos módulos existentes.

## Configuração sugerida

Adicionar envs com defaults seguros:

```text
NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_ENABLED=false
NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_ID=nfe-email-dispatch-discovery-daily-0300
NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_TASK_QUEUE=automation-control
NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_WORKFLOW_ID=nfe-email-dispatch/discovery/schedule
NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_TIMEZONE=America/Campo_Grande
NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_HOUR=3
NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_MINUTE=0

NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_ENABLED=false
NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_ID=nfe-email-dispatch-processing-daily-0800
NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_TASK_QUEUE=automation-control
NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_WORKFLOW_ID=nfe-email-dispatch/processing/schedule
NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_TIMEZONE=America/Campo_Grande
NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_HOUR=8
NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_MINUTE=0

NFE_EMAIL_DISPATCH_DISCOVERY_WINDOW_DAYS=15
NFE_EMAIL_DISPATCH_MAX_CONCURRENT_CHILDREN=5
NFE_EMAIL_DISPATCH_MAX_SEND_ATTEMPTS=3
NFE_EMAIL_DISPATCH_PDF_TMP_DIR=/var/tmp/nfe-email-dispatch
```

Se o projeto preferir constantes em código para algumas dessas regras, manter apenas schedules e path em env. Documentar a escolha.

## Não simultaneidade

Para impedir duas execuções do mesmo workflow:

- usar `ScheduleOverlapPolicy.SKIP` nos schedules;
- usar `workflowId` estável por schedule.

Para impedir o Workflow 2 de rodar enquanto o Workflow 1 está ativo:

- criar uma activity leve no `automation-control` que use Temporal Client para verificar se o workflow de descoberta está em execução; ou
- usar outro mecanismo explícito de lock operacional no banco da automação.

A solução recomendada é uma activity de controle com Temporal Client, pois evita criar lock paralelo sem necessidade.

## Observabilidade mínima

A primeira versão deve ter logs estruturados suficientes para rastrear:

- início e fim dos workflows pai;
- total de clientes processados;
- total de vendas encontradas/enfileiradas;
- total de jobs processados;
- quantidade por status final;
- erro por cliente/venda, sem logar PDF/base64 e sem expor dados sensíveis.

Métricas novas são desejáveis, mas não obrigatórias na primeira entrega, já que o projeto possui interceptors de activities.
