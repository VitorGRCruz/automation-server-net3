# Task 28 - NF-e Email Dispatch — schedules, operação e validação final

## Objetivo

Criar os schedules oficiais dos dois workflows de NF-e, adicionar scripts operacionais, validar não simultaneidade, documentar operação local/produção e finalizar a trilha da automação.

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
- `docs/specs/nfe-email-dispatch/02-workflow-1-fetch-customer-nfe-sales-candidates.md`
- `docs/specs/nfe-email-dispatch/03-workflow-2-process-nfe-email-dispatch-sales.md`
- `docs/specs/nfe-email-dispatch/05-checklist-de-aceite.md`
- `docs/tasks/24-nfe-email-dispatch-foundation-and-modeling.md`
- `docs/tasks/25-nfe-email-dispatch-discovery-workflow.md`
- `docs/tasks/26-nfe-email-dispatch-processing-core.md`
- `docs/tasks/27-nfe-email-dispatch-pdf-email-and-finalization.md`
- esta task

## Escopo permitido

O agente pode alterar apenas:

- `src/domain/nfe/**`
- `src/infra/config/**`
- `src/temporal/client/**`
- `src/temporal/activities/nfe/**` se precisar criar activity de verificação de workflow ativo
- `src/temporal/workflows/nfe/**` se precisar chamar a verificação antes do processamento
- `src/temporal/activities/index.ts`
- `src/temporal/worker/worker-activity-groups.ts`
- `package.json`
- `.env.example`
- `docker-compose.yml` se ainda faltar volume temporário compartilhado
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ARCHITECTURE.md`
- `docs/TEMPORAL_RULES.md`
- `docs/README.md` se a operação mudou
- `docs/NFE_EMAIL_DISPATCH_OPERATION.md` ou documento equivalente novo

## Não pode

- não refatorar workflows já implementados fora do necessário para schedule/operação;
- não criar rota HTTP sem necessidade;
- não implementar recovery de `IN_PROGRESS` antigo;
- não criar nova fila externa;
- não habilitar schedules por padrão em `.env.example`.

## Entregáveis obrigatórios

### 1. Configurar schedules no env/config

Adicionar em `.env.example` e `src/infra/config/env.ts`:

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
```

Adicionar em `src/infra/config/temporal.config.ts`:

```ts
schedules: {
  ...existentes,
  nfeEmailDispatchDiscovery: ...,
  nfeEmailDispatchProcessing: ...
}
```

### 2. Schedule client do Workflow 1

Criar:

```text
src/temporal/client/nfe-email-dispatch-discovery-schedule.client.ts
```

Funções esperadas:

```ts
ensureNfeEmailDispatchDiscoverySchedule
describeNfeEmailDispatchDiscoverySchedule
findNfeEmailDispatchDiscoverySchedule
deleteNfeEmailDispatchDiscoverySchedule
```

O schedule deve iniciar:

```text
fetchCustomerNfeSalesCandidatesWorkflow
```

Horário:

```text
03:00 no timezone configurado
```

Política de overlap:

```text
ScheduleOverlapPolicy.SKIP
```

### 3. Schedule client do Workflow 2

Criar:

```text
src/temporal/client/nfe-email-dispatch-processing-schedule.client.ts
```

Funções esperadas:

```ts
ensureNfeEmailDispatchProcessingSchedule
describeNfeEmailDispatchProcessingSchedule
findNfeEmailDispatchProcessingSchedule
deleteNfeEmailDispatchProcessingSchedule
```

O schedule deve iniciar:

```text
processNfeEmailDispatchSalesWorkflow
```

Horário:

```text
08:00 no timezone configurado
```

Política de overlap:

```text
ScheduleOverlapPolicy.SKIP
```

### 4. Scripts operacionais

Criar scripts em `src/temporal/client/`:

```text
ensure-nfe-email-dispatch-discovery-schedule.ts
describe-nfe-email-dispatch-discovery-schedule.ts
delete-nfe-email-dispatch-discovery-schedule.ts
ensure-nfe-email-dispatch-processing-schedule.ts
describe-nfe-email-dispatch-processing-schedule.ts
delete-nfe-email-dispatch-processing-schedule.ts
```

Adicionar ao `package.json`:

