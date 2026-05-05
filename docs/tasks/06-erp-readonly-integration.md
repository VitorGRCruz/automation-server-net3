# Task 06 - Base da integração read-only com MySQL do ERP

## Objetivo
Criar a base técnica da conexão read-only com o MySQL do ERP, sem ainda implementar a consulta real de elegíveis.

## Leitura obrigatória
- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/INTEGRATIONS_RULES.md`

## Escopo permitido
- `package.json`
- `src/integrations/erp-db/**`
- `src/infra/config/**`
- `src/infra/logger/**` se necessário
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`

## Não pode
- implementar ainda a query final do trigger de CSAT;
- espalhar acesso ao banco fora da pasta de integração;
- permitir escrita no ERP.

## Entregáveis
- client/base de conexão read-only com MySQL do ERP;
- tipagem inicial da integração;
- local único para queries futuras dessa integração.

## Critérios de aceite
- fica claro onde a futura query de elegíveis deverá morar;
- configuração de conexão vem do ambiente;
- o resto da aplicação não precisa conhecer detalhes técnicos da biblioteca de MySQL.

## Validação mínima
- `pnpm typecheck`

## Atualização de documentação ao final
- atualizar `docs/CURRENT_STATE.md`
- marcar Task 06 em `docs/TASK_BOARD.md`
