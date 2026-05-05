# Operação atual do CSAT

## Objetivo
Este documento cobre a operação corrente do trigger de `csat` no repositório:
- MariaDB do sistema para idempotência durável;
- workers necessários para o fluxo completo;
- `Temporal Schedule` oficial do trigger;
- validação mínima de runtime.

## Variáveis de ambiente relevantes
```dotenv
SYSTEM_DB_HOST=localhost
SYSTEM_DB_PORT=3306
SYSTEM_DB_DATABASE=automation_server
SYSTEM_DB_USERNAME=automation
SYSTEM_DB_PASSWORD=change-me
SYSTEM_DB_CONNECT_TIMEOUT_MS=10000
SYSTEM_DB_CONNECTION_LIMIT=5

CSAT_TRIGGER_SCHEDULE_ENABLED=true
CSAT_TRIGGER_SCHEDULE_ID=csat-start-survey-hourly
CSAT_TRIGGER_SCHEDULE_INTERVAL_MINUTES=60
CSAT_TRIGGER_SCHEDULE_TASK_QUEUE=automation-control
CSAT_TRIGGER_SCHEDULE_WORKFLOW_ID=csat-start-survey/schedule
```

## Processos necessários para o fluxo completo
Para o trigger de `csat` funcionar de ponta a ponta, o ambiente precisa de:
- `Temporal`;
- `system-db`;
- worker `control`;
- worker `erp-read`;
- worker `opa`;
- worker `ixc`.

A API não é obrigatória para o processamento do `csat` hoje, porque não existe rota HTTP própria para iniciar esse workflow.

## Migrations do MariaDB do sistema
O projeto tem runner explícito de migration:

```bash
node --env-file-if-exists=.env --import tsx src/infra/system-db/run-system-db-migrations.ts
```

Mas existe uma nuance importante do runtime atual:
- a API executa `runSystemDbMigrations()` no startup;
- todos os entrypoints padrão de worker também executam `runSystemDbMigrations()` no startup.

Na prática, a migration continua sendo idempotente e o comando manual é útil para bootstrap antecipado, CI ou troubleshooting.

## Activities protegidas por idempotência durável
As mutações críticas do CSAT persistem reserva e finalização em `workflow_step_idempotency`:
- `forwardServiceOrderOnFailureActivity`
- `sendCsatMessageActivity`
- `registerCsatSuccessEventOnOsActivity`

## Garantir o schedule oficial do CSAT
Executar:

```bash
pnpm temporal:ensure:csat-schedule
```

Comportamento atual:
- se o schedule não existir, ele é criado;
- se já existir, ele é atualizado para o estado configurado;
- `CSAT_TRIGGER_SCHEDULE_ENABLED=true` deixa o schedule despausado;
- `CSAT_TRIGGER_SCHEDULE_ENABLED=false` mantém o schedule pausado, mas ainda gerenciado pelo `ensure`;
- o comando imprime `scheduleId`, `taskQueue`, `workflowType`, `actionInput` e `nextActionTimes`.

Para inspecionar:

```bash
pnpm temporal:describe:csat-schedule
```

Para remover:

```bash
pnpm temporal:delete:csat-schedule
```

## Validação local mínima
### Stack local
```bash
docker compose up -d temporal system-db
pnpm temporal:workers:all
pnpm temporal:ensure:csat-schedule
pnpm temporal:describe:csat-schedule
```

Se quiser subir também a API pelo compose atual:

```bash
pnpm docker:dev:up:api
```

### Base estática
```bash
pnpm lint
pnpm typecheck
```

### Idempotência
1. Garantir que o `system-db` esteja acessível.
2. Executar um item real do fluxo até uma das mutações do IXC.
3. Consultar a tabela:

```sql
SELECT
  workflow_name,
  workflow_id,
  step_name,
  idempotency_key,
  execution_status,
  external_reference,
  updated_at
FROM workflow_step_idempotency
ORDER BY id DESC;
```

4. Repetir a mesma mutação no mesmo contexto e confirmar que não houve efeito externo duplicado.

## Limitações operacionais reais
- `pnpm temporal:worker` continua sendo apenas o alias do worker `control`;
- a query de elegíveis do ERP continua com filtro fixo por contrato;
- o schedule do CSAT não é criado automaticamente no bootstrap;
- o compose atual sobe a API apenas com o profile `api`;
- `GET /healthz` detalhado da API continua público na implementação atual;
- smoke tests reais dependem de credenciais válidas de ERP, OPA e IXC.
