# NF-e Email Dispatch — Workflow 2 — processamento e envio de NF-e por e-mail

> Documento consolidado a partir da especificação anexada ao projeto.
> Em caso de conflito com a task ativa, seguir a task ativa e registrar a decisão em `docs/CURRENT_STATE.md`.

---

# Workflow 2 — `processNfeEmailDispatchSales`

## 1. Objetivo

O workflow `processNfeEmailDispatchSales` é responsável por processar as vendas previamente descobertas pelo Workflow 1 e realizar o envio automático da NF-e por e-mail.

Este workflow consome registros da tabela `nfe_email_dispatch_sale` com status `PENDING` ou `FAILED_TRANSIENT`, executa o processamento individual de cada venda em um Child Workflow e grava o resultado final no banco da automação.

Este workflow é responsável por:

- selecionar vendas pendentes ou com falha transitória para processamento;
- registrar o início da tentativa de envio;
- consultar dados complementares da venda no banco do ERP;
- validar e-mails do cliente;
- buscar o PDF da NF-e via API IXC;
- salvar o PDF temporariamente em disco local;
- montar o template HTML do e-mail;
- enviar o e-mail via SMTP;
- atualizar o status final do job no banco da automação.

Este workflow não é responsável por:

- descobrir novas vendas no ERP;
- inserir vendas novas como `PENDING`;
- cadastrar ou remover clientes da automação;
- recuperar jobs travados em `IN_PROGRESS`;
- limpar arquivos temporários antigos por rotina de ambiente.

Essas responsabilidades pertencem a outros fluxos ou à configuração operacional do ambiente.

---

## 2. Relação com o Workflow 1

O Workflow 1, `fetchCustomerNfeSalesCandidates`, é responsável apenas por descobrir vendas no ERP que possuem NF-e emitida e registrar essas vendas no banco da automação com status `PENDING`.

O Workflow 2, `processNfeEmailDispatchSales`, é responsável por processar essas vendas e atualizar o resultado do envio.

Fluxo geral:

```text
Workflow 1
  ↓
Descobre vendas no ERP
  ↓
Insere registros em nfe_email_dispatch_sale com status PENDING
  ↓
Workflow 2
  ↓
Processa PENDING / FAILED_TRANSIENT
  ↓
Envia e-mail
  ↓
Atualiza status final
```

---

## 3. Trigger

O workflow será executado por agendamento.

```text
Frequência: 1 vez ao dia
Horário: 08:00 da manhã
```

A execução deve considerar o timezone configurado na aplicação/ambiente da automação.

### Regras de simultaneidade

Não deve haver duas execuções simultâneas do Workflow 2.

```text
Apenas uma execução ativa do workflow processNfeEmailDispatchSales por vez.
```

O Workflow 2 também não pode executar simultaneamente com o Workflow 1.

```text
processNfeEmailDispatchSales não deve rodar enquanto fetchCustomerNfeSalesCandidates estiver em execução.
```

Essa regra evita que o Workflow 2 processe vendas ao mesmo tempo em que o Workflow 1 está descobrindo e enfileirando novas vendas.

---

## 4. Constantes operacionais

### `maxSendAttempts`

Quantidade máxima de tentativas de processamento de uma venda.

```text
maxSendAttempts = 3
```

Essa contagem usa o campo `attempt_count` da tabela `nfe_email_dispatch_sale`.

O `attempt_count` é incrementado quando o Child Workflow assume o job, ou seja, quando a venda muda para `IN_PROGRESS`.

Para avaliar se a tentativa atual atingiu o limite, deve ser usado o `attempt_count` da tentativa atual, isto é, o valor após o claim.

Exemplo:

```text
attempt_count antes do claim: 2
claim incrementa para: 3
maxSendAttempts: 3

Se essa tentativa falhar por erro transitório:
→ gravar FAILED_FINAL por limite máximo de tentativas.
```

---

### `maxConcurrentChildren`

Quantidade máxima de Child Workflows de venda executando em paralelo.