```text
temporal:ensure:nfe-email-dispatch-discovery-schedule
temporal:describe:nfe-email-dispatch-discovery-schedule
temporal:delete:nfe-email-dispatch-discovery-schedule
temporal:ensure:nfe-email-dispatch-processing-schedule
temporal:describe:nfe-email-dispatch-processing-schedule
temporal:delete:nfe-email-dispatch-processing-schedule
```

### 5. Não simultaneidade entre Workflow 1 e Workflow 2

O Workflow 2 não deve processar enquanto o Workflow 1 estiver ativo.

Implementar uma solução explícita.

Solução recomendada:

- criar uma activity leve em `automation-control` que usa Temporal Client para verificar se o workflow ID configurado para descoberta está em execução;
- chamar essa activity no início de `processNfeEmailDispatchSalesWorkflow` antes de carregar jobs elegíveis;
- se Workflow 1 estiver ativo, finalizar Workflow 2 com status operacional `SKIPPED_DISCOVERY_RUNNING` ou resultado equivalente, sem falhar tecnicamente.

Alternativa aceitável:

- usar lock operacional no banco da automação, desde que seja simples, documentado e não vire uma fila paralela ao Temporal.

Não confiar apenas no intervalo 03:00/08:00.

### 6. Volume temporário compartilhado

Se ainda não estiver resolvido pela Task 27, resolver agora:

```text
/var/tmp/nfe-email-dispatch
```

deve ser visível pelo worker que baixa o PDF e pelo worker que envia o SMTP.

Atualizar:

```text
docker-compose.yml
```

ou documentar explicitamente como produção deve montar esse volume.

### 7. Documento operacional

Criar:

```text
docs/NFE_EMAIL_DISPATCH_OPERATION.md
```

Conteúdo mínimo:

- objetivo dos workflows;
- horários dos schedules;
- como garantir schedules;
- como descrever schedules;
- como pausar/remover schedules;
- workers necessários;
- volume temporário do PDF;
- tabelas envolvidas;
- como cadastrar/remover clientes manualmente no banco da automação;
- significado dos status;
- riscos de `DELIVERY_UNKNOWN`;
- comportamento de `IN_PROGRESS` travado fora do escopo;
- validação antes de habilitar produção;
- comandos `pnpm` relevantes.

### 8. Atualizar documentação principal

Atualizar:

- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ARCHITECTURE.md`
- `docs/TEMPORAL_RULES.md`
- `docs/README.md` se a ordem de leitura ou operação mudou

## Critérios de aceite

A task está pronta se:

- schedule do Workflow 1 existe e usa 03:00;
- schedule do Workflow 2 existe e usa 08:00;
- ambos usam timezone configurável;
- ambos usam `ScheduleOverlapPolicy.SKIP` ou equivalente;
- existem scripts ensure/describe/delete para os dois schedules;
- `package.json` expõe os scripts;
- Workflow 2 verifica que Workflow 1 não está ativo antes de processar;
- volume temporário compartilhado está resolvido ou documentado de forma operacionalmente suficiente;
- documento `docs/NFE_EMAIL_DISPATCH_OPERATION.md` existe;
- `.env.example` documenta as novas variáveis;
- `pnpm typecheck` passa;
- `pnpm lint` passa;
- `pnpm build` passa;
- docs foram atualizadas.

## Validação mínima

Executar:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Se houver Temporal local disponível:

```bash
pnpm temporal:ensure:nfe-email-dispatch-discovery-schedule
pnpm temporal:describe:nfe-email-dispatch-discovery-schedule
pnpm temporal:ensure:nfe-email-dispatch-processing-schedule
pnpm temporal:describe:nfe-email-dispatch-processing-schedule
```

Confirmar:

- task queue `automation-control`;
- horário configurado;
- schedule pausado quando env `*_ENABLED=false`;
- input esperado dos workflows;
- overlap skip.

## Atualização de documentação ao final

Atualizar:

- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ARCHITECTURE.md`
- `docs/TEMPORAL_RULES.md`
- `docs/README.md` se aplicável

No `TASK_BOARD`, adicionar a Task 28 como concluída somente se os critérios de aceite foram cumpridos.

## Ao terminar

Responder com:

1. resumo curto do que foi feito;
2. arquivos alterados;
3. comandos de schedule criados;
4. validações executadas;
5. como habilitar em produção;
6. pendências ou riscos restantes.
