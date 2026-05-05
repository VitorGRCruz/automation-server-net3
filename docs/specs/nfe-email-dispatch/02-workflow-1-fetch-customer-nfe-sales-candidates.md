# NF-e Email Dispatch — Workflow 1 — descoberta de vendas candidatas

> Documento consolidado a partir da especificação anexada ao projeto.
> Em caso de conflito com a task ativa, seguir a task ativa e registrar a decisão em `docs/CURRENT_STATE.md`.

---

# Workflow 1 — `fetchCustomerNfeSalesCandidates`

## 1. Objetivo

O workflow `fetchCustomerNfeSalesCandidates` é responsável por orquestrar a descoberta diária de vendas no ERP IXC que possuem NF-e pronta para envio por e-mail.

Este workflow atua como **Parent Workflow**. Ele carrega os clientes cadastrados na automação e dispara um **Child Workflow por cliente**, respeitando limite de paralelismo.

Cada Child Workflow é responsável por:

1. calcular a janela efetiva de busca daquele cliente;
2. buscar vendas candidatas no ERP IXC;
3. registrar as vendas encontradas no banco da automação com status `PENDING`.

Este workflow não é responsável por:

- buscar o PDF/base64 da NF-e via API;
- montar conteúdo de e-mail;
- enviar e-mail via SMTP;
- atualizar venda como enviada;
- processar falhas de envio;
- realizar retry de envio de NF-e.

Essas responsabilidades pertencem ao Workflow 2.

---

## 2. Contexto da solução

A automação possui dois bancos relevantes para este workflow:

1. **Banco da automação**
   - contém os clientes cadastrados para participação no envio automático;
   - contém as vendas já descobertas e enfileiradas para envio;
   - controla duplicidade, status e histórico operacional.

2. **Banco do ERP IXC**
   - contém as vendas;
   - contém as informações fiscais;
   - contém a associação entre venda e NF-e;
   - é a fonte de verdade para identificar se uma venda possui NF-e pronta.

A estratégia adotada é:

> Para cada cliente cadastrado na automação, buscar no ERP as vendas com NF-e pronta dentro de uma janela recente de redescoberta, respeitando a data de entrada do cliente na automação, e inserir os resultados no banco local de forma idempotente.

A execução por cliente será isolada em Child Workflows para melhorar rastreabilidade, isolamento de falhas e reprocessamento individual.

---

## 3. Trigger

O workflow será executado por schedule.

```text
Frequência: 1 vez ao dia
Horário: 03:00 da manhã
```

A execução deve considerar o timezone configurado na aplicação/ambiente da automação.

### Regra de simultaneidade

Não deve haver duas execuções simultâneas do Parent Workflow.

Se uma execução anterior ainda estiver em andamento no momento do próximo schedule, a nova execução não deve ser iniciada.

Regra desejada:

```text
Apenas uma execução ativa do workflow fetchCustomerNfeSalesCandidates por vez.
```

---

## 4. Estratégia de janela de redescoberta

O workflow utiliza uma janela de redescoberta.

```text
discoveryWindowDays = 15
```

Para cada execução, o Parent Workflow calcula:

```text
discoveryStartedAt = data/hora de início lógico do workflow
discoveryWindowStart = discoveryStartedAt - 15 dias
```

Para cada cliente, a data mínima efetiva de busca será calculada pelo Child Workflow:

```text
effectiveStart = max(customer.created_at, discoveryWindowStart)
```

Essa regra garante que:

- vendas anteriores à entrada do cliente na automação não sejam consideradas;
- clientes removidos e reinseridos sejam tratados como novos participantes;
- vendas recentes que falharam em uma inserção anterior possam ser redescobertas;
- o workflow não precise buscar todo o histórico do ERP.

---

## 5. Modelo de execução com Child Workflow por cliente

O Parent Workflow processa clientes por meio de Child Workflows.

Fluxo conceitual:

```text
Schedule diário às 03:00
  ↓
Parent Workflow: fetchCustomerNfeSalesCandidates
  ↓
Activity 1: carregar clientes cadastrados na automação
  ↓
Para cada cliente:
    iniciar Child Workflow: fetchSingleCustomerNfeSalesCandidates
    respeitando limite de 5 Child Workflows em paralelo
  ↓
Consolidar resultados
  ↓
Finalizar Parent Workflow
```

