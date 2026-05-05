# Operação dos healthchecks e metrics dos workers

## Quais workers expõem HTTP hoje
No estado atual do repositório, só os entrypoints com health server habilitado expõem HTTP:
- `pnpm temporal:worker`
- `pnpm temporal:worker:control`
- `pnpm temporal:worker:ixc`
- `pnpm temporal:workers:all` para `control` e `ixc`

Os entrypoints `erp-read` e `opa` não expõem HTTP próprio hoje.

## Endpoints disponíveis
### Worker com health server habilitado
- `GET /livez`
- `GET /readyz`
- `GET /healthz`
- `GET /metrics` quando `METRICS_ENABLED=true`

## Como interpretar

### `/livez`
Responde apenas se o processo do worker está vivo.

### `/readyz`
Responde `200` quando:
- o bootstrap foi concluído;
- o loop principal está ativo;
- `Temporal` está acessível;
- `systemDb` está acessível.

### `/healthz`
Expõe o snapshot do worker e os checks centrais. O esperado é `503` quando:
- o loop principal parou;
- houve erro fatal;
- `Temporal` caiu;
- `systemDb` caiu.

### `/metrics`
- segue `METRICS_ENABLED` e `METRICS_EXPOSURE`;
- quando `METRICS_EXPOSURE=protected`, exige Basic Auth mesmo que `BASIC_AUTH_ENABLED=false`;
- expõe contadores e histogramas do processo que está servindo aquele endpoint.

## Status práticos

### Situação saudável
- `/livez` = `200`
- `/readyz` = `200`
- `/healthz` = `200` com `status = ok`

### Falha de runtime central
- `/readyz` = `503`
- `/healthz` = `503` com `status = fail`

Interpretação:
- o worker não está seguro para processar activities ou workflows.

## Cache operacional
O runtime usa cache curto em memória para `readyz` e `healthz`.

Variáveis:
- `HEALTH_CACHE_TTL_MS`
- `HEALTH_READINESS_CACHE_TTL_MS`
- `HEALTH_DETAILS_CACHE_TTL_MS`
- `HEALTH_CHECK_TIMEOUT_MS`

## Nuances operacionais reais
- `control` e `ixc` usam o mesmo `WORKER_HEALTH_PORT` por default; fora do `temporal:workers:all`, ajuste a porta manualmente se ambos rodarem no mesmo host;
- no `docker-compose.yml` atual, os workers não publicam essas portas para o host;
- `pnpm temporal:workers:all` já sobe `control` em `3001` e `ixc` em `3004`.

## Uso recomendado

### Ambiente local no host
- `livez` para liveness;
- `readyz` para readiness;
- `healthz` para troubleshooting;
- `/metrics` para inspeção de fila, throughput e tempo de activity.

### Docker / Compose
- dentro da rede interna do compose, usar `readyz` do worker adequado;
- se precisar dessas portas no host, é necessário publicar portas adicionais no serviço correspondente.