```text
maxConcurrentChildren = 5
```

Isso significa que, mesmo que existam muitas vendas pendentes, o Parent Workflow deve iniciar no máximo 5 Child Workflows em paralelo.

Essa regra reduz risco de sobrecarga em:

- banco da automação;
- banco do ERP;
- API IXC;
- SMTP;
- workers do Temporal;
- pool de conexões da aplicação.

---

### Diretório temporário de PDF

Os PDFs baixados da API IXC devem ser salvos temporariamente em:

```text
/var/tmp/nfe-email-dispatch
```

O PDF não deve ser gravado no banco de dados.

O PDF também não deve ser retornado em base64 para o workflow.

A activity de busca do PDF deve retornar apenas uma referência local:

```json
{
  "pdfPath": "/var/tmp/nfe-email-dispatch/job-98765-attempt-1-a8f31c.pdf"
}
```

A limpeza de arquivos antigos será tratada por configuração do ambiente, fora do escopo deste workflow.

---

## 5. Tabelas envolvidas

### 5.1. `nfe_email_dispatch_sale`

Tabela principal consumida pelo Workflow 2.

Cada registro representa um job de envio de NF-e por e-mail.

Campos relevantes:

```text
id
erp_sale_id
status
attempt_count
last_attempt_at
sent_at
last_error_message
created_at
updated_at
```

Status usados pelo Workflow 2:

```text
PENDING
IN_PROGRESS
SENT
FAILED_TRANSIENT
FAILED_FINAL
DELIVERY_UNKNOWN
```

---

## 6. Parent Workflow — `processNfeEmailDispatchSales`

### 6.1. Responsabilidade

O Parent Workflow é responsável por:

1. buscar vendas elegíveis no banco da automação;
2. finalizar com sucesso se não houver vendas;
3. criar um Child Workflow por venda encontrada;
4. controlar o paralelismo dos Child Workflows;
5. aguardar a conclusão dos children;
6. consolidar a execução.

---

### 6.2. Consulta de vendas elegíveis

O Parent Workflow deve consultar vendas com status:

```text
PENDING
FAILED_TRANSIENT com attempt_count < maxSendAttempts
```

Consulta:

```sql
SELECT
    id,
    erp_sale_id,
    attempt_count
FROM nfe_email_dispatch_sale
WHERE status = 'PENDING'
   OR (
        status = 'FAILED_TRANSIENT'
        AND attempt_count < ?
   )
ORDER BY created_at ASC, id ASC;
```

Parâmetro:

```text
? = maxSendAttempts
```

---

### 6.3. Resultado da consulta

#### Nenhum registro encontrado

Se a consulta não retornar registros:

```text
Workflow finaliza com sucesso.
```

Nenhum Child Workflow deve ser criado.

---

#### Registros encontrados

Se a consulta retornar registros:

```text
Criar um Child Workflow para cada venda.
```

Cada Child Workflow deve receber, no mínimo:

```ts
type ProcessSingleNfeEmailDispatchSaleInput = {
  nfeEmailDispatchSaleId: number;
  erpSaleId: number;
  currentAttemptCount: number;
  maxSendAttempts: number;
};
```

O `currentAttemptCount` é o valor lido no trigger antes do claim.

A tentativa atual será calculada depois do claim:

```text
attemptNumber = currentAttemptCount + 1
```

---

### 6.4. Políticas de erro no trigger

#### Erro definitivo/não transitório

Se houver erro definitivo ao consultar o banco da automação:

```text
Não fazer retry.
Falhar o Parent Workflow.
```

---

#### Erro transitório

Se houver erro transitório ao consultar o banco da automação:

```text
Tentar retry até 3 vezes.
Se não resolver na terceira tentativa, falhar o Parent Workflow como erro definitivo.
```

Política sugerida:

```text
maximumAttempts = 3
initialInterval = 1 minuto
backoffCoefficient = 2
maximumInterval = 5 minutos
```

---

## 7. Child Workflow — `processSingleNfeEmailDispatchSale`

