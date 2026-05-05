# Nome
Health runtime — finalizar deep health, cache, documentação e validação

## Objetivo
Concluir a camada de healthchecks adicionando checks opcionais de integrações, refinando cache e atualizando a documentação operacional do projeto.

## Leitura obrigatória
- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/INTEGRATIONS_RULES.md`
- `docs/specs/health-readiness-runtime.md`
- `[esta task]`

## Escopo permitido
- `src/app/health/**`
- `src/temporal/worker/**`
- `src/integrations/**` apenas para checks leves, se necessário
- `src/infra/config/env.ts`
- `.env.example`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/HEALTH_READINESS_RULES.md`
- `docs/HEALTH_READINESS_IMPLEMENTATION_GUIDE.md`
- `docs/WORKER_HEALTHCHECKS_OPERATION.md`

## Não pode
- alterar lógica de negócio dos módulos `csat` e `cobrancas`
- acoplar readiness a ERP, OPA ou IXC
- adicionar observabilidade externa completa nesta task

## Entregáveis
- deep health da API cobrindo Temporal, system DB, ERP, OPA e IXC
- deep health do worker cobrindo ao menos Temporal e system DB
- cache curto configurável por ambiente
- documentação operacional nova em `docs/`
- atualização do estado atual e board

## Critérios de aceite
- `/healthz` informa status detalhado por dependência
- falha de uma dependência opcional não quebra o payload inteiro
- cache do health runtime é configurável e evita rechecagem excessiva
- `docs/CURRENT_STATE.md` passa a refletir os novos endpoints
- `docs/TASK_BOARD.md` registra a entrega e a próxima pendência

## Validação mínima
- `pnpm typecheck`
- `pnpm lint`

## Atualização de documentação ao final
- atualizar `docs/CURRENT_STATE.md`
- atualizar `docs/TASK_BOARD.md`

## Observações
- manter payloads curtos, objetivos e seguros
- se `healthz` detalhar demais, proteger com Basic Auth ou registrar isso como pendência explícita
