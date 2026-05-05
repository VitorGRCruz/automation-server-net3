# Estado atual do repositório

## Resumo verificado no código
- projeto Node.js + TypeScript + Fastify + Temporal + MariaDB/MySQL, gerenciado com `pnpm`;
- API HTTP em `src/app/` com `GET /livez`, `GET /readyz`, `GET /healthz`, alias `GET /health` e `GET /metrics` quando `METRICS_ENABLED=true`;
- `GET /metrics` usa autenticação própria: quando `METRICS_EXPOSURE=protected`, exige Basic Auth mesmo que `BASIC_AUTH_ENABLED=false`;
- rotas manuais atuais:
  - `POST /manual/actions/diagnostics/ping` responde de forma síncrona;
  - `POST /manual/workflows/diagnostics/echo` inicia o workflow de diagnóstico e responde `202`;
- as rotas manuais só exigem credenciais quando `BASIC_AUTH_ENABLED=true`;
- a API também expõe a superfície externa de `nfe` em `/api/nfe/email-dispatch`:
  - `POST /api/nfe/email-dispatch/customers` faz cadastro idempotente por `erpCustomerId`;
  - `GET /api/nfe/email-dispatch/customers` lista clientes com filtros e paginação por `limit`/`offset`;
  - `DELETE /api/nfe/email-dispatch/customers` remove cliente por `id` ou `erpCustomerId`, com deleção em cascata dos jobs vinculados;
  - `GET /api/nfe/email-dispatch/sales` lista vendas com filtros por cliente, venda, status, datas e `runtimeScope`; quando `runtimeScope` não é informado, a consulta retorna todos os scopes;
  - `GET /api/nfe/email-dispatch/sales/status-counts` devolve a contagem agrupada por status, com filtro opcional por `lastAttemptFrom` e `lastAttemptTo` usando `last_attempt_at`;
- essas rotas externas de `nfe` reutilizam `Basic Auth` condicional da API atual e traduzem indisponibilidade transitória do `system-db` para HTTP `503`;
- o startup da API executa `runSystemDbMigrations()` antes de abrir a porta HTTP;
- toda a configuração principal está centralizada em `src/infra/config/`, com defaults em `env.ts` e alguns aliases legados para ERP, IXC e SMTP;
- o build também copia o template HTML de `nfe` para `dist/domain/nfe/templates/`, além das migrations SQL;
- o `docker-compose.yml` atual sobe `temporal`, `system-db` e os quatro workers por padrão; a API só entra quando o profile `api` é ativado;
- no `docker-compose.yml`, `worker-control` e `worker-ixc` agora compartilham o volume `nfe-email-dispatch-tmp` montado em `/var/tmp/nfe-email-dispatch` para permitir que o PDF buscado na IXC seja anexado depois pelo SMTP;
- o `Dockerfile` é multi-stage e gera runtime imutável em `dist/`.

## Superfície Temporal atual
- workflow de diagnóstico: `diagnosticsEchoWorkflow`;
- workflows de negócio:
  - `csatStartSurveyWorkflow`
  - `csatProcessSurveyItemWorkflow`
  - `equipmentRetrievalVerificationWorkflow`
  - `equipmentRetrievalVerificationRecoveryWorkflow`
  - `equipmentRetrievalVerificationProcessItemWorkflow`
  - `fetchCustomerNfeSalesCandidatesWorkflow`
  - `fetchSingleCustomerNfeSalesCandidatesWorkflow`
  - `processNfeEmailDispatchSalesWorkflow`
  - `processSingleNfeEmailDispatchSaleWorkflow`
- os workflows de `csat`, `cobrancas` e `nfe` agora aceitam `runtimePolicy?: AutomationRuntimePolicyInput`; quando ausente, continuam em produção, e em `development` usam `testRunId` para escopar parent IDs, child IDs e idempotência
- clients operacionais:
  - `start-diagnostics-workflow.ts`
  - `ensure/describe/delete` de schedule para `csat`
  - `ensure/describe/delete` de schedule para `cobrancas`
  - `ensure/describe/delete` de schedule para discovery do `nfe`
  - `ensure/describe/delete` de schedule para processing do `nfe`
  - `src/temporal/client/dev/start-csat-dev-workflow.ts`
  - `src/temporal/client/dev/start-cobrancas-dev-workflow.ts`
  - `src/temporal/client/dev/start-nfe-discovery-dev-workflow.ts`
  - `src/temporal/client/dev/start-nfe-processing-dev-workflow.ts`
