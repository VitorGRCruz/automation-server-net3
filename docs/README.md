# Documentação do projeto

## Como usar esta pasta
O código continua sendo a fonte final de verdade. Os arquivos desta pasta resumem o runtime verificado no repositório e registram a trilha histórica de implementação.

Se você precisar ler só um documento, comece por `docs/CURRENT_STATE.md`.

## Ordem recomendada de leitura
1. `docs/CURRENT_STATE.md`
2. `docs/ARCHITECTURE.md`
3. o documento operacional pertinente ao que você vai mexer:
   - `docs/FIRST_WORKFLOW_OVERVIEW.md`
   - `docs/CSAT_PRODUCTION_OPERATION.md`
   - `docs/NFE_EMAIL_DISPATCH_OPERATION.md`
   - `docs/HEALTH_READINESS_IMPLEMENTATION_GUIDE.md`
   - `docs/WORKER_HEALTHCHECKS_OPERATION.md`
4. as regras específicas:
   - `docs/TEMPORAL_RULES.md`
   - `docs/API_AND_WEBHOOK_RULES.md`
   - `docs/INTEGRATIONS_RULES.md`
   - `docs/ERROR_CLASSIFICATION.md`
5. `docs/TASK_BOARD.md`, `docs/tasks/` e `docs/specs/` apenas quando você precisar reconstruir a história de uma entrega

## O que é retrato atual
- `docs/CURRENT_STATE.md`
- `docs/ARCHITECTURE.md`
- `docs/FIRST_WORKFLOW_OVERVIEW.md`
- `docs/CSAT_PRODUCTION_OPERATION.md`
- `docs/NFE_EMAIL_DISPATCH_OPERATION.md`
- `docs/HEALTH_READINESS_IMPLEMENTATION_GUIDE.md`
- `docs/WORKER_HEALTHCHECKS_OPERATION.md`
- `docs/TEMPORAL_RULES.md`
- `docs/API_AND_WEBHOOK_RULES.md`
- `docs/INTEGRATIONS_RULES.md`

## O que é histórico de implementação
- `docs/TASK_BOARD.md`
- `docs/tasks/`
- `docs/specs/`
- `docs/migrations/`

Esses arquivos continuam úteis, mas não devem ser lidos como retrato fiel do runtime atual sem confronto com `docs/CURRENT_STATE.md` e com o código.

## Escopo atual resumido
- API Fastify com `health`, `metrics` e rotas manuais de diagnóstico.
- Temporal com task queues segmentadas em `automation-control`, `automation-erp-read`, `automation-opa` e `automation-ixc`.
- Fluxo real de `csat` implementado de ponta a ponta.
- Fluxo de `cobrancas` implementado com schedule e recovery, mas ainda com limitações documentadas na query de elegíveis.
- Fluxo de `nfe` implementado com discovery, processing, schedules operacionais e envio SMTP compartilhado.
- MariaDB próprio do sistema para idempotência durável.
- Integrações reais em uso: ERP read-only, OPA, IXC e SMTP.