### 7.1. Responsabilidade

O Child Workflow processa uma única venda.

Ele é responsável por:

1. fazer claim do job no banco da automação;
2. consultar informações da venda no ERP;
3. validar e tratar destinatários de e-mail;
4. buscar o PDF da NF-e via API IXC;
5. montar e enviar o e-mail via SMTP;
6. gravar o resultado final.

---

### 7.2. Entrada

```ts
type ProcessSingleNfeEmailDispatchSaleInput = {
  nfeEmailDispatchSaleId: number;
  erpSaleId: number;
  currentAttemptCount: number;
  maxSendAttempts: number;
};
```

---

### 7.3. Saída sugerida

```ts
type ProcessSingleNfeEmailDispatchSaleResult = {
  nfeEmailDispatchSaleId: number;
  erpSaleId: number;
  status: 'SENT' | 'FAILED_TRANSIENT' | 'FAILED_FINAL' | 'DELIVERY_UNKNOWN' | 'SKIPPED';
  attemptCount?: number;
  errorMessage?: string;
};
```

---

# 8. Etapa 1 — Registrar início do processamento

## 8.1. Objetivo

Registrar o início da tentativa de envio da NF-e.

Essa etapa faz o claim do job, mudando o status para `IN_PROGRESS`, incrementando `attempt_count` e preenchendo `last_attempt_at`.

---

## 8.2. Geração de `attemptStartedAt`

Antes do update, o Child Workflow deve gerar um timestamp na aplicação:

```text
attemptStartedAt
```

Esse valor deve ser gerado uma única vez no Child Workflow e reutilizado em retries da mesma tentativa.

Isso é importante porque, se a activity de claim executar o update com sucesso, mas falhar antes de receber a resposta, o retry poderá validar se o claim já foi feito pela mesma execução.

---

## 8.3. Update de claim

```sql
UPDATE nfe_email_dispatch_sale
SET
    status = 'IN_PROGRESS',
    attempt_count = attempt_count + 1,
    last_attempt_at = ?,
    last_error_message = NULL
WHERE id = ?
  AND (
      status = 'PENDING'
      OR (
          status = 'FAILED_TRANSIENT'
          AND attempt_count < ?
      )
  );
```

Parâmetros:

```text
? = attemptStartedAt
? = nfeEmailDispatchSaleId
? = maxSendAttempts
```

---

## 8.4. Validação do resultado do claim

Após executar o update, validar `affectedRows`.

### `affectedRows = 1`

```text
Claim realizado com sucesso.
Pode seguir processamento.
```

A tentativa atual passa a ser:

```text
attemptNumber = currentAttemptCount + 1
```

---

### `affectedRows = 0`

Executar validação:

```sql
SELECT
    id
FROM nfe_email_dispatch_sale
WHERE id = ?
  AND status = 'IN_PROGRESS'
  AND last_attempt_at = ?;
```

Parâmetros:

```text
? = nfeEmailDispatchSaleId
? = attemptStartedAt
```

#### Se encontrar registro

```text
Claim já foi feito por esta mesma execução.
Pode seguir processamento.
```

#### Se não encontrar registro

```text
Claim não foi realizado.
Encerrar Child Workflow sem processar.
```

Resultado sugerido:

```text
SKIPPED
```

---

# 9. Etapa 2 — Consultar informações da venda no ERP

## 9.1. Objetivo

Buscar no banco do ERP as informações necessárias para montar o e-mail e validar se a venda ainda está elegível para envio.

---

## 9.2. Consulta SQL

```sql
SELECT
  CASE
    WHEN TRIM(c.email) REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}([[:space:]]*;[[:space:]]*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})*$'
      THEN TRIM(c.email)
    ELSE NULL
  END AS email,
  c.razao AS nome_cliente,
  vd.id AS id_venda,
  vd.valor_total,
  vd.numero_nf,
  vd.nfe_chave
FROM vd_saida vd
JOIN cliente c ON c.id = vd.id_cliente
JOIN nfe_xml_pdf nf ON nf.id_saida = vd.id
JOIN retorno_envio_nfe rnf ON rnf.id_saida = vd.id
WHERE vd.id = ?
  AND vd.modelo_nf = 62
  AND vd.status = 'F'
LIMIT 1;
```

