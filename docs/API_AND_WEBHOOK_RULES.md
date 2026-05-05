# Regras atuais de API, rotas e webhooks

## Papel da API
A API é a superfície HTTP do projeto. No estado atual ela:
- expõe healthchecks;
- expõe métricas Prometheus;
- expõe rotas manuais de diagnóstico;
- não expõe webhook de negócio ainda.

## Superfície HTTP implementada
### Health
- `GET /livez`
- `GET /readyz`
- `GET /healthz`
- `GET /health` como alias de liveness

### Metrics
- `GET /metrics` quando `METRICS_ENABLED=true`

### Manual
- `POST /manual/actions/diagnostics/ping`
- `POST /manual/workflows/diagnostics/echo`

## Regras obrigatórias
1. Rotas não contêm regra de negócio.
2. Rotas não chamam ERP, OPA, IXC ou SMTP diretamente.
3. Rotas validam e normalizam o payload de entrada.
4. Rotas manuais usam Basic Auth apenas quando `BASIC_AUTH_ENABLED=true`.
5. `GET /metrics` usa a política própria de `METRICS_EXPOSURE`:
   - `protected`: exige Basic Auth;
   - `public`: não exige autenticação.
6. `livez` e `readyz` permanecem públicos na implementação atual.
7. `healthz` detalhado continua público no código atual e deve ficar atrás de rede interna ou gateway.

## Convenções de resposta
### Ações síncronas simples
```json
{
  "ok": true,
  "data": {
    "action": "diagnostics-ping"
  }
}
```

### Início de workflow
```json
{
  "ok": true,
  "workflowId": "...",
  "runId": "..."
}
```

### Health detalhado
```json
{
  "ok": true,
  "service": "api",
  "status": "ok",
  "checkedAt": "...",
  "cacheTtlMs": 10000,
  "checks": {}
}
```

## O que ainda não existe
- nenhuma rota HTTP de webhook;
- nenhuma rota manual para iniciar `csat` ou `cobrancas`;
- nenhum endpoint administrativo para operar schedules.

Esses caminhos hoje são operados diretamente por clients Temporal ou pelos scripts do projeto.
