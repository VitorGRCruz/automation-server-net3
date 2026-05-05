# Spec — Runtime de Health, Liveness e Readiness

## Objetivo
Implementar um runtime operacional de healthchecks para API e worker, substituindo o modelo atual baseado apenas em `GET /health` por uma separação explícita entre `liveness`, `readiness` e `deep health`.

---

## Problema atual
O repositório possui apenas um healthcheck simples na API, o que não permite saber:

- se o processo está apenas vivo ou realmente pronto;
- se Temporal está acessível;
- se o MySQL do sistema está acessível;
- se o worker está operacional;
- se há degradação parcial das integrações.

---

## Resultado desejado

### API
Implementar:

- `GET /livez`
- `GET /readyz`
- `GET /healthz`

### Worker
Implementar:

- `GET /livez`
- `GET /readyz`
- `GET /healthz`

---

## Regras obrigatórias

### 1. Liveness não depende de integrações externas
`/livez` deve informar apenas se o processo está vivo.

### 2. Readiness depende apenas de dependências centrais
`/readyz` deve considerar apenas:

- Temporal
- MySQL do sistema

ERP, OPA e IXC não devem decidir readiness por padrão.

### 3. Deep health deve ser detalhado
`/healthz` deve retornar:

- status geral;
- timestamp;
- status por dependência;
- latência do check quando aplicável;
- mensagem de erro curta quando aplicável.

### 4. Healthchecks devem usar cache curto
TTL recomendado inicial: `10_000 ms`.

### 5. Worker precisa ter health server próprio
O processo do worker deve expor HTTP mínimo independente da API.

---

## Estrutura sugerida

### API
```text
src/app/health/
  health.types.ts
  health.service.ts
  health.route.ts
```

### Worker
```text
src/temporal/worker/
  worker-health-state.ts
  worker-health-server.ts
  start-control-worker.ts
  run-control-worker.ts
  run-worker.ts (alias legado)
```

---

## Checks esperados

### Readiness
- Temporal: check leve com timeout curto
- system DB: `SELECT 1`

### Deep health
- Temporal
- system DB
- ERP DB
- OPA
- IXC

---

## Compatibilidade
A rota `GET /health` pode ser mantida temporariamente como alias de `GET /livez`, desde que a nova convenção esteja implementada.

---

## Critérios de aceite globais
- API expõe `livez`, `readyz`, `healthz`
- worker expõe `livez`, `readyz`, `healthz`
- `/readyz` usa apenas Temporal + system DB
- checks usam cache curto
- payloads são claros e tipados
- `pnpm typecheck` e `pnpm lint` passam
- documentação de estado e board são atualizadas ao final
