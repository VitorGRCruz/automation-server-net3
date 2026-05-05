# Task 27 - NF-e Email Dispatch — PDF IXC, template, SMTP e finalização completa

## Objetivo

Completar o Workflow 2 com busca do PDF da NF-e via API IXC, salvamento temporário em disco, renderização segura do template HTML, envio de e-mail via SMTP compartilhado e atualização final do job.

## Leitura obrigatória antes de codar

- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CODEX_EXECUTION_PROTOCOL.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ARCHITECTURE.md`
- `docs/TEMPORAL_RULES.md`
- `docs/ERROR_CLASSIFICATION.md`
- `docs/INTEGRATIONS_RULES.md`
- `docs/specs/nfe-email-dispatch/README.md`
- `docs/specs/nfe-email-dispatch/00-contexto-e-mapa-de-implementacao.md`
- `docs/specs/nfe-email-dispatch/03-workflow-2-process-nfe-email-dispatch-sales.md`
- `docs/specs/nfe-email-dispatch/04-template-email-pdf-e-smtp.md`
- `docs/tasks/24-nfe-email-dispatch-foundation-and-modeling.md`
- `docs/tasks/25-nfe-email-dispatch-discovery-workflow.md`
- `docs/tasks/26-nfe-email-dispatch-processing-core.md`
- esta task

## Escopo permitido

O agente pode alterar apenas:

- `src/domain/nfe/**`
- `src/infra/config/**`
- `src/integrations/ixc/**`
- `src/temporal/activities/nfe/**`
- `src/temporal/activities/shared/**` apenas se for necessário ajustar tipo/export compatível, sem quebrar usos existentes
- `src/temporal/workflows/nfe/**`
- `src/temporal/activities/index.ts`
- `src/temporal/workflows/index.ts`
- `src/temporal/worker/worker-activity-groups.ts`
- `docker-compose.yml` somente se necessário para volume temporário compartilhado nesta task
- `.env.example`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ARCHITECTURE.md` se a operação do volume afetar runtime

## Não pode

- não criar SMTP client paralelo;
- não fazer retry automático na activity de envio SMTP;
- não retornar base64 do PDF para o workflow;
- não salvar PDF no banco;
- não logar base64 ou conteúdo do PDF;
- não implementar recovery de `IN_PROGRESS` antigo;
- não criar schedules nesta task, salvo se a Task 28 já tiver sido antecipada por erro, o que deve ser evitado.

## Entregáveis obrigatórios

### 1. Client IXC para `imprimir_nota`

Estender:

```text
src/integrations/ixc/ixc.client.ts
src/integrations/ixc/ixc.types.ts
```

Adicionar operação para:

```text
POST imprimir_nota
payload: { id: <id_venda>, base64: "S" }
```

O client deve retornar o conteúdo bruto necessário para a activity validar o PDF.

### 2. Activity `fetchNfePdfFromIxc`

Criar:

```text
src/temporal/activities/nfe/fetch-nfe-pdf-from-ixc.activity.ts
```

Rodar em:

```text
automation-ixc
```

Responsabilidade:

1. validar input;
2. chamar IXC `imprimir_nota`;
3. extrair/normalizar base64;
4. decodificar para buffer;
5. validar buffer não vazio;
6. validar header `%PDF`;
7. criar diretório temporário se não existir;
8. salvar arquivo em `NFE_EMAIL_DISPATCH_PDF_TMP_DIR`;
9. retornar `{ pdfPath }`.

Nome do arquivo:

```text
job-<nfeEmailDispatchSaleId>-attempt-<attemptCount>-<random>.pdf
```

Não incluir cliente, e-mail, chave de acesso ou dados sensíveis no nome.

### 3. Activity `renderNfeEmailTemplate`

Criar:

```text
src/temporal/activities/nfe/render-nfe-email-template.activity.ts
```

Rodar em:

```text
automation-control
```

Responsabilidade:

- carregar o template HTML de `src/domain/nfe/templates/nfe-email-template.html` em dev e de `dist/domain/nfe/templates/nfe-email-template.html` em produção;
- escapar placeholders;
- formatar `valor_total`;
- devolver `html` e `text`.

A activity não deve fazer I/O externo. Leitura local de arquivo é aceitável.

### 4. Reutilizar `sendSmtpEmailActivity`

No child workflow, criar proxy para:

```text
src/temporal/activities/shared/send-smtp-email.activity.ts
```

Rodar em:

```text
automation-control
```

Configuração obrigatória:

```ts
retry: { maximumAttempts: 1 }
```

Mensagem:

```ts
{
  to: recipients,
  subject: "Sua Nota Fiscal - NET3 WIFI",
  html,
  text,
  attachments: [
    {
      filename: `nfe-${numeroNfSanitizado}.pdf`,
      path: pdfPath,
      contentType: "application/pdf",
      contentDisposition: "attachment"
    }
  ]
}
```

Idempotency key sugerida:

```text
nfe-email-dispatch-sale-<nfeEmailDispatchSaleId>-attempt-<attemptCount>
```

Se a activity SMTP retornar `failureType = "pending"`, mapear para `DELIVERY_UNKNOWN`.

### 5. Completar child Workflow 2

Atualizar:

```text
src/temporal/workflows/nfe/process-single-nfe-email-dispatch-sale.workflow.ts
```

Fluxo completo:

```text
claim
  ↓
fetch ERP context
  ↓
fetch PDF from IXC
  ↓
render template
  ↓
send SMTP com maximumAttempts = 1
  ↓
finalize status
```

Mapeamento de falhas:

```text
ERP venda não encontrada/não elegível -> FAILED_FINAL
ERP e-mail inválido/vazio -> FAILED_FINAL
ERP erro transitório após retries -> FAILED_TRANSIENT ou FAILED_FINAL se limite atingido
IXC PDF inválido/sem PDF -> FAILED_FINAL
IXC erro permanente -> FAILED_FINAL
IXC erro transitório após retries -> FAILED_TRANSIENT ou FAILED_FINAL se limite atingido
SMTP sucesso -> SENT
SMTP falha permanente -> FAILED_FINAL
SMTP falha transitória antes de confirmação -> FAILED_TRANSIENT ou FAILED_FINAL se limite atingido
SMTP pending/ambíguo -> DELIVERY_UNKNOWN
Erro desconhecido depois de possível envio -> DELIVERY_UNKNOWN
```

### 6. Garantir volume temporário compartilhado

Se `fetchNfePdfFromIxcActivity` roda em `automation-ixc` e `sendSmtpEmailActivity` roda em `automation-control`, o arquivo precisa existir nos dois processos.

Atualizar `docker-compose.yml` se necessário para montar um volume compartilhado em:

```text
/var/tmp/nfe-email-dispatch
```

nos serviços dos workers envolvidos.

Se não alterar Docker Compose nesta task, registrar a pendência de forma explícita em `docs/CURRENT_STATE.md`, mas a recomendação é resolver aqui.

### 7. Registrar activity no worker correto

Atualizar:

```text
src/temporal/worker/worker-activity-groups.ts
```

Mapeamento:

```text
ixcWorkerActivities:
  fetchNfePdfFromIxcActivity

controlWorkerActivities:
  renderNfeEmailTemplateActivity
  sendSmtpEmailActivity já existente
```

### 8. Preservar build do template

Confirmar que:

```bash
pnpm build
```

copia o HTML para `dist/domain/nfe/templates/`.

## Critérios de aceite

A task está pronta se:

- IXC client possui operação `imprimir_nota` ou equivalente;
- activity de PDF valida base64 e `%PDF`;
- PDF é salvo em path local configurável;
- workflow recebe apenas `pdfPath`;
- template é renderizado com escape;
- `valor_total` não duplica `R$`;
- SMTP usa `sendSmtpEmailActivity` existente;
- SMTP tem `maximumAttempts = 1`;
- child Workflow 2 finaliza `SENT`, `FAILED_TRANSIENT`, `FAILED_FINAL` ou `DELIVERY_UNKNOWN` corretamente;
- falha transitória no limite vira `FAILED_FINAL`;
- volume temporário compartilhado foi implementado ou pendência foi documentada com destaque;
- `pnpm typecheck` passa;
- `pnpm lint` passa;
- `pnpm build` passa;
- `docs/CURRENT_STATE.md` e `docs/TASK_BOARD.md` foram atualizados.

## Validação mínima

Executar:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Se houver ambiente real/controlado:

- testar `fetchNfePdfFromIxcActivity` com uma venda conhecida;
- confirmar que o arquivo PDF é criado e começa com `%PDF`;
- confirmar que o worker SMTP consegue ler o arquivo no volume compartilhado;
- enviar para e-mail de teste controlado antes de habilitar schedule.

## Atualização de documentação ao final

Atualizar:

- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ARCHITECTURE.md` se Docker/volume/topologia operacional mudou

No `TASK_BOARD`, adicionar a Task 27 como concluída somente se os critérios de aceite foram cumpridos.

## Ao terminar

Responder com:

1. resumo curto do que foi feito;
2. arquivos alterados;
3. validações executadas;
4. pendências ou riscos;
5. confirmação de atualização de docs.
