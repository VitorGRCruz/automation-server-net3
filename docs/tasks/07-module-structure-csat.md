# Task 07 - Estrutura do módulo `csat`

## Objetivo
Preparar a estrutura mínima do módulo `csat` no domínio, workflows e activities, sem implementar ainda a regra final do primeiro workflow.

## Leitura obrigatória
- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ARCHITECTURE.md`
- `docs/FIRST_WORKFLOW_OVERVIEW.md`

## Escopo permitido
- `src/domain/csat/**`
- `src/temporal/workflows/csat/**`
- `src/temporal/activities/csat/**`
- `src/temporal/**` se precisar registrar exports/paths
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`

## Não pode
- implementar integração real de OPA, IXC ou SMTP ainda;
- colocar lógica pesada de negócio em rota ou workflow;
- fechar o workflow completo de CSAT ainda.

## Entregáveis
- estrutura de pastas do módulo `csat`;
- contratos iniciais do workflow;
- nomes claros para workflows e activities planejadas;
- placeholders tipados quando fizer sentido.

## Critérios de aceite
- o módulo `csat` já existe no projeto de forma coerente;
- fica claro onde entrarão workflow pai, child workflow e activities futuras.

## Validação mínima
- `pnpm typecheck`

## Atualização de documentação ao final
- atualizar `docs/CURRENT_STATE.md`
- marcar Task 07 em `docs/TASK_BOARD.md`
