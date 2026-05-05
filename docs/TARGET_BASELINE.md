# Baseline operacional atual

## Capacidades já entregues
1. Build multi-stage com runtime imutável e `docker-compose.yml` para `temporal`, `system-db` e workers segmentados.
2. API Fastify com healthchecks, métricas e rotas manuais de diagnóstico.
3. Temporal com quatro task queues por contexto técnico.
4. MySQL do sistema com migrations e idempotência durável.
5. Workflow real de `csat` com fan-out controlado, child workflow por item e mutações protegidas.
6. Workflow de `cobrancas` com schedule, recovery workflow e criação de OS no IXC.
7. Integrações implementadas para ERP, OPA, IXC e SMTP.

## O que ainda permanece pendente
- rotas HTTP de webhook;
- wrapper operacional para iniciar manualmente os workflows de `csat` e `cobrancas`;
- hardening dedicado do `GET /healthz` detalhado da API;
- generalização das queries de elegíveis hoje restritas ou hardcoded no ERP;
- módulo `nfe`;
- suíte automatizada de testes.

## Leitura correta deste baseline
O projeto já passou da fase de “preparar a base para o primeiro workflow”.
Hoje a pergunta correta não é mais se a base existe, e sim:
- quais fluxos estão realmente operacionais;
- quais partes ainda estão limitadas por configuração, query de ERP ou falta de wrapper operacional.