Cada Child Workflow executa:

```text
Child Workflow: fetchSingleCustomerNfeSalesCandidates
  ↓
calcular effectiveStart
  ↓
Activity 1: buscar vendas elegíveis no ERP para aquele cliente
  ↓
Se não houver vendas:
    finalizar Child Workflow com sucesso
  ↓
Se houver vendas:
    Activity 2: inserir vendas como PENDING no banco da automação
  ↓
Finalizar Child Workflow
```

A consulta ao ERP é executada por cliente, usando:

```text
vd.id_cliente = customer.erp_customer_id
rnf.data_recebimento >= effectiveStart
```

Essa abordagem foi escolhida por:

- manter a consulta SQL simples;
- facilitar depuração por cliente;
- evitar SQL dinâmico complexo;
- isolar falhas por cliente;
- permitir reprocessamento individual;
- controlar o paralelismo sobre o ERP e o banco da automação;
- evitar uma consulta geral com muitas regras condicionais por cliente.

---

## 6. Controle de paralelismo

O Parent Workflow deve limitar a quantidade de Child Workflows executando simultaneamente.

```text
maxConcurrentChildren = 5
```

Isso significa que, mesmo que existam 200 clientes cadastrados, o Parent Workflow deve iniciar no máximo 5 Child Workflows em paralelo.

Exemplo:

```text
Clientes cadastrados: 200
Paralelismo máximo: 5
Quantidade aproximada de ondas: 40
```

Essa regra reduz risco de sobrecarga em:

- Temporal;
- banco do ERP IXC;
- banco da automação;
- pool de conexões;
- infraestrutura da aplicação.

### Regra operacional

O Parent Workflow deve iniciar novos Child Workflows conforme os anteriores forem finalizando, mantendo no máximo 5 em execução simultânea.

---

## 7. Tabelas envolvidas

### 7.1. `nfe_email_dispatch_customer`

Tabela de clientes cadastrados para envio automático de NF-e.

Campos relevantes para este workflow:

```text
id
erp_customer_id
created_at
```

#### Campo `id`

Identificador interno do cliente na automação.

#### Campo `erp_customer_id`

Identificador do cliente no ERP IXC.

#### Campo `created_at`

Data/hora em que o cliente foi cadastrado na automação.

Esse campo define o início mínimo de busca de vendas para o cliente.

Se o cliente for removido e reinserido, o novo registro terá um novo `created_at`.

---

### 7.2. `nfe_email_dispatch_sale`

Tabela de vendas descobertas para envio de NF-e.

Campos relevantes para este workflow:

```text
id
nfe_email_dispatch_customer_id
erp_sale_id
erp_invoice_key
erp_invoice_emitted_at
status
created_at
updated_at
```

O status inicial de toda venda inserida por este workflow deve ser:

```text
PENDING
```

---

## 8. Constraint de duplicidade

A duplicidade deve ser impedida pelo banco da automação.

Constraint esperada:

```sql
UNIQUE KEY uk_nfe_email_dispatch_sale__customer_sale
    (nfe_email_dispatch_customer_id, erp_sale_id)
```

Essa constraint garante que a mesma venda do ERP não seja registrada mais de uma vez para o mesmo cliente da automação.

A Activity de inserção deve ser idempotente. Ou seja:

- se a venda ainda não existe, ela é inserida;
- se a venda já existe, ela é ignorada;
- duplicidade não deve ser tratada como erro operacional.

---

## 9. Estrutura do Parent Workflow

O Parent Workflow `fetchCustomerNfeSalesCandidates` possui uma activity principal:

```text
1. loadNfeEmailDispatchCustomers
```

Depois da Activity 1, o Parent Workflow inicia Child Workflows por cliente.

---

# 10. Activity do Parent — `loadNfeEmailDispatchCustomers`

## 10.1. Responsabilidade

Buscar no banco da automação todos os clientes cadastrados para envio automático de NF-e.

## 10.2. Fonte

Banco de dados da automação.

## 10.3. Entrada

Nenhuma.

## 10.4. Saída

```ts
type NfeEmailDispatchCustomer = {
  id: number;
  erpCustomerId: number;
  createdAt: string;
};
```

## 10.5. Consulta conceitual

```sql
SELECT
    id,
    erp_customer_id,
    created_at
FROM nfe_email_dispatch_customer;
```

