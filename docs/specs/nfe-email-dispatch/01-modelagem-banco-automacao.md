# NF-e Email Dispatch — modelagem do banco da automação

> Documento consolidado a partir da especificação anexada ao projeto.
> Em caso de conflito com a task ativa, seguir a task ativa e registrar a decisão em `docs/CURRENT_STATE.md`.

---

# Especificação da Modelagem — Workflow de Envio Automático de NF-e por E-mail

Este documento descreve a modelagem das tabelas do banco da automação responsáveis por controlar clientes participantes do envio automático de NF-e e as vendas descobertas para processamento.

A modelagem foi pensada para os seguintes objetivos:

- permitir redescoberta periódica de vendas no ERP sem duplicidade;
- evitar uso de cursor rígido;
- permitir reprocessamento controlado;
- manter integridade referencial entre cliente e vendas;
- suportar os workflows de descoberta e processamento de envio.

---

## 1. Tabela `nfe_email_dispatch_customer`

### Finalidade

A tabela `nfe_email_dispatch_customer` representa os clientes habilitados para participar do fluxo automático de envio de NF-e por e-mail.

A existência de um cliente nessa tabela significa que ele está elegível para a automação. Caso o cliente seja removido da tabela, ele deixa de participar do processo, e as vendas associadas a ele também são removidas por regra de cascata na tabela de vendas.

Essa tabela é usada principalmente pelo **Workflow 1**, responsável por descobrir vendas com NF-e emitida no ERP e registrá-las como pendentes de envio.

### DDL

```sql
CREATE TABLE nfe_email_dispatch_customer (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    erp_customer_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uk_nfe_email_dispatch_customer__erp_customer_id (erp_customer_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
```

### Campos

#### `id`

Identificador interno do cliente dentro do banco da automação.

Esse campo não representa o cliente no ERP. Ele existe para ser a chave primária local e para ser usado como referência pela tabela de vendas da automação.

#### `erp_customer_id`

Identificador do cliente no ERP.

Esse é o campo usado para cruzar os dados entre:

- banco da automação;
- banco do ERP;
- API do ERP.

A constraint `UNIQUE` garante que o mesmo cliente do ERP não seja cadastrado mais de uma vez na automação.

```sql
UNIQUE KEY uk_nfe_email_dispatch_customer__erp_customer_id (erp_customer_id)
```

#### `created_at`

Data e hora em que o cliente entrou na automação.

Esse campo tem importância funcional, não apenas de auditoria.

No **Workflow 1**, ele é usado como corte mínimo para buscar vendas no ERP. A regra é:

> uma venda só pode ser considerada elegível se a emissão da NF-e for igual ou posterior à data em que o cliente foi cadastrado na automação.

Isso evita que, ao cadastrar ou reinserir um cliente, o sistema envie notas antigas que não deveriam fazer parte do processo automático.

### Regras aplicadas

#### Cliente único por ERP

A constraint abaixo impede duplicidade de cadastro do mesmo cliente:

```sql
UNIQUE KEY uk_nfe_email_dispatch_customer__erp_customer_id (erp_customer_id)
```

Isso garante que um `erp_customer_id` tenha apenas um registro ativo na automação.

#### Remoção do cliente encerra sua participação

A tabela de vendas referencia essa tabela com `ON DELETE CASCADE`.

Na prática, isso significa:

> se um cliente for removido da automação, todas as vendas/jobs associados a ele também serão removidos.

Essa regra combina com a decisão de negócio de não manter clientes inativos no sistema.

---

## 2. Tabela `nfe_email_dispatch_sale`

### Finalidade

A tabela `nfe_email_dispatch_sale` representa as vendas do ERP que foram descobertas pela automação e entraram no fluxo de envio de NF-e por e-mail.

Cada registro dessa tabela é um **job de envio**.

Essa tabela é usada pelos dois workflows:

- **Workflow 1:** descobre vendas no ERP e insere registros com status `PENDING`;
- **Workflow 2:** processa os registros pendentes, envia o e-mail e atualiza o status final.

### DDL

