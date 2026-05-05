# Nome
Worker — adicionar health server próprio com `livez`, `readyz` e `healthz`

## Objetivo
Dar visibilidade operacional ao processo do worker, expondo endpoints HTTP mínimos para liveness, readiness e deep health sem depender da API principal.

## Leitura obrigatória
- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/TEMPORAL_RULES.md`
- `docs/specs/health-readiness-runtime.md`
- `[esta task]`

## Escopo permitido
- `src/temporal/worker/create-worker.ts`
- `src/temporal/worker/run-worker.ts`
- `src/temporal/worker/**`
- `src/infra/config/app.config.ts`
- `src/infra/config/env.ts`
- `.env.example`

## Não pode
- alterar workflows de negócio
- alterar activities de negócio
- mover o worker para outra task queue
- criar dependência nova de framework HTTP só para o worker

## Entregáveis
- `worker-health-state.ts`
- `worker-health-server.ts`
- estado em memória do worker com flags mínimas de bootstrap e execução
- endpoints `GET /livez`, `GET /readyz`, `GET /healthz` no worker
- bootstrap do worker ajustado para atualizar o estado corretamente

## Critérios de aceite
- o worker expõe HTTP próprio de health
- `/livez` responde quando o processo do worker está vivo
- `/readyz` só responde `200` quando bootstrap + Temporal + system DB estiverem ok
- `/healthz` expõe payload detalhado do worker e dependências centrais
- o health server não interfere no loop principal do worker

## Validação mínima
- `pnpm typecheck`
- `pnpm lint`

## Atualização de documentação ao final
- atualizar `docs/CURRENT_STATE.md`
- atualizar `docs/TASK_BOARD.md`

## Observações
- preferir implementação pequena com `node:http` ou Fastify mínimo, sem criar arquitetura paralela
- evitar logs verbosos por probe
- usar a mesma convenção de status da API sempre que possível