## 10.6. Resultado esperado

### Caso 1 — nenhum cliente encontrado

O Parent Workflow deve finalizar com sucesso.

```text
Motivo: não existem clientes cadastrados para envio automático.
```

Nenhum Child Workflow deve ser iniciado.

### Caso 2 — um ou mais clientes encontrados

O Parent Workflow deve iniciar Child Workflows por cliente, respeitando `maxConcurrentChildren = 5`.

---

# 11. Child Workflow — `fetchSingleCustomerNfeSalesCandidates`

## 11.1. Responsabilidade

Processar a descoberta de vendas com NF-e pronta para um único cliente.

## 11.2. Entrada

```ts
type FetchSingleCustomerNfeSalesCandidatesInput = {
  automationCustomerId: number;
  erpCustomerId: number;
  customerCreatedAt: string;
  discoveryStartedAt: string;
  discoveryWindowDays: number;
};
```

## 11.3. Saída

```ts
type FetchSingleCustomerNfeSalesCandidatesResult = {
  automationCustomerId: number;
  erpCustomerId: number;
  status: 'SUCCESS' | 'FAILED';
  foundSales: number;
  queuedSales: number;
  errorMessage?: string;
};
```

## 11.4. Cálculo de `effectiveStart`

Antes de buscar vendas no ERP, o Child Workflow deve calcular:

```text
discoveryWindowStart = discoveryStartedAt - 15 dias
effectiveStart = max(customerCreatedAt, discoveryWindowStart)
```

## 11.5. Exemplo

```text
discoveryStartedAt: 2026-04-24 03:00:00
discoveryWindowDays: 15
discoveryWindowStart: 2026-04-09 03:00:00
```

### Cliente A

```text
customerCreatedAt: 2026-04-01 10:00:00
effectiveStart: 2026-04-09 03:00:00
```

Como o cliente entrou antes da janela, usa-se o início da janela.

### Cliente B

```text
customerCreatedAt: 2026-04-20 08:30:00
effectiveStart: 2026-04-20 08:30:00
```

Como o cliente entrou depois do início da janela, usa-se a data de cadastro do cliente.

---

# 12. Activity do Child — `fetchCustomerNfeSalesCandidatesFromErp`

## 12.1. Responsabilidade

Buscar no banco do ERP IXC as vendas de um cliente específico que possuem NF-e pronta para envio, respeitando o `effectiveStart`.

Esta activity deve devolver apenas vendas elegíveis para enfileiramento.

A activity de inserção não deve reaplicar filtro de data de cadastro do cliente, porque esta activity já trata esse filtro por meio do parâmetro `effectiveStart`.

## 12.2. Fonte

Banco de dados do ERP IXC.

## 12.3. Entrada

```ts
type FetchCustomerNfeSalesCandidatesFromErpInput = {
  automationCustomerId: number;
  erpCustomerId: number;
  effectiveStart: string;
};
```

## 12.4. Saída

```ts
type ErpNfeSaleCandidate = {
  automationCustomerId: number;
  erpCustomerId: number;
  erpSaleId: number;
  erpInvoiceKey: string | null;
  erpInvoiceEmittedAt: string;
};
```

## 12.5. Consulta SQL base

A consulta deve se basear no seguinte modelo:

```sql
SELECT
  vd.id AS id_venda,
  vd.nfe_chave,
  rnf.data_recebimento AS data_emissao_nfe
FROM vd_saida vd
JOIN cliente c ON c.id = vd.id_cliente
JOIN nfe_xml_pdf nf ON nf.id_saida = vd.id
JOIN retorno_envio_nfe rnf ON rnf.id_saida = vd.id
WHERE vd.modelo_nf = 62
  AND vd.status = 'F'
  AND vd.id_cliente = ?
  AND rnf.data_recebimento >= ?;
```

## 12.6. Parâmetros

```text
? = erpCustomerId
? = effectiveStart
```

## 12.7. Interpretação das condições

### `vd.modelo_nf = 62`

Restringe a busca ao modelo fiscal esperado para este processo.

### `vd.status = 'F'`

Restringe a busca a vendas finalizadas/faturadas, conforme regra do ERP.

### `JOIN nfe_xml_pdf nf ON nf.id_saida = vd.id`

Garante que existe registro de XML/PDF associado à venda.

### `JOIN retorno_envio_nfe rnf ON rnf.id_saida = vd.id`

