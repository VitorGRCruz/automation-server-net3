# Task 03 - Base Temporal reutilizável

## Objetivo
Transformar a integração Temporal atual em uma base reutilizável com client, worker, task queue(s) iniciais, workflow/activities de diagnóstico e bootstrap coerente.

## Leitura obrigatória
- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/TEMPORAL_RULES.md`
- `docs/ARCHITECTURE.md`

## Escopo permitido
- `package.json`
- `src/temporal/**`
- `src/infra/**` se necessário
- `src/app/**` apenas se precisar integrar rota de diagnóstico
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`

## Não pode
- implementar workflow de negócio real ainda;
- criar múltiplos workers sem necessidade;
- espalhar lógica de negócio pelo client Temporal.

## Entregáveis
- factory/serviço de client Temporal;
- bootstrap de worker mais organizado;
- task queue(s) iniciais nomeadas de forma alinhada ao projeto;
- workflow de diagnóstico tipado;
- activity de diagnóstico simples.

## Critérios de aceite
- fica claro onde iniciar workflows a partir da aplicação;
- fica claro onde registrar workflows e activities no worker;
- o exemplo deixa de parecer tutorial genérico e passa a parecer infraestrutura do projeto.

## Validação mínima
- `pnpm typecheck`

## Atualização de documentação ao final
- atualizar `docs/CURRENT_STATE.md`
- marcar Task 03 em `docs/TASK_BOARD.md`
