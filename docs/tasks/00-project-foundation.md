# Task 00 - Fundação e reorganização do esqueleto do projeto

## Objetivo
Reorganizar o projeto mínimo atual para uma estrutura base mais didática, preservando o comportamento existente: Fastify com healthcheck e Temporal com um fluxo de diagnóstico simples.

## Leitura obrigatória
- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ARCHITECTURE.md`
- `docs/TEMPORAL_RULES.md`

## Escopo permitido
- `package.json`
- `src/app/**`
- `src/temporal/**`
- `src/infra/**`
- `src/domain/**`
- `src/integrations/**`
- `tsconfig.json`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`

## Não pode
- adicionar integrações reais ainda;
- adicionar Docker Compose ainda;
- implementar autenticação HTTP ainda;
- implementar workflow real de negócio;
- alterar docs fora das permitidas.

## Entregáveis
- estrutura de pastas base criada conforme necessário;
- exemplo `hello` substituído por um exemplo de diagnóstico mais alinhado ao projeto, se isso melhorar a coerência;
- `server.ts` e código Temporal reorganizados para refletir responsabilidades mais claras;
- projeto continua compilando.

## Critérios de aceite
- existe uma estrutura base mais próxima da arquitetura alvo;
- o healthcheck continua funcionando;
- um workflow de diagnóstico simples continua executável;
- não há lógica de negócio real de CSAT ainda;
- não há hardcodes espalhados além do inevitável desta task.

## Validação mínima
- `pnpm typecheck`

## Atualização de documentação ao final
- atualizar `docs/CURRENT_STATE.md`
- marcar Task 00 em `docs/TASK_BOARD.md`

## Observações
Esta task é sobre **forma**, não sobre regra de negócio.
