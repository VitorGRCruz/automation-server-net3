# Task 04 - Contratos compartilhados e taxonomia de erros

## Objetivo
Criar a base tipada e didática para resultados, classificação de erros e contratos compartilhados que serão usados pelos próximos workflows e integrações.

## Leitura obrigatória
- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ERROR_CLASSIFICATION.md`

## Escopo permitido
- `src/domain/shared/**`
- `src/infra/**` se necessário
- `src/temporal/**` apenas para adaptar imports e tipos
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`

## Não pode
- implementar integrações reais ainda;
- criar engine genérica excessiva;
- acoplar contratos compartilhados a CSAT diretamente.

## Entregáveis
- tipos para erros transitórios e permanentes;
- base para resultados de sucesso/negócio/erro quando necessário;
- helpers mínimos e didáticos para classificação de erro.

## Critérios de aceite
- o projeto ganha uma linguagem clara para distinguir falhas técnicas e resultados de negócio;
- os contratos são simples, reutilizáveis e não excessivamente abstratos.

## Validação mínima
- `pnpm typecheck`

## Atualização de documentação ao final
- atualizar `docs/CURRENT_STATE.md`
- marcar Task 04 em `docs/TASK_BOARD.md`