- task queues atuais:
  - `automation-control`
  - `automation-erp-read`
  - `automation-opa`
  - `automation-ixc`

## Workers atuais
- `automation-control` executa todos os workflows, a activity de diagnóstico, a activity compartilhada de SMTP e as activities leves de registro de falha de trigger;
- `automation-control` também executa as activities de `nfe` para carregar clientes da automação e enfileirar vendas candidatas;
- `automation-control` também executa as activities de `nfe` para carregar jobs elegíveis, verificar se a discovery está ativa, fazer claim, renderizar o template HTML e finalizar status do Workflow 2;
- `automation-erp-read` executa leituras do ERP para `csat`, `cobrancas`, descoberta de vendas candidatas de `nfe` e consulta do contexto de e-mail da venda no Workflow 2;
- `automation-opa` executa apenas consultas ao OPA;
- `automation-ixc` executa mutações do IXC e a busca do PDF de NF-e por `imprimir_nota`;
- os entrypoints padrão com health server HTTP habilitado são `run-control-worker.ts` e `run-ixc-worker.ts`;
- `pnpm temporal:workers:all` sobe os quatro workers em paralelo, usando `WORKER_HEALTH_PORT=3001` para `control` e `WORKER_HEALTH_PORT=3004` para `ixc`.

## Health e metrics
- a API expõe `livez`, `readyz` e `healthz` com cache curto em memória;
- `readyz` da API depende só de `Temporal` e `systemDb`;
- `healthz` da API adiciona probes opcionais de `erpDb`, `opa` e `ixc`;
- o health server do worker é um servidor `node:http` separado do Fastify;
- quando o health server está habilitado, ele expõe `GET /livez`, `GET /readyz`, `GET /healthz` e `GET /metrics` quando `METRICS_ENABLED=true`;
- o worker considera readiness a combinação de:
  - bootstrap concluído;
  - loop principal ativo;
  - `Temporal` acessível;
  - `systemDb` acessível;
- as métricas Prometheus atuais cobrem triggers, idempotência durável e execução de activities por fila.

## Integrações e módulos
- `csat` já usa:
  - consulta de elegíveis no ERP;
  - busca de cliente e contato no OPA;
  - envio de mensagem, encaminhamento por falha e registro de sucesso no IXC;
  - idempotência durável no MariaDB do sistema para as mutações do IXC;
- `cobrancas` já usa:
  - consulta de elegíveis no ERP;
  - criação de OS no IXC;
  - idempotência durável no MariaDB do sistema;
  - workflow de recovery com atraso durável de 2 horas;
  - modo dev/test run-scoped também no `requestId`, child workflow ID, recovery workflow ID e chave de criação de OS;
