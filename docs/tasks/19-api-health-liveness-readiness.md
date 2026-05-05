# Nome
API — implementar `livez`, `readyz` e `healthz`

## Objetivo
Criar a base de healthchecks da API com separação clara entre liveness, readiness e deep health, usando checks reutilizáveis e cache curto.

## Leitura obrigatória
- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/TEMPORAL_RULES.md`
- `docs/ERROR_CLASSIFICATION.md`
- `docs/specs/health-readiness-runtime.md`
- `[esta task]`

## Escopo permitido
- `src/app/create-server.ts`
- `src/app/routes/health.route.ts`
- `src/app/health/**`
- `src/infra/config/app.config.ts`
- `src/infra/config/env.ts`
- `.env.example`

## Não pode
- alterar workflows de negócio
- alterar activities de negócio
- alterar integrações OPA/IXC/ERP além do estritamente necessário para checks leves
- alterar o runtime do worker nesta task

## Entregáveis
- estrutura nova em `src/app/health/`
- tipos de health da API
- serviço de checks com cache curto
- rotas `GET /livez`, `GET /readyz`, `GET /healthz`
- compatibilidade temporária para `GET /health` como alias de `GET /livez`

## Critérios de aceite
- `/livez` retorna `200` sem depender de serviços externos
- `/readyz` retorna `200` quando Temporal + system DB estão acessíveis
- `/readyz` retorna `503` quando Temporal ou system DB falham
- `/healthz` retorna payload detalhado com dependências centrais e opcionais
- o código compila com tipagem explícita
- o cache evita rechecagem desnecessária dentro do TTL

## Validação mínima
- `pnpm typecheck`
- `pnpm lint`

## Atualização de documentação ao final
- atualizar `docs/CURRENT_STATE.md`
- atualizar `docs/TASK_BOARD.md`

## Observações
- manter a implementação pequena e didática
- usar `Promise.allSettled` no deep health
- não transformar `/readyz` em check de ERP, OPA ou IXC