Parâmetro:

```text
? = erpSaleId
```

---

## 9.3. Saída esperada

```ts
type NfeSaleEmailContext = {
  email: string | null;
  nomeCliente: string;
  idVenda: number;
  valorTotal: number;
  numeroNf: string | number;
  nfeChave: string | null;
};
```

---

## 9.4. Caso: 0 linhas retornadas

Se a consulta retornar 0 linhas:

```text
Não precisa fazer retry.
Falhar a activity, lançar o erro no child e prosseguir para a etapa final.
```

Resultado final:

```text
status = FAILED_FINAL
last_error_message = "Venda não encontrada ou não elegível no ERP no momento do envio."
```

---

## 9.5. Caso: e-mail NULL

Se o campo `email` vier `NULL`:

```text
Não precisa fazer retry.
Falhar a activity, lançar o erro no child e prosseguir para a etapa final.
```

Resultado final:

```text
status = FAILED_FINAL
last_error_message = "Cliente sem e-mail válido para envio da NF-e."
```

---

## 9.6. Erro definitivo/não transitório na consulta

Se houver erro definitivo/não transitório na consulta ao ERP:

```text
Não tentar retry.
Falhar a activity, capturar o erro no child e prosseguir para a etapa final.
```

Resultado final:

```text
status = FAILED_FINAL
last_error_message = "Falha definitiva ao buscar informações da venda no ERP"
```

---

## 9.7. Erro transitório na consulta

Se houver erro transitório na consulta ao ERP:

```text
Tentar retry 3 vezes.
Se as tentativas expirarem sem sucesso, falhar a activity, capturar o erro no child e prosseguir para a etapa final.
```

Resultado final:

```text
status = FAILED_TRANSIENT
last_error_message = "Falha no servidor ao buscar informações da venda"
```

---

## 9.8. Tratamento de múltiplos e-mails

A regex aceita múltiplos e-mails separados por `;`.

A aplicação deve transformar:

```text
cliente1@email.com;cliente2@email.com
```

em:

```ts
['cliente1@email.com', 'cliente2@email.com']
```

Regra:

```text
split por ;
trim em cada item
remover entradas vazias
```

Após o tratamento, se a lista final de e-mails ficar vazia:

```text
pular para a etapa final
```

Resultado final:

```text
status = FAILED_FINAL
last_error_message = "Cliente sem e-mail válido para envio da NF-e."
```

---

# 10. Etapa 3 — Busca do PDF da NF-e

## 10.1. Objetivo

Chamar a API IXC para obter o PDF da NF-e em base64, validar o retorno, converter para PDF e salvar o arquivo temporariamente em disco local.

---

## 10.2. Chamada da API IXC

```text
Método: POST
Endpoint: imprimir_nota
Payload: {"id": <id_venda>, "base64": "S"}
Retorno esperado: text/html contendo o base64 do PDF da NF-e
```

---

## 10.3. Validações obrigatórias

Mesmo que a API retorne HTTP 200, a aplicação deve validar o conteúdo.

Validações mínimas:

```text
resposta não está vazia
conteúdo pode ser tratado como base64
base64 pode ser decodificado
buffer gerado não está vazio
buffer gerado é um PDF válido
```

Validação simples de PDF:

```text
buffer começa com %PDF
```

---

## 10.4. Salvamento temporário

Após validar o PDF, salvar o arquivo em:

```text
/var/tmp/nfe-email-dispatch
```

Nome do arquivo:

```text
job-<nfe_email_dispatch_sale_id>-attempt-<attempt_count>-<random>.pdf
```

Exemplo:

```text
/var/tmp/nfe-email-dispatch/job-98765-attempt-1-a8f31c.pdf
```