- `nfe` agora possui fundação inicial com:
  - contratos tipados em `src/domain/nfe/nfe-email-dispatch.types.ts`;
  - template HTML oficial em `src/domain/nfe/templates/nfe-email-template.html`;
  - config base em `src/infra/config/nfe-email-dispatch.config.ts`;
  - migration `003_create_nfe_email_dispatch_tables.sql`;
  - repositório no `system-db` para clientes/jobs, claim/finalização, upsert idempotente de cliente e consultas paginadas com filtros para clientes e vendas;
  - Workflow 1 implementado com parent `fetchCustomerNfeSalesCandidatesWorkflow`, child `fetchSingleCustomerNfeSalesCandidatesWorkflow`, query ERP por cliente e enqueue idempotente de jobs `PENDING`;
  - limite determinístico de no máximo 5 child workflows simultâneos na descoberta, reabastecido conforme os anteriores terminam;
  - Workflow 2 implementado com parent `processNfeEmailDispatchSalesWorkflow`, child `processSingleNfeEmailDispatchSaleWorkflow`, carga de jobs `PENDING`/`FAILED_TRANSIENT`, claim atômico, consulta ERP do contexto de e-mail, busca do PDF via IXC, renderização segura do template, envio via `sendSmtpEmailActivity` com `maximumAttempts: 1` e finalização idempotente de status;
  - a activity `fetchNfePdfFromIxcActivity` salva o PDF apenas em disco no diretório configurado por `NFE_EMAIL_DISPATCH_PDF_TMP_DIR`, valida `%PDF` antes do write e nunca trafega o base64 pelo workflow;
  - o child do Workflow 2 agora mapeia `SENT`, `FAILED_FINAL`, `FAILED_TRANSIENT` e `DELIVERY_UNKNOWN`, incluindo o caso de ambiguidade da idempotência durável do SMTP;
  - o parent do Workflow 2 agora consulta explicitamente se o workflow configurado para discovery está em execução e, se estiver, finaliza como `SKIPPED_DISCOVERY_RUNNING` sem carregar jobs;
  - a tabela `nfe_email_dispatch_sale` agora possui `runtime_scope`, com unique key por `(runtime_scope, nfe_email_dispatch_customer_id, erp_sale_id)` para permitir discovery/processing repetíveis por `testRunId`;
  - a API HTTP agora possui um service dedicado e uma rota externa para cadastro, listagem e remoção de clientes, além de listagem de vendas e contagem agregada por status do dispatch de NF-e;
- SMTP já existe como integração compartilhada em `src/integrations/smtp/` e agora é consumido pelo Workflow 2 de `nfe`, sem retries automáticos de activity para evitar duplicidade de envio.

## Schedules atuais
- `csat` possui schedule oficial configurável por:
  - `CSAT_TRIGGER_SCHEDULE_ENABLED`
  - `CSAT_TRIGGER_SCHEDULE_ID`
  - `CSAT_TRIGGER_SCHEDULE_INTERVAL_MINUTES`
  - `CSAT_TRIGGER_SCHEDULE_TASK_QUEUE`
  - `CSAT_TRIGGER_SCHEDULE_WORKFLOW_ID`
- `cobrancas` possui schedule oficial configurável por:
  - `COBRANCAS_EQUIPMENT_RETRIEVAL_TRIGGER_SCHEDULE_ENABLED`
  - `COBRANCAS_EQUIPMENT_RETRIEVAL_TRIGGER_SCHEDULE_ID`
  - `COBRANCAS_EQUIPMENT_RETRIEVAL_TRIGGER_SCHEDULE_INTERVAL_MINUTES`
  - `COBRANCAS_EQUIPMENT_RETRIEVAL_TRIGGER_SCHEDULE_TASK_QUEUE`
  - `COBRANCAS_EQUIPMENT_RETRIEVAL_TRIGGER_SCHEDULE_WORKFLOW_ID`
  - `COBRANCAS_EQUIPMENT_RETRIEVAL_TRIGGER_START_AT`
- `nfe` possui dois schedules oficiais configuráveis:
  - discovery:
    - `NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_ENABLED`
    - `NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_ID`
    - `NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_TASK_QUEUE`
    - `NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_WORKFLOW_ID`
    - `NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_TIMEZONE`
    - `NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_HOUR`
    - `NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_MINUTE`
  - processing:
    - `NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_ENABLED`
    - `NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_ID`
    - `NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_TASK_QUEUE`
    - `NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_WORKFLOW_ID`
    - `NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_TIMEZONE`
    - `NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_HOUR`
    - `NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_MINUTE`
- os schedules não são criados automaticamente no bootstrap; a rotina explícita de `ensure` é a forma suportada de criar ou atualizar.

## Estrutura relevante
```text
src/
  app/
    health/
    plugins/
    routes/
      health.route.ts
      manual.route.ts
      metrics.route.ts
  domain/
    csat/
    cobrancas/
    nfe/
    shared/
  infra/
    config/
    http/
    observability/
    runtime/
    system-db/
  integrations/
    erp-db/
    opa/
    ixc/
    smtp/
  temporal/
    activities/
      cobrancas/
      csat/
      nfe/
      shared/
    client/
    worker/
    workflows/
      cobrancas/
      csat/
      diagnostics/
      nfe/
```

