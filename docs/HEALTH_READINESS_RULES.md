# Regras de health, liveness e readiness

## Objetivo
Padronizar os endpoints operacionais da API e dos workers que expõem health server, com semântica estável, payload curto e cache curto.

## Convenção vigente

### API
- `GET /livez`
- `GET /readyz`
- `GET /healthz`
- `GET /health`

### Worker com health server habilitado
- `GET /livez`
- `GET /readyz`
- `GET /healthz`

Observação:
- o health server do worker é opt-in por entrypoint;
- hoje ele está habilitado nos entrypoints `control` e `ixc`.

## Semântica obrigatória

### `livez`
- responde apenas se o processo está vivo;
- não depende de `Temporal`, `systemDb`, `erpDb`, `opa` ou `ixc`;
- retorna `200`.

### `readyz`
- mede só dependências centrais;
- usa `Temporal` e `systemDb`;
- no worker, também exige bootstrap concluído e loop ativo;
- retorna `200` quando pronto e `503` quando não pronto.

### `healthz`
- retorna payload detalhado com `service`, `status`, `checkedAt`, `cacheTtlMs` e `checks`;
- informa `latencyMs` por dependência;
- usa mensagem curta e sanitizada em falha;
- retorna `200` quando o serviço está `ok` ou `degraded`;
- retorna `503` quando dependências centrais falham ou, no worker, quando o runtime do processo não está operacional.

## Dependências por nível

### API `readyz`
- `temporal`
- `systemDb`

### API `healthz`
- `temporal`
- `systemDb`
- `erpDb`
- `opa`
- `ixc`

### Worker `readyz` e `healthz`
- `temporal`
- `systemDb`
- estado do processo do worker

## Regras para dependências opcionais
- `erpDb`, `opa` e `ixc` são opcionais apenas no deep health da API;
- falha opcional não quebra o payload;
- falha opcional não torna `readyz` indisponível;
- se dependência opcional falhar e as centrais estiverem `up`, o `healthz` da API responde `status = degraded`.

## Regras de implementação
- checks devem ser leves;
- `Temporal` usa conexão curta e `ensureConnected`;
- `systemDb` usa `SELECT 1`;
- `erpDb` usa `ping`;
- OPA usa probe autenticado sem efeito colateral;
- IXC usa probe autenticado sem mutação;
- nenhuma falha de check pode derrubar o processo;
- mensagens de falha não podem vazar credencial, host ou SQL.

## Cache por ambiente
- `HEALTH_CACHE_TTL_MS`: fallback geral;
- `HEALTH_READINESS_CACHE_TTL_MS`: TTL preferencial do `readyz`;
- `HEALTH_DETAILS_CACHE_TTL_MS`: TTL preferencial do `healthz`;
- `HEALTH_CHECK_TIMEOUT_MS`: timeout máximo por check.

## Segurança operacional
`GET /healthz` detalhado da API continua público na implementação atual. Enquanto isso, ele deve permanecer exposto apenas internamente ou atrás de controle externo de acesso.
