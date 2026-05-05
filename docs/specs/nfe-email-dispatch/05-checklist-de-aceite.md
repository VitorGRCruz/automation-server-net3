# NF-e Email Dispatch — checklist de aceite

## Modelagem e migrations

- [ ] Existe migration `003_create_nfe_email_dispatch_tables.sql`.
- [ ] A migration cria `nfe_email_dispatch_customer`.
- [ ] A migration cria `nfe_email_dispatch_sale`.
- [ ] Existe unique key em `nfe_email_dispatch_customer.erp_customer_id`.
- [ ] Existe FK de sale para customer com `ON DELETE CASCADE`.
- [ ] Existe unique key `(nfe_email_dispatch_customer_id, erp_sale_id)`.
- [ ] Status aceitos: `PENDING`, `IN_PROGRESS`, `SENT`, `FAILED_TRANSIENT`, `FAILED_FINAL`, `DELIVERY_UNKNOWN`.
- [ ] `SENT` exige `sent_at` preenchido e outros status não deixam `sent_at` preenchido.
- [ ] O runner de migrations inclui a nova migration de forma idempotente.

## Estrutura de módulo

- [ ] Existe `src/domain/nfe/` com contratos tipados.
- [ ] Existe `src/temporal/workflows/nfe/`.
- [ ] Existe `src/temporal/activities/nfe/`.
- [ ] Activities NFE foram registradas nos worker groups corretos.
- [ ] Workflows NFE foram exportados em `src/temporal/workflows/index.ts`.
- [ ] Activities NFE foram exportadas em `src/temporal/activities/index.ts`.

## Workflow 1 — descoberta

- [ ] Parent `fetchCustomerNfeSalesCandidatesWorkflow` carrega clientes da automação.
- [ ] Se não houver clientes, finaliza com sucesso.
- [ ] Child `fetchSingleCustomerNfeSalesCandidatesWorkflow` processa um cliente.
- [ ] O parent respeita `maxConcurrentChildren = 5`.
- [ ] O child calcula `effectiveStart = max(customer.created_at, discoveryStartedAt - 15 dias)`.
- [ ] A consulta ERP filtra `vd.modelo_nf = 62`, `vd.status = 'F'`, cliente e data da NF-e.
- [ ] A inserção no banco da automação usa `ON DUPLICATE KEY UPDATE id = id` ou equivalente.
- [ ] Duplicidade não falha a activity.
- [ ] Erros transitórios têm retry curto.
- [ ] Erros permanentes não entram em retry infinito.

## Workflow 2 — processamento

- [ ] Parent `processNfeEmailDispatchSalesWorkflow` busca `PENDING` e `FAILED_TRANSIENT` com `attempt_count < maxSendAttempts`.
- [ ] Se não houver jobs, finaliza com sucesso.
- [ ] Parent respeita `maxConcurrentChildren = 5`.
- [ ] Workflow 2 não roda enquanto Workflow 1 está ativo.
- [ ] Child faz claim atômico para `IN_PROGRESS`.
- [ ] Claim incrementa `attempt_count` e preenche `last_attempt_at`.
- [ ] Retry do claim consegue reconhecer claim já feito pela mesma execução usando `last_attempt_at = attemptStartedAt`.
- [ ] Se claim não for confirmado, child finaliza como `SKIPPED` sem chamar ERP/IXC/SMTP.
- [ ] Consulta ERP valida venda elegível e e-mail válido.
- [ ] E-mail ausente/inválido vira `FAILED_FINAL`.
- [ ] Venda ausente/não elegível vira `FAILED_FINAL`.

## PDF e e-mail

- [ ] Activity IXC chama `imprimir_nota` com `{ id, base64: "S" }`.
- [ ] Activity valida base64 e header `%PDF`.
- [ ] PDF é salvo em `/var/tmp/nfe-email-dispatch` ou config equivalente.
- [ ] Workflow recebe apenas `pdfPath`, não base64.
- [ ] Template HTML é copiado para o `dist` no build.
- [ ] Variáveis do template são escapadas antes da substituição.
- [ ] `valor_total` é formatado corretamente sem duplicar `R$`.
- [ ] SMTP usa `sendSmtpEmailActivity` existente.
- [ ] Activity SMTP é chamada com `maximumAttempts = 1`.
- [ ] Resultado ambíguo após envio vira `DELIVERY_UNKNOWN`.
- [ ] PDF path é visível pelo worker que envia o SMTP.

## Finalização de status

- [ ] Finalização `SENT` preenche `sent_at`.
- [ ] Falha transitória respeita `maxSendAttempts`.
- [ ] Ao atingir limite de tentativas, falha transitória vira `FAILED_FINAL`.
- [ ] Finalização é idempotente.
- [ ] Se `affectedRows = 0`, a activity consulta estado atual e confirma se já está no status esperado.
- [ ] Se finalização falhar depois do SMTP, o job pode ficar `IN_PROGRESS` e isso fica documentado como fora do escopo.

## Schedules e operação

- [ ] Existe schedule diário do Workflow 1 às 03:00.
- [ ] Existe schedule diário do Workflow 2 às 08:00.
- [ ] Ambos usam `ScheduleOverlapPolicy.SKIP` ou mecanismo equivalente.
- [ ] Existem scripts `ensure`, `describe` e `delete` para os dois schedules.
- [ ] `.env.example` documenta as variáveis novas.
- [ ] `docker-compose.yml` ou docs operacionais tratam o volume compartilhado do PDF temporário.

## Validação técnica

- [ ] `pnpm typecheck` passa.
- [ ] `pnpm lint` passa.
- [ ] Build copia migrations e template HTML.
- [ ] `pnpm build` passa se a task alterar build/runtime.

## Documentação final

- [ ] `docs/CURRENT_STATE.md` atualizado.
- [ ] `docs/TASK_BOARD.md` atualizado.
- [ ] `docs/ARCHITECTURE.md` atualizado se a topologia ou operação mudou.
- [ ] `docs/TEMPORAL_RULES.md` atualizado se schedules/topologia mudaram.
- [ ] Qualquer decisão divergente da spec foi documentada.
