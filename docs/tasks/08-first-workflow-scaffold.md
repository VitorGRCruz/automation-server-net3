# Task 08 - Scaffold do primeiro workflow real sem lógica final de negócio

## Objetivo
Criar o esqueleto do primeiro workflow real de `csat` com inputs, outputs e sequência principal, mas sem ainda implementar todas as regras finais de integração e negócio.

## Leitura obrigatória
- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/TEMPORAL_RULES.md`
- `docs/ERROR_CLASSIFICATION.md`
- `docs/FIRST_WORKFLOW_OVERVIEW.md`

## Escopo permitido
- `src/domain/csat/**`
- `src/temporal/workflows/csat/**`
- `src/temporal/activities/csat/**`
- `src/temporal/**` se precisar registrar o scaffold no worker
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`

## Não pode
- fechar a lógica completa do trigger de elegíveis;
- criar child workflow real com processamento final completo;
- implementar OPA, IXC ou SMTP completos;
- poluir o workflow com lógica técnica.

## Entregáveis
- workflow pai com contrato de input/output;
- child workflow com contrato de input/output, se a estrutura já for útil;
- activities placeholder tipadas para as etapas centrais;
- sequência principal do fluxo representada de forma legível.

## Critérios de aceite
- a base está pronta para iniciar a implementação real do workflow na próxima fase;
- fica cristalino onde cada nova regra de negócio entrará;
- o workflow continua sendo orquestração, não implementação técnica.

## Validação mínima
- `pnpm typecheck`

## Atualização de documentação ao final
- atualizar `docs/CURRENT_STATE.md`
- marcar Task 08 em `docs/TASK_BOARD.md`

## Observações
Ao concluir esta task, o projeto deve estar com o caminho livre para começar o primeiro workflow real de negócio.
