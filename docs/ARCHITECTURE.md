# Arquitetura atual do runtime

## Visão de alto nível
O projeto está organizado em quatro blocos principais:

1. **API HTTP**
   - expõe healthchecks, métricas e rotas manuais de diagnóstico;
   - autentica rotas operacionais quando a configuração exigir;
   - inicia apenas o workflow de diagnóstico por rota HTTP hoje.

2. **Aplicação Temporal**
   - clients para diagnóstico e para operação explícita de schedules;
   - worker de controle para workflows e activities leves;
   - workers especializados por contexto técnico;
   - workflows dos módulos `csat`, `cobrancas`, `nfe` e `diagnostics`.

3. **Infra interna**
   - configuração por ambiente;
   - shutdown gracioso;
   - observabilidade Prometheus;
   - clients HTTP compartilhados;
   - MariaDB do sistema com migrations e repositório de idempotência durável.

4. **Integrações externas**
   - ERP MySQL read-only;
   - OPA;
   - IXC;
   - SMTP.

## Superfície HTTP atual
```text
Fastify API
  GET  /livez
  GET  /readyz
  GET  /healthz
  GET  /health
  GET  /metrics
  POST /manual/actions/diagnostics/ping
  POST /manual/workflows/diagnostics/echo
```

Não há rotas de webhook implementadas no estado atual do repositório.

## Fluxo mental principal
```text
Operador / Schedule / client Temporal
          |
          v
  automation-control
    - workflows
    - child workflows
    - activities leves de controle
    - activity compartilhada de SMTP
          |
          +--> automation-erp-read -> ERP MySQL read-only
          +--> automation-opa      -> API OPA
          +--> automation-ixc      -> API IXC
          +--> system-db           -> idempotência durável
```

## Topologia Temporal atual
```text
task queue: automation-control
  - todos os workflows e child workflows
  - diagnosticsPingActivity
  - sendSmtpEmailActivity
  - registerCsatTriggerFailureActivity
  - registerEquipmentRetrievalVerificationTriggerFailureActivity
  - loadNfeEmailDispatchCustomersActivity
  - enqueueNfeEmailDispatchSalesActivity
  - loadNfeEmailDispatchEligibleSalesActivity
  - checkNfeEmailDispatchDiscoveryRunningActivity
  - claimNfeEmailDispatchSaleActivity
  - renderNfeEmailTemplateActivity
  - finalizeNfeEmailDispatchSaleActivity

task queue: automation-erp-read
  - fetchCsatEligibleItemsActivity
  - fetchEquipmentRetrievalVerificationEligiblesActivity
  - fetchCustomerNfeSalesCandidatesFromErpActivity
  - fetchNfeSaleEmailContextFromErpActivity

task queue: automation-opa
  - findOpaCustomerActivity
  - findWhatsappContactActivity

task queue: automation-ixc
  - forwardServiceOrderOnFailureActivity
  - sendCsatMessageActivity
  - registerCsatSuccessEventOnOsActivity
  - createEquipmentRetrievalVerificationOrderActivity
  - fetchNfePdfFromIxcActivity
```

## Estrutura atual relevante
```text
src/
  app/
    health/
    plugins/
    routes/
  domain/
    csat/
    cobrancas/
    nfe/
    shared/
  infra/
    config/
    http/
    observability/
    runtime/
    system-db/
  integrations/
    erp-db/
    opa/
    ixc/
    smtp/
  temporal/
    activities/
      cobrancas/
      csat/
      nfe/
      shared/
    client/
    worker/
    workflows/
      cobrancas/
      csat/
      diagnostics/
      nfe/
```

## Fronteiras obrigatórias
### API
- valida entrada;
- aplica autenticação;
- chama clients ou services de aplicação;
- não conversa diretamente com ERP, OPA, IXC ou SMTP dentro da rota.

### Workflow
- orquestra ordem, branching, retry manual e timers duráveis;
- não acessa HTTP, banco ou SMTP diretamente;
- escolhe a task queue correta de cada activity por `proxyActivities`.

### Activity
- faz IO externo;
- classifica falhas e normaliza retorno técnico;
- encapsula idempotência durável quando houver side effect mutável.

### Integração
- conhece URL, SQL, timeout, autenticação e formato de payload;
- não decide regra de negócio.

### Infra interna
- centraliza config, observabilidade, clients compartilhados, migrations e persistência do sistema;
- não decide fluxo de negócio.

## Observações operacionais importantes
- a API e todos os entrypoints padrão de worker executam `runSystemDbMigrations()` no startup;
- os schedules de `csat`, `cobrancas` e `nfe` são operados por commands explícitos e não por bootstrap automático;
- o health server próprio do worker é reutilizável, mas hoje só está habilitado nos entrypoints `control` e `ixc`;
- `docker compose up --build` não sobe a API por padrão; a API exige o profile `api`.
