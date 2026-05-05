# Regras de Temporal para este projeto

## Papel do Temporal no projeto
O Temporal é o mecanismo central de orquestração confiável. Hoje ele concentra:
- workflows;
- child workflows;
- activities;
- retries de activity;
- timers/esperas duráveis;
- recovery workflows;
- schedules oficiais de `csat`, `cobrancas` e `nfe`.

## Regras obrigatórias
1. **Workflow = orquestração.**
   - decide ordem, branching, encerramento e retries de negócio;
   - recebe um único objeto de input sempre que possível;
   - não acessa HTTP, banco ou SMTP diretamente.
2. **Activity = execução.**
   - faz IO externo;
   - valida payload/resposta;
   - devolve resultado tipado ou falha técnica classificada.
3. **Task queue por contexto técnico real.**
   - manter poucas filas previsíveis;
   - separar leitura do ERP, consulta OPA, mutações IXC e plano de controle.
4. **Workers separados quando isso isola risco operacional.**
   - workflows ficam no plano de controle;
   - integrações externas ficam em filas especializadas.
5. **Retry declarativo primeiro.**
   - usar Retry Policy de activity para falhas curtas;
   - usar retry manual no workflow só quando a regra de negócio pedir novo ciclo, espera durável ou recovery separado.
6. **Idempotência para side effects.**
   - qualquer mutação externa deve considerar replay, retry, reinício de worker e duplicidade.
7. **Client Temporal não carrega regra de negócio.**
   - clients apenas iniciam, descrevem, removem ou atualizam workflows e schedules.
8. **Schedule é operação explícita.**
   - `ensure`/`describe`/`delete` ficam em `src/temporal/client/`;
   - bootstrap de worker não cria schedule automaticamente.

## Topologia atual do projeto
- `automation-control`
  - todos os workflows e child workflows;
  - `diagnosticsPingActivity`;
  - `sendSmtpEmailActivity`;
  - registro de falhas terminais de trigger;
  - activities de controle e finalização de `nfe`;
  - verificação explícita de workflow de discovery do `nfe`.
- `automation-erp-read`
  - busca de elegíveis no ERP para `csat`, `cobrancas` e `nfe`;
  - leitura do contexto de e-mail da venda para `nfe`.
- `automation-opa`
  - busca de cliente e contato no OPA.
- `automation-ixc`
  - mutações no IXC para `csat` e `cobrancas`;
  - fetch do PDF da NF-e para `nfe`.

## Schedules atuais
Os schedules já existem e são parte do runtime:
- `csat` com intervalo configurável por `CSAT_TRIGGER_SCHEDULE_INTERVAL_MINUTES`;
- `cobrancas` com intervalo configurável por `COBRANCAS_EQUIPMENT_RETRIEVAL_TRIGGER_SCHEDULE_INTERVAL_MINUTES`.
- `nfe` discovery diário configurável por timezone/hora/minuto;
- `nfe` processing diário configurável por timezone/hora/minuto.

Regras atuais:
- `ensure` cria ou atualiza o schedule idempotentemente;
- `*_SCHEDULE_ENABLED=false` não impede o `ensure`, mas deixa o schedule pausado;
- os workflows iniciados por schedule continuam apontando para `automation-control`.
- o Workflow 2 de `nfe` verifica antes do processamento se o workflow configurado para discovery está ativo e, se estiver, encerra com `SKIPPED_DISCOVERY_RUNNING`.

## Inputs de workflow
Preferir um único objeto simples:

```ts
export interface StartSomethingWorkflowInput {
  requestId: string;
  source: "manual" | "webhook" | "schedule";
}
```

Observação atual:
- `csat` já usa `requestId` + `source`;
- `cobrancas` usa `requestId` + `source` + `startAt` + `originRequestId?`.
- `nfe` usa `requestId` + `source` nos parent workflows de discovery e processing.

## Validação operacional real
- `pnpm temporal:worker` sobe só o worker de controle;
- para executar o fluxo completo de `csat` ou `cobrancas`, é preciso subir também os workers especializados, normalmente com `pnpm temporal:workers:all` ou com os entrypoints individuais correspondentes;
- para o ciclo completo de `nfe`, discovery precisa de `control` + `erp-read`, e processing precisa de `control` + `erp-read` + `ixc`;
- os entrypoints `control` e `ixc` expõem health/metrics HTTP quando habilitados.