A activity deve retornar apenas a referência local:

```json
{
  "pdfPath": "/var/tmp/nfe-email-dispatch/job-98765-attempt-1-a8f31c.pdf"
}
```

---

## 10.5. Observações

```text
O PDF não deve ser retornado em base64 para o workflow.
O PDF não deve ser gravado no banco de dados.
O nome do arquivo não deve conter dados sensíveis.
```

---

## 10.6. PDF inválido ou resposta sem PDF

Se o resultado final das validações não for um PDF:

```text
Não precisa fazer retry.
Falhar a activity, lançar o erro no child e prosseguir para a etapa final.
```

Resultado final:

```text
status = FAILED_FINAL
last_error_message = mensagem do erro
```

---

## 10.7. Erro definitivo/não transitório na API

Se a chamada à API apresentar erro definitivo/não transitório:

```text
Não precisa fazer retry.
Falhar a activity, capturar o erro no child e prosseguir para a etapa final.
```

Resultado final:

```text
status = FAILED_FINAL
last_error_message = mensagem do erro
```

---

## 10.8. Erro transitório na API

Se a chamada à API apresentar falha transitória:

```text
Tentar retry 3 vezes.
Se não der certo, falhar a activity, capturar o erro no child e prosseguir para a etapa final.
```

Resultado final inicial:

```text
status = FAILED_TRANSIENT
last_error_message = mensagem do erro
```

---

# 11. Etapa 4 — Envio do e-mail

## 11.1. Objetivo

Enviar o e-mail com o HTML preenchido e o PDF da NF-e anexado.

---

## 11.2. Template

O template HTML ficará no projeto em:

```text
nfe-email-template.html
```

O template usa as variáveis:

```text
{{nome_cliente}}
{{numero_nf}}
{{valor_total}}
{{nfe_chave}}
```

---

## 11.3. Assunto do e-mail

Assunto sugerido:

```text
Sua Nota Fiscal - NET3 WIFI
```

---

## 11.4. Montagem do HTML

Antes de inserir os valores no template, a aplicação deve escapar as variáveis vindas do ERP para evitar quebrar o HTML ou injetar conteúdo inesperado.

Escapar principalmente:

```text
nome_cliente
numero_nf
valor_total
nfe_chave
```

O campo `valor_total` deve ser formatado como moeda antes de ser inserido no template.

---

## 11.5. PDF não encontrado

Se não for encontrado o arquivo informado em `pdfPath`:

```text
tratar como FAILED_TRANSIENT
```

---

## 11.6. Retry

Não fazer retry nesta activity em nenhum caso.

```text
maximumAttempts = 1
```

Motivo:

```text
Reexecutar uma activity que envia e-mail pode gerar envio duplicado.
```

---

## 11.7. Retorno da activity

O retorno da activity deve fornecer o status do envio que será usado na etapa final.

```ts
type SendNfeEmailResult = {
  status: 'SENT' | 'FAILED_TRANSIENT' | 'FAILED_FINAL' | 'DELIVERY_UNKNOWN';
  errorMessage?: string;
};
```

---

# 12. Etapa 5 — Gravar resultado final

## 12.1. Objetivo

Gravar o resultado do envio de e-mail no banco de dados da automação.

Mapeamento:

```text
Envio bem-sucedido → SENT
Falha transitória → FAILED_TRANSIENT ou FAILED_FINAL por limite de tentativas
Falha definitiva/não transitória → FAILED_FINAL
Erro desconhecido ou ambíguo → DELIVERY_UNKNOWN
```

---

## 12.2. Idempotência da gravação final

A gravação final deve ser idempotente.

Pode acontecer de o update ser executado com sucesso no banco, mas a activity falhar antes de receber a resposta.

Após executar qualquer update final, validar `affectedRows`.

### `affectedRows = 1`

```text
Resultado gravado com sucesso.
```

---

### `affectedRows = 0`

Consultar o registro atual:

```sql
SELECT
    status,
    sent_at
FROM nfe_email_dispatch_sale
WHERE id = ?;
```

Se o status atual já for o mesmo status que a etapa tentou gravar:

```text
considerar a etapa final como concluída com sucesso.
```

Exemplo:

```text
tentou gravar SENT
registro atual já está SENT
sent_at está preenchido
→ considerar sucesso
```

Se o status esperado for `SENT`:

```text
considerar sucesso somente se status = SENT e sent_at estiver preenchido.
```

Se o status atual for diferente do status esperado:

```text
tratar como inconsistência e falhar a activity.
```

Se a consulta não retornar registro:

```text
tratar como inconsistência operacional e falhar a activity.
```

---

## 12.3. Sucesso

```sql
UPDATE nfe_email_dispatch_sale
SET
    status = 'SENT',
    sent_at = NOW(3),
    last_error_message = NULL
WHERE id = ?
  AND status = 'IN_PROGRESS';
```

---

## 12.4. Falha transitória

Antes de gravar `FAILED_TRANSIENT`, verificar o limite de tentativas.

```text
Se resultado = FAILED_TRANSIENT e attempt_count < maxSendAttempts:
→ executar UPDATE de FAILED_TRANSIENT

Se resultado = FAILED_TRANSIENT e attempt_count >= maxSendAttempts:
→ executar UPDATE de FAILED_FINAL
```

Para avaliar `maxSendAttempts`, usar o número da tentativa atual, ou seja, o `attempt_count` recuperado pelo trigger somado de 1 unidade, pois o claim da etapa 1 incrementa esse valor antes do processamento.
Exemplo:
- attempt_count recuperado pelo trigger = 2
- claim incrementa para 3
- tentativa atual = 3
- como maxSendAttempts = 3, uma nova falha transitória deve ser gravada como FAILED_FINAL.

SQL para gravar `FAILED_TRANSIENT`:

```sql
UPDATE nfe_email_dispatch_sale
SET
    status = 'FAILED_TRANSIENT',
    sent_at = NULL,
    last_error_message = ?
WHERE id = ?
  AND status = 'IN_PROGRESS';
```

---

## 12.5. Falha definitiva

```sql
UPDATE nfe_email_dispatch_sale
SET
    status = 'FAILED_FINAL',
    sent_at = NULL,
    last_error_message = ?
WHERE id = ?
  AND status = 'IN_PROGRESS';
```

---

## 12.6. Resultado desconhecido

```sql
UPDATE nfe_email_dispatch_sale
SET
    status = 'DELIVERY_UNKNOWN',
    sent_at = NULL,
    last_error_message = ?
WHERE id = ?
  AND status = 'IN_PROGRESS';
```

---

# 13. Tratamento de `IN_PROGRESS` sem finalização

Jobs que ficarem `IN_PROGRESS` sem finalização não serão recuperados por este workflow.

```text
Esse tratamento será feito por workflow separado.
```

Este workflow não deve buscar automaticamente jobs `IN_PROGRESS` antigos.

---

# 14. Fluxo completo

```text
Schedule diário às 08:00
  ↓
Parent Workflow: processNfeEmailDispatchSales
  ↓
Validar que Workflow 1 não está em execução
  ↓
Validar que não existe outra execução ativa do Workflow 2
  ↓
Consultar vendas PENDING e FAILED_TRANSIENT com attempt_count < maxSendAttempts
  ↓
Se 0 registros:
    finalizar com sucesso
  ↓
Se registros encontrados:
    criar Child Workflow por venda
    respeitando maxConcurrentChildren = 5
  ↓
Child Workflow: processSingleNfeEmailDispatchSale
  ↓
Claim do job
  ↓
Se claim não realizado:
    finalizar child como SKIPPED
  ↓
Consultar informações da venda no ERP
  ↓
Validar e-mails
  ↓
Buscar PDF na API IXC
  ↓
Salvar PDF em /var/tmp/nfe-email-dispatch
  ↓
Enviar e-mail via SMTP sem retry
  ↓
Gravar resultado final de forma idempotente
  ↓
Finalizar child
  ↓
Parent consolida resultados
  ↓
Finalizar workflow
```