## Scripts relevantes
- API:
  - `pnpm dev`
  - `pnpm build`
  - `pnpm start`
- workers:
  - `pnpm temporal:worker` (alias legado de `control`)
  - `pnpm temporal:worker:control`
  - `pnpm temporal:worker:erp-read`
  - `pnpm temporal:worker:opa`
  - `pnpm temporal:worker:ixc`
  - `pnpm temporal:workers:all`
- diagnósticos e schedules:
  - `pnpm temporal:start`
  - `pnpm temporal:ensure:csat-schedule`
  - `pnpm temporal:describe:csat-schedule`
  - `pnpm temporal:delete:csat-schedule`
  - `pnpm temporal:ensure:cobrancas-equipment-retrieval-schedule`
  - `pnpm temporal:describe:cobrancas-equipment-retrieval-schedule`
  - `pnpm temporal:delete:cobrancas-equipment-retrieval-schedule`
  - `pnpm temporal:ensure:nfe-email-dispatch-discovery-schedule`
  - `pnpm temporal:describe:nfe-email-dispatch-discovery-schedule`
  - `pnpm temporal:delete:nfe-email-dispatch-discovery-schedule`
  - `pnpm temporal:ensure:nfe-email-dispatch-processing-schedule`
  - `pnpm temporal:describe:nfe-email-dispatch-processing-schedule`
  - `pnpm temporal:delete:nfe-email-dispatch-processing-schedule`
  - `pnpm temporal:dev:csat`
  - `pnpm temporal:dev:cobrancas`
  - `pnpm temporal:dev:nfe:discovery`
  - `pnpm temporal:dev:nfe:processing`
- docker:
  - `pnpm docker:dev:up`
  - `pnpm docker:dev:up:api`
  - `pnpm docker:dev:down`
  - `pnpm docker:dev:logs`
- validação estática:
  - `pnpm lint`
  - `pnpm typecheck`

## Limitações e nuances operacionais reais
- não existe rota HTTP de webhook no projeto hoje;
- não existe wrapper HTTP nem script dedicado para iniciar manualmente os workflows de negócio de `csat` ou `cobrancas`; hoje o caminho operacional encapsulado é o schedule do Temporal;
- `pnpm temporal:worker` sobe só o worker de controle e não basta para executar o fluxo completo de `csat` ou `cobrancas`;
- `pnpm temporal:worker` também não basta para executar o Workflow 1 de descoberta de `nfe`; é preciso subir ao menos `control` + `erp-read`;
- `pnpm temporal:worker` também não basta para executar o Workflow 2 completo de `nfe`; é preciso subir ao menos `control` + `erp-read` + `ixc`;
- os schedules de `nfe` existem em código, mas continuam desabilitados por padrão até configuração explícita de ambiente e execução dos comandos de `ensure`;
- os scripts `temporal:dev:*` escopam IDs e idempotência por `TEST_RUN_ID`, mas continuam podendo acionar side effects reais em IXC e SMTP se apontarem para integrações reais;
- a query de elegíveis do CSAT continua restrita ao filtro fixo `WHERE cc.id IN (38804, 39171)`;
- a query de elegíveis de `cobrancas` em `src/integrations/erp-db/erp-db.queries.ts` está atualmente hardcoded para `os.id = 98636` e ids sintéticos de cobrança/receber, portanto não representa ainda uma consulta genérica de produção;
- `run-control-worker.ts` e `run-ixc-worker.ts` usam o mesmo `WORKER_HEALTH_PORT` por padrão; fora do `temporal:workers:all` é preciso diferenciar a porta manualmente se ambos rodarem no mesmo host;
- no `docker-compose.yml` atual, os workers não publicam suas portas de health/metrics para o host;
- `GET /healthz` detalhado da API continua público na implementação atual e deve ficar atrás de rede interna ou outro controle externo;
- o módulo `nfe` ainda não tem rotina de recovery para jobs antigos em `IN_PROGRESS`;
- não há suíte automatizada de testes; a validação hoje depende principalmente de `pnpm lint`, `pnpm typecheck` e smoke tests controlados com credenciais reais.
