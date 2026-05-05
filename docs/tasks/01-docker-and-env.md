# Task 01 - Configuração por ambiente e Docker Compose de desenvolvimento

## Objetivo
Criar a base de configuração por ambiente e o ambiente local Docker para desenvolvimento, incluindo API, worker e Temporal de desenvolvimento.

## Leitura obrigatória
- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/TARGET_BASELINE.md`
- `docs/TEMPORAL_RULES.md`

## Escopo permitido
- `package.json`
- `src/infra/config/**`
- `src/app/**` se necessário apenas para consumir config
- `src/temporal/**` se necessário apenas para consumir config
- `docker-compose.yml`
- `.env.example`
- `.gitignore` se necessário
- `README.md` do repositório apenas se estritamente necessário para comando de subida
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`

## Não pode
- implementar integrações reais ainda;
- criar regras de negócio;
- introduzir observabilidade externa;
- trocar o framework HTTP.

## Entregáveis
- camada centralizada de configuração por ambiente;
- `.env.example` cobrindo API, Basic Auth, Temporal e integrações futuras;
- `docker-compose.yml` para desenvolvimento local;
- scripts úteis para subir ambiente local com clareza.

## Critérios de aceite
- a aplicação não depende mais de `localhost` hardcoded espalhado;
- API e worker conseguem ler configuração por ambiente;
- existe um modo claro de subir o ambiente local com Docker;
- a solução deixa explícito que o compose é para desenvolvimento e não substitui uma topologia de produção.

## Validação mínima
- `pnpm typecheck`
- se possível, comando documentado para subir o ambiente local

## Atualização de documentação ao final
- atualizar `docs/CURRENT_STATE.md`
- marcar Task 01 em `docs/TASK_BOARD.md`

## Observações
Para desenvolvimento local, é aceitável usar o servidor de desenvolvimento do Temporal. Não modelar produção completa nesta task.