```sql
CREATE TABLE nfe_email_dispatch_sale (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nfe_email_dispatch_customer_id BIGINT UNSIGNED NOT NULL,

    erp_sale_id BIGINT UNSIGNED NOT NULL,
    erp_invoice_key VARCHAR(64) NULL,
    erp_invoice_emitted_at DATETIME(3) NOT NULL,

    status ENUM(
        'PENDING',
        'IN_PROGRESS',
        'SENT',
        'FAILED_TRANSIENT',
        'FAILED_FINAL',
        'DELIVERY_UNKNOWN'
    ) NOT NULL DEFAULT 'PENDING',

    attempt_count INT UNSIGNED NOT NULL DEFAULT 0,

    last_attempt_at DATETIME(3) NULL,
    sent_at DATETIME(3) NULL,

    last_error_message TEXT NULL,

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),

    CONSTRAINT fk_nfe_email_dispatch_sale__customer
        FOREIGN KEY (nfe_email_dispatch_customer_id)
        REFERENCES nfe_email_dispatch_customer (id)
        ON DELETE CASCADE
        ON UPDATE RESTRICT,

    UNIQUE KEY uk_nfe_email_dispatch_sale__customer_sale
        (nfe_email_dispatch_customer_id, erp_sale_id),

    KEY idx_nfe_email_dispatch_sale__status
        (status),

    KEY idx_nfe_email_dispatch_sale__customer_emitted_at
        (nfe_email_dispatch_customer_id, erp_invoice_emitted_at),

    KEY idx_nfe_email_dispatch_sale__invoice_key
        (erp_invoice_key),

    CONSTRAINT chk_nfe_email_dispatch_sale__in_progress_requires_attempt
        CHECK (
            status <> 'IN_PROGRESS'
            OR last_attempt_at IS NOT NULL
        ),

    CONSTRAINT chk_nfe_email_dispatch_sale__sent_requires_sent_at
        CHECK (
            (status = 'SENT' AND sent_at IS NOT NULL)
            OR
            (status <> 'SENT' AND sent_at IS NULL)
        )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
```

### Campos

#### `id`

Identificador interno do job de envio no banco da automação.

É a chave primária da tabela.

#### `nfe_email_dispatch_customer_id`

Referência ao cliente cadastrado na automação.

Esse campo liga a venda ao cliente local da automação, não diretamente ao ID do ERP.

A foreign key garante que uma venda só exista se houver um cliente correspondente cadastrado na automação.

```sql
FOREIGN KEY (nfe_email_dispatch_customer_id)
REFERENCES nfe_email_dispatch_customer (id)
ON DELETE CASCADE
ON UPDATE RESTRICT
```

#### `erp_sale_id`

Identificador da venda no ERP.

Esse é o principal identificador operacional da venda dentro do fluxo.

Ele é usado para:

- evitar duplicidade;
- buscar o documento fiscal na API do ERP;
- relacionar o envio com a venda original.

#### `erp_invoice_key`

Chave ou identificador da NF-e no ERP, quando disponível.

Esse campo ajuda em rastreabilidade e auditoria, mas neste modelo ele **não é usado como chave única**.

A decisão atual da modelagem é tratar a venda como a entidade principal do envio. Por isso, a unicidade está em:

```sql
(nfe_email_dispatch_customer_id, erp_sale_id)
```

e não em `erp_invoice_key`.

#### `erp_invoice_emitted_at`

Data e hora de emissão da NF-e no ERP.

Esse campo é usado para:

- registrar quando a nota foi emitida;
- apoiar consultas por cliente e período;
- validar se a nota pertence à janela de descoberta do Workflow 1.

No fluxo atual, o Workflow 1 deve buscar vendas dentro de uma janela de tempo e também respeitar a data de cadastro do cliente na automação.

#### `status`

Representa o estado atual do job de envio.

Valores permitidos:

```sql
'PENDING',
'IN_PROGRESS',
'SENT',
'FAILED_TRANSIENT',
'FAILED_FINAL',
'DELIVERY_UNKNOWN'
```

O valor padrão é:

```sql
DEFAULT 'PENDING'
```

Isso significa que toda venda recém-descoberta entra inicialmente como pendente de envio.

### Significado dos status

#### `PENDING`

Venda descoberta e registrada na automação, mas ainda não processada pelo Workflow 2.

#### `IN_PROGRESS`

Venda em processamento.

Esse status indica que o Workflow 2 já assumiu o job e está tentando executar o envio.

Pela constraint da tabela, um job só pode estar `IN_PROGRESS` se tiver `last_attempt_at` preenchido.

#### `SENT`

Envio concluído com sucesso.

Quando o status é `SENT`, o campo `sent_at` precisa estar preenchido.

#### `FAILED_TRANSIENT`

Falha temporária.

Representa erros que podem ser tentados novamente, como:

- indisponibilidade temporária do SMTP;
- timeout na API do ERP;
- erro momentâneo de rede.

#### `FAILED_FINAL`

Falha definitiva.

Representa erros que não devem ser retentados automaticamente, como:

- cliente sem e-mail válido;
- documento fiscal inválido;
- inconsistência de dados que exige intervenção manual.

#### `DELIVERY_UNKNOWN`

Estado ambíguo.

Deve ser usado quando não é possível afirmar com segurança se o e-mail foi ou não enviado.