Garante que existe retorno de autorização da NF-e.

### `rnf.data_recebimento >= effectiveStart`

Garante que a venda está dentro da janela válida para aquele cliente.

---

# 13. Activity do Child — `enqueueNfeEmailDispatchSales`

## 13.1. Responsabilidade

Registrar no banco da automação as vendas candidatas retornadas pelo ERP, criando registros com status `PENDING`.

## 13.2. Fonte

Banco de dados da automação.

## 13.3. Entrada

```ts
type EnqueueNfeEmailDispatchSalesInput = {
  candidates: ErpNfeSaleCandidate[];
};
```

## 13.4. Saída

```ts
type EnqueueNfeEmailDispatchSalesResult = {
  receivedCandidates: number;
  queuedSales: number;
};
```

## 13.5. Regras

Para cada venda candidata:

1. inserir na tabela `nfe_email_dispatch_sale`;
2. usar `status = 'PENDING'`;
3. usar `nfe_email_dispatch_customer_id = automationCustomerId`;
4. usar `erp_sale_id = erpSaleId`;
5. usar `erp_invoice_key = erpInvoiceKey`;
6. usar `erp_invoice_emitted_at = erpInvoiceEmittedAt`;
7. se a venda já existir, ignorar;
8. duplicidade não deve gerar erro;
9. erro real de banco deve falhar a activity.

## 13.6. Insert idempotente em MariaDB

```sql
INSERT INTO nfe_email_dispatch_sale (
    nfe_email_dispatch_customer_id,
    erp_sale_id,
    erp_invoice_key,
    erp_invoice_emitted_at,
    status,
    created_at,
    updated_at
) VALUES
    (?, ?, ?, ?, 'PENDING', NOW(3), NOW(3)),
    (?, ?, ?, ?, 'PENDING', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
    id = id;
```

A operação deve ser segura para retry.

Se a mesma venda for enviada novamente para inserção:

- a constraint única impede duplicidade;
- o `ON DUPLICATE KEY UPDATE id = id` evita erro de duplicidade;
- a execução pode finalizar com sucesso.

## 13.7. Casos de resultado

### Nenhuma candidata recebida

Esse caso não deve ocorrer se o Child Workflow respeitar o retorno da activity de busca.

Se ocorrer, a activity deve concluir com sucesso sem executar insert.

### Todas as candidatas já existem

A activity deve concluir com sucesso.

### Algumas candidatas são novas e outras já existem

A activity deve inserir as novas, ignorar as existentes e concluir com sucesso.

### Todas as candidatas são novas

A activity deve inserir todas e concluir com sucesso.

---

# 14. Fluxo completo

```text
Schedule diário às 03:00
  ↓
Parent Workflow: fetchCustomerNfeSalesCandidates
  ↓
Activity: loadNfeEmailDispatchCustomers
  ↓
Se não houver clientes:
    finalizar Parent Workflow com sucesso
  ↓
Se houver clientes:
    iniciar Child Workflows por cliente
    com no máximo 5 em paralelo
  ↓
Para cada Child Workflow:
    calcular effectiveStart
    ↓
    Activity: fetchCustomerNfeSalesCandidatesFromErp
    ↓
    Se não houver vendas:
        finalizar Child Workflow com sucesso
    ↓
    Se houver vendas:
        Activity: enqueueNfeEmailDispatchSales
    ↓
    finalizar Child Workflow
  ↓
Parent Workflow consolida os resultados
  ↓
Finalizar Parent Workflow
```

---

# 15. Políticas de erro e retry

As activities devem classificar erros em duas categorias:

```text
PERMANENT
TRANSIENT
```

---

## 15.1. Erro permanente

Erro permanente é aquele que não tende a ser resolvido por nova tentativa automática.

Exemplos:

```text
SQL inválido
tabela inexistente
coluna inexistente
erro de permissão
erro de constraint inesperado
mapeamento inválido de payload
cliente sem identificação válida
estrutura de retorno incompatível
```

Comportamento:

```text
Não executar retry.
Falhar a activity.
Falhar o Child Workflow do cliente.
```

---

## 15.2. Erro transitório

Erro transitório é aquele que pode ser resolvido com nova tentativa.

Exemplos:

```text
timeout de conexão
conexão perdida
deadlock
lock wait timeout
erro temporário de rede
banco temporariamente indisponível
pool de conexões esgotado
```

