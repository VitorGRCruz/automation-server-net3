# Operação do NF-e Email Dispatch

## Objetivo

O módulo `nfe` possui dois workflows oficiais:

- `fetchCustomerNfeSalesCandidatesWorkflow`
  - descobre diariamente vendas com NF-e pronta no ERP;
  - insere jobs `PENDING` em `nfe_email_dispatch_sale`.
- `processNfeEmailDispatchSalesWorkflow`
  - processa jobs `PENDING` e `FAILED_TRANSIENT`;
  - busca o PDF da NF-e na IXC;
  - monta o e-mail;
  - envia via SMTP;
  - finaliza o status no banco da automação.

## Schedules oficiais

- Discovery:
  - workflow: `fetchCustomerNfeSalesCandidatesWorkflow`
  - horário padrão: `03:00`
  - timezone padrão: `America/Campo_Grande`
  - overlap: `SKIP`
- Processing:
  - workflow: `processNfeEmailDispatchSalesWorkflow`
  - horário padrão: `08:00`
  - timezone padrão: `America/Campo_Grande`
  - overlap: `SKIP`

## Comandos de schedule

- Garantir schedule de discovery:
  - `pnpm temporal:ensure:nfe-email-dispatch-discovery-schedule`
- Descrever schedule de discovery:
  - `pnpm temporal:describe:nfe-email-dispatch-discovery-schedule`
- Remover schedule de discovery:
  - `pnpm temporal:delete:nfe-email-dispatch-discovery-schedule`
- Garantir schedule de processing:
  - `pnpm temporal:ensure:nfe-email-dispatch-processing-schedule`
- Descrever schedule de processing:
  - `pnpm temporal:describe:nfe-email-dispatch-processing-schedule`
- Remover schedule de processing:
  - `pnpm temporal:delete:nfe-email-dispatch-processing-schedule`

Observação:
- `*_SCHEDULE_ENABLED=false` não impede o `ensure`; o schedule é criado ou atualizado, mas fica pausado.

## Workers necessários

- Para discovery:
  - `automation-control`
  - `automation-erp-read`
- Para processing:
  - `automation-control`
  - `automation-erp-read`
  - `automation-ixc`

O envio SMTP roda no `automation-control`.

## Não simultaneidade entre os workflows

O Workflow 2 verifica explicitamente se o workflow configurado para discovery está em execução.

Se o workflow de discovery ainda estiver ativo:

- o Workflow 2 não falha tecnicamente;
- ele finaliza com status `SKIPPED_DISCOVERY_RUNNING`;
- nenhum job é carregado para processamento naquela execução.

## Volume temporário do PDF

O PDF da NF-e é salvo temporariamente em:

```text
/var/tmp/nfe-email-dispatch
```

Esse path precisa existir e ser compartilhado entre:

- o worker que baixa o PDF na IXC;
- o worker que envia o e-mail via SMTP.

No `docker-compose.yml`, isso já está modelado pelo volume:

```text
nfe-email-dispatch-tmp
```

montado em `worker-control` e `worker-ixc`.

Em produção, o mesmo contrato operacional precisa existir.

## Tabelas envolvidas

- `nfe_email_dispatch_customer`
  - clientes habilitados para a automação;
  - chave única em `erp_customer_id`.
- `nfe_email_dispatch_sale`
  - jobs descobertos para envio;
  - vínculo com o cliente da automação;
  - status, tentativas, timestamps e erro operacional.

## Cadastro manual de clientes

Listar clientes cadastrados:

```sql
SELECT id, erp_customer_id, created_at
FROM nfe_email_dispatch_customer
ORDER BY id ASC;
```

Cadastrar um cliente:

```sql
INSERT INTO nfe_email_dispatch_customer (erp_customer_id)
VALUES (12345);
```

Remover um cliente:

```sql
DELETE FROM nfe_email_dispatch_customer
WHERE erp_customer_id = 12345;
```

Observação:
- a remoção do cliente apaga em cascata os jobs dele em `nfe_email_dispatch_sale`.

## Significado dos status

- `PENDING`
  - job descoberto e ainda não processado.
- `IN_PROGRESS`
  - uma tentativa assumiu o job e ainda não o finalizou.
- `SENT`
  - envio confirmado e `sent_at` preenchido.
- `FAILED_TRANSIENT`
  - falha temporária; pode voltar para processamento enquanto `attempt_count < maxSendAttempts`.
- `FAILED_FINAL`
  - falha terminal; não será retomado automaticamente.
- `DELIVERY_UNKNOWN`
  - a execução não conseguiu afirmar com segurança se o e-mail foi entregue ou não.

## Risco de `DELIVERY_UNKNOWN`

`DELIVERY_UNKNOWN` exige investigação manual antes de qualquer reprocessamento, porque:

- o SMTP pode ter aceitado o envio;
- a confirmação durável pode ter ficado ambígua;
- repetir manualmente o envio sem checagem pode duplicar a NF-e para o cliente.

## `IN_PROGRESS` travado

Jobs antigos em `IN_PROGRESS` continuam fora do escopo da automação atual.

Hoje não existe recovery automático para:

- retomar jobs presos;
- resetar `IN_PROGRESS` antigo;
- limpar PDF temporário antigo.

## Validação antes de habilitar em produção

Antes de habilitar `*_SCHEDULE_ENABLED=true`:

- confirmar `pnpm typecheck`, `pnpm lint` e `pnpm build`;
- garantir `automation-control`, `automation-erp-read` e `automation-ixc` saudáveis;
- validar credenciais reais de ERP, IXC e SMTP;
- validar o volume compartilhado do PDF;
- executar `describe` dos dois schedules e conferir:
  - task queue `automation-control`;
  - timezone esperado;
  - horário esperado;
  - `overlap = SKIP`;
  - input com `source: "schedule"`.

## Como habilitar em produção

1. Configurar as variáveis:
   - `NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_ENABLED=true`
   - `NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_ENABLED=true`
   - timezone e horários desejados
2. Garantir o volume compartilhado de `/var/tmp/nfe-email-dispatch`.
3. Subir os workers necessários.
4. Executar:
   - `pnpm temporal:ensure:nfe-email-dispatch-discovery-schedule`
   - `pnpm temporal:ensure:nfe-email-dispatch-processing-schedule`
5. Validar com:
   - `pnpm temporal:describe:nfe-email-dispatch-discovery-schedule`
   - `pnpm temporal:describe:nfe-email-dispatch-processing-schedule`

## Comandos relevantes

- `pnpm temporal:workers:all`
- `pnpm temporal:worker:control`
- `pnpm temporal:worker:erp-read`
- `pnpm temporal:worker:ixc`
- `pnpm temporal:ensure:nfe-email-dispatch-discovery-schedule`
- `pnpm temporal:describe:nfe-email-dispatch-discovery-schedule`
- `pnpm temporal:delete:nfe-email-dispatch-discovery-schedule`
- `pnpm temporal:ensure:nfe-email-dispatch-processing-schedule`
- `pnpm temporal:describe:nfe-email-dispatch-processing-schedule`
- `pnpm temporal:delete:nfe-email-dispatch-processing-schedule`
