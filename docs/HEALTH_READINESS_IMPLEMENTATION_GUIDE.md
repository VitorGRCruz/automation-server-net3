# Guia de implementação de health, readiness e metrics operacionais

## Objetivo
Descrever o runtime efetivamente implementado para health da API e dos workers com health server habilitado.

## Estrutura atual

### API
```text
src/app/
  health/
    health.runtime.ts
    health.service.ts
    health.types.ts
  routes/
    health.route.ts
    metrics.route.ts
```

### Worker
```text
src/temporal/worker/
  worker-health-state.ts
  worker-health-server.ts
  start-control-worker.ts
  run-control-worker.ts
  run-ixc-worker.ts
  run-worker.ts (alias legado do control)
```

Observação:
- o health server é reutilizável;
- no estado atual ele está habilitado nos entrypoints `control` e `ixc`.

## Endpoints atuais

### API
- `GET /livez`
- `GET /readyz`
- `GET /healthz`
- `GET /health`
- `GET /metrics` quando `METRICS_ENABLED=true`

### Worker com health server habilitado
- `GET /livez`
- `GET /readyz`
- `GET /healthz`
- `GET /metrics` quando `METRICS_ENABLED=true`

## Checks implementados

### Dependências centrais
- `temporal`: `Connection.lazy(...).ensureConnected()` com deadline curto;
- `systemDb`: `SELECT 1 AS ok` com conexão curta.

### Dependências opcionais da API
- `erpDb`: `client.ping()` com pool curto e timeout reduzido;
- `opa`: probe autenticado e sem efeito colateral;
- `ixc`: probe autenticado e sem mutação.

## Semântica de status
- `livez` só mede vida do processo;
- `readyz` da API ignora ERP, OPA e IXC;
- `healthz` da API usa `ok`, `degraded` e `fail`;
- `readyz` do worker combina estado do processo com `Temporal` e `systemDb`;
- `healthz` do worker continua baseado apenas nas dependências centrais e no snapshot do processo.

## Cache
- cache em memória por endpoint;
- coalescência de requisições simultâneas;
- TTL dedicado para `readyz` e `healthz`;
- fallback de TTL por `HEALTH_CACHE_TTL_MS`.

## Variáveis relevantes
- `HEALTH_CACHE_TTL_MS`
- `HEALTH_READINESS_CACHE_TTL_MS`
- `HEALTH_DETAILS_CACHE_TTL_MS`
- `HEALTH_CHECK_TIMEOUT_MS`
- `WORKER_HEALTH_HOST`
- `WORKER_HEALTH_PORT`
- `METRICS_ENABLED`
- `METRICS_EXPOSURE`

## Segurança operacional
- `GET /healthz` detalhado da API continua sem proteção dedicada;
- `GET /metrics` é protegido por padrão quando `METRICS_EXPOSURE=protected`;
- no worker, a proteção de `/metrics` também é independente de `BASIC_AUTH_ENABLED`.

## Validação mínima
- `pnpm lint`
- `pnpm typecheck`