Comportamento:

```text
Executar até 3 tentativas totais.
Usar intervalos espaçados.
Se falhar na terceira tentativa, falhar a activity definitivamente.
Falhar o Child Workflow do cliente.
```

Política sugerida:

```text
maximumAttempts = 3
initialInterval = 1 minuto
backoffCoefficient = 2
maximumInterval = 5 minutos
```

Exemplo:

```text
Tentativa 1: imediata
Tentativa 2: após 1 minuto
Tentativa 3: após 2 minutos
```

---

# 16. Política de falha do Parent Workflow

O Parent Workflow deve aguardar a conclusão dos Child Workflows.

A recomendação para esta versão é:

```text
Falha de um Child Workflow não deve interromper imediatamente os demais Child Workflows já em execução.
```

O Parent Workflow deve consolidar os resultados ao final.

## Resultado com sucesso total

Ocorre quando todos os clientes foram processados com sucesso.

```text
Parent Workflow finaliza com sucesso.
```

## Resultado com falha parcial

Ocorre quando um ou mais clientes falham, mas outros clientes são processados com sucesso.

Recomendação:

```text
Parent Workflow deve finalizar com falha controlada ou status operacional de PARTIAL_FAILURE,
incluindo no resultado a lista de clientes que falharam.
```

A escolha entre falhar tecnicamente o Parent Workflow ou finalizar com sucesso contendo resumo de falhas deve ser definida na implementação de observabilidade.

Para fins operacionais, o resultado consolidado deve conter:

```ts
type FetchCustomerNfeSalesCandidatesSummary = {
  totalCustomers: number;
  successCustomers: number;
  failedCustomers: number;
  totalFoundSales: number;
  totalQueuedSales: number;
  failedCustomerIds: number[];
};
```

---

# 17. Comportamento esperado por etapa

## 17.1. Activity do Parent

### 0 clientes encontrados

```text
Parent Workflow finaliza com sucesso.
```

### Clientes encontrados

```text
Parent Workflow inicia Child Workflows com paralelismo máximo de 5.
```

### Erro permanente

```text
Sem retry.
Parent Workflow falha.
```

### Erro transitório

```text
Retry até 3 tentativas totais.
Se não resolver, Parent Workflow falha.
```

---

## 17.2. Activity de busca do Child

### 0 vendas encontradas para o cliente

```text
Child Workflow finaliza com sucesso.
```

### Vendas encontradas para o cliente

```text
Child Workflow avança para activity de inserção.
```

### Erro permanente

```text
Sem retry.
Child Workflow falha.
```

### Erro transitório

```text
Retry até 3 tentativas totais.
Se não resolver, Child Workflow falha.
```

---

## 17.3. Activity de inserção do Child

### Candidatas recebidas

Executa insert idempotente.

### Duplicidade

```text
Não é erro.
A venda já existente deve ser ignorada.
```

### Erro permanente

```text
Sem retry.
Child Workflow falha.
```

### Erro transitório

```text
Retry até 3 tentativas totais.
Se não resolver, Child Workflow falha.
```

---

# 18. Considerações sobre falha parcial

A activity `enqueueNfeEmailDispatchSales` deve ser idempotente para permitir retry seguro.

Exemplo:

```text
A activity recebe vendas 1001, 1002 e 1003.
A primeira tentativa insere 1001 e 1002, mas falha antes de concluir.
A segunda tentativa recebe novamente 1001, 1002 e 1003.
1001 e 1002 são ignoradas pela constraint única.
1003 é inserida.
A activity finaliza com sucesso.
```

Esse comportamento evita duplicidade e permite recuperação automática em caso de falha parcial.

---

# 19. Decisões atuais

```text
Parent Workflow: fetchCustomerNfeSalesCandidates
Child Workflow: fetchSingleCustomerNfeSalesCandidates
Trigger: diário às 03:00
Janela de redescoberta: 15 dias
Processamento: por cliente
Consulta ERP: por cliente
Child Workflow por cliente: utilizado
Paralelismo máximo de Child Workflows: 5
Cursor: não utilizado
NOT IN: não utilizado
Status inicial das vendas: PENDING
Duplicidade: tratada por constraint única
Inserção: idempotente
Retry transitório: até 3 tentativas totais
Erro permanente: sem retry
```