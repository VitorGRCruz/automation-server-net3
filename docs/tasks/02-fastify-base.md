# Task 02 - Base HTTP com Fastify, plugins e autenticação

## Objetivo
Transformar a API mínima em uma base HTTP reutilizável com rotas organizadas, plugin de autenticação Basic Auth e tratamento coerente das respostas iniciais.

## Leitura obrigatória
- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/API_AND_WEBHOOK_RULES.md`

## Escopo permitido
- `package.json`
- `src/app/**`
- `src/infra/**` se necessário para config/logger
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`

## Não pode
- iniciar workflows reais ainda;
- implementar lógica de integração externa;
- misturar regra de negócio em rota.

## Entregáveis
- rotas organizadas por arquivo;
- healthcheck mantido;
- ao menos uma rota manual protegida para ação simples de diagnóstico;
- Basic Auth configurável por ambiente;
- tratamento de erro HTTP simples e legível.

## Critérios de aceite
- existe separação clara entre plugins, rotas e bootstrap do servidor;
- healthcheck pode permanecer público;
- rota protegida responde `200` ou `202` com payload curto;
- a autenticação não usa credenciais hardcoded.

## Validação mínima
- `pnpm typecheck`

## Atualização de documentação ao final
- atualizar `docs/CURRENT_STATE.md`
- marcar Task 02 em `docs/TASK_BOARD.md`