Exemplo típico:

- o sistema enviou o e-mail via SMTP;
- mas falhou antes de registrar o status final como `SENT`.

Esse status evita reenvio automático em situações com risco de duplicidade.

#### `attempt_count`

Quantidade de tentativas de processamento do job.

Esse valor deve ser incrementado sempre que o Workflow 2 assumir a venda para uma nova tentativa de envio.

#### `last_attempt_at`

Data e hora da última tentativa de processamento.

Esse campo representa o momento em que o Workflow 2 começou a tentar processar o job pela última vez.

Ele é obrigatório quando o status é `IN_PROGRESS`.

#### `sent_at`

Data e hora em que o envio foi concluído com sucesso.

Esse campo só deve ser preenchido quando `status = 'SENT'`.

A constraint da tabela garante essa regra.

#### `last_error_message`

Mensagem descritiva do último erro ocorrido.

Esse campo é usado para diagnóstico operacional em casos de:

- `FAILED_TRANSIENT`;
- `FAILED_FINAL`;
- `DELIVERY_UNKNOWN`.

#### `created_at`

Data e hora em que o job foi criado na automação.

Normalmente corresponde ao momento em que o Workflow 1 descobriu a venda e a registrou como pendente.

#### `updated_at`

Data e hora da última atualização do job.

Esse campo muda automaticamente quando o status ou outro dado operacional do job é atualizado.

Ele é útil para auditoria e acompanhamento operacional.

---

## Regras aplicadas na tabela de vendas

### 1. Venda pertence obrigatoriamente a um cliente da automação

A foreign key garante que não exista venda sem cliente correspondente:

```sql
CONSTRAINT fk_nfe_email_dispatch_sale__customer
FOREIGN KEY (nfe_email_dispatch_customer_id)
REFERENCES nfe_email_dispatch_customer (id)
ON DELETE CASCADE
ON UPDATE RESTRICT
```

Com isso:

- não existe job órfão;
- remover o cliente remove os jobs associados;
- o ID interno do cliente não pode ser alterado se houver vendas vinculadas.

### 2. A mesma venda não pode entrar duas vezes

A constraint abaixo garante idempotência na descoberta:

```sql
UNIQUE KEY uk_nfe_email_dispatch_sale__customer_sale
(nfe_email_dispatch_customer_id, erp_sale_id)
```

Essa regra é fundamental para o Workflow 1.

Como o Workflow 1 trabalha com janela de redescoberta, a mesma venda pode aparecer várias vezes na consulta ao ERP. A unique key garante que ela seja registrada apenas uma vez.

### 3. Status fechado por `ENUM`

O campo `status` só aceita valores previstos no fluxo.

Isso impede estados inválidos, como:

- `PROCESSING`;
- `ERROR`;
- `DONE`;
- `WAITING`.

A aplicação precisa trabalhar com os valores oficiais definidos na modelagem.

### 4. `IN_PROGRESS` exige data de tentativa

A constraint abaixo impede que uma venda fique em processamento sem indicar quando a tentativa começou:

```sql
CONSTRAINT chk_nfe_email_dispatch_sale__in_progress_requires_attempt
CHECK (
    status <> 'IN_PROGRESS'
    OR last_attempt_at IS NOT NULL
)
```

Isso protege a integridade operacional do Workflow 2.

### 5. `SENT` exige `sent_at`, e `sent_at` só existe quando enviado

A constraint abaixo garante consistência entre status e data de envio:

```sql
CONSTRAINT chk_nfe_email_dispatch_sale__sent_requires_sent_at
CHECK (
    (status = 'SENT' AND sent_at IS NOT NULL)
    OR
    (status <> 'SENT' AND sent_at IS NULL)
)
```

Isso evita casos inconsistentes como:

- venda marcada como `SENT` sem data de envio;
- venda com `sent_at` preenchido, mas status diferente de `SENT`.

---

## Índices aplicados

### `idx_nfe_email_dispatch_sale__status`

Usado pelo Workflow 2 para buscar jobs por status, principalmente:

- `PENDING`;
- `FAILED_TRANSIENT`;
- `IN_PROGRESS`.

### `idx_nfe_email_dispatch_sale__customer_emitted_at`

Usado para consultas por cliente e período de emissão da NF-e.

Também ajuda em relatórios e auditorias operacionais.

### `idx_nfe_email_dispatch_sale__invoice_key`

Facilita busca por chave da NF-e.

Embora `erp_invoice_key` não seja único nesse modelo, o índice permite localizar rapidamente uma nota específica quando necessário.

---

## Observação importante

Esse modelo está baseado na regra:

> uma venda do ERP deve gerar no máximo um job de envio automático de NF-e.
