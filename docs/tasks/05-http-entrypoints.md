# Task 05 - Entrypoints HTTP para ações simples e início de workflows

## Objetivo
Conectar a API à base Temporal e criar as primeiras rotas de entrada úteis ao projeto: uma rota de ação simples e uma rota que inicia workflow de diagnóstico.

## Leitura obrigatória
- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/API_AND_WEBHOOK_RULES.md`
- `docs/TEMPORAL_RULES.md`

## Escopo permitido
- `src/app/**`
- `src/temporal/**`
- `src/infra/**` se necessário
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`

## Não pode
- implementar workflow real de CSAT ainda;
- acoplar rota diretamente a activity sem critério;
- criar respostas HTTP longas ou complexas sem necessidade.

## Entregáveis
- rota manual para ação simples síncrona;
- rota manual para iniciar workflow de diagnóstico;
- retorno padronizado com `ok` e dados mínimos úteis.

## Critérios de aceite
- a API consegue acionar o Temporal por rota;
- permanece simples diferenciar ação síncrona de início de workflow;
- código HTTP continua sem regra de negócio pesada.

## Validação mínima
- `pnpm typecheck`

## Atualização de documentação ao final
- atualizar `docs/CURRENT_STATE.md`
- marcar Task 05 em `docs/TASK_BOARD.md`