---

# 15. Políticas de retry por etapa

## 15.1. Consulta inicial no banco da automação

```text
Erro definitivo/não transitório:
→ não fazer retry
→ falhar Parent Workflow

Erro transitório:
→ tentar retry 3x
→ se não resolver, falhar Parent Workflow
```

---

## 15.2. Claim do job

Erro definitivo/não transitório:
→ não fazer retry
→ falhar o Child Workflow

Erro transitório:
→ tentar retry 3x
→ se não resolver, falhar o Child Workflow

Observações:
- O attemptStartedAt deve ser gerado uma única vez no child e reutilizado em retries da mesma tentativa.
- Se o UPDATE executar com sucesso, mas a activity falhar antes de receber a resposta, o retry deve validar se o claim já foi feito pela mesma execução usando last_attempt_at = attemptStartedAt.
- Se o claim não for confirmado, o child não deve consultar ERP, API IXC, SMTP nem executar a etapa final.

```

Observação:

```text
Se o claim já tiver sido feito pela mesma execução, validar usando last_attempt_at = attemptStartedAt.
```

---

## 15.3. Consulta da venda no ERP

```text
Venda não encontrada ou não elegível:
→ FAILED_FINAL

E-mail inválido ou vazio:
→ FAILED_FINAL

Erro definitivo/não transitório:
→ FAILED_FINAL

Erro transitório:
→ retry 3x
→ se não resolver, FAILED_TRANSIENT
```

---

## 15.4. Busca do PDF na API IXC

```text
Resposta sem PDF válido:
→ FAILED_FINAL

Erro definitivo/não transitório:
→ FAILED_FINAL

Erro transitório:
→ retry 3x
→ se não resolver, FAILED_TRANSIENT
```

---

## 15.5. Envio SMTP

```text
Não fazer retry em nenhum caso.
```

A activity de envio deve retornar:

```text
SENT
FAILED_TRANSIENT
FAILED_FINAL
DELIVERY_UNKNOWN
```

---

## 15.6. Gravação final

A gravação final deve ser idempotente.

Erro definitivo/não transitório:
→ não fazer retry
→ falhar a activity

Erro transitório:
→ tentar retry 3x
→ se não resolver, falhar a activity

Observações:
- Se o UPDATE final retornar affectedRows = 0, consultar o status atual do registro.
- Se o status atual já for o status esperado, considerar sucesso.
- Se o status esperado for SENT, considerar sucesso somente se status = SENT e sent_at estiver preenchido.
- Se o status atual for diferente do esperado, tratar como inconsistência e falhar a activity.
- Se a gravação final falhar definitivamente depois do envio SMTP, o job pode ficar IN_PROGRESS e será tratado por workflow separado.

```

---

# 16. Decisões atuais

```text
Parent Workflow: processNfeEmailDispatchSales
Child Workflow: processSingleNfeEmailDispatchSale
Trigger: diário às 08:00
Não simultâneo com ele mesmo
Não simultâneo com Workflow 1
maxConcurrentChildren = 5
maxSendAttempts = 3
Processamento: por venda
PDF temporário: /var/tmp/nfe-email-dispatch
SMTP: sem retry automático
Status inicial consumido: PENDING / FAILED_TRANSIENT
Status final possível: SENT / FAILED_TRANSIENT / FAILED_FINAL / DELIVERY_UNKNOWN
IN_PROGRESS travado: fora do escopo deste workflow
```

---

# 17. Pontos fora do escopo deste documento

Este documento não cobre:

- Workflow 1;
- modelagem das tabelas;
- workflow de recuperação de jobs `IN_PROGRESS`;
- limpeza de arquivos temporários via crontab;
- configuração do servidor SMTP;
- configuração da API IXC;
- gerenciamento de secrets/credenciais;
- observabilidade detalhada;
- alertas operacionais;
- telas ou relatórios administrativos.
