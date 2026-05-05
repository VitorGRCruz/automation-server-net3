# CSAT Child - Buscar contato válido de WhatsApp no OPA

## Objetivo
Localizar um contato válido de WhatsApp do cliente no OPA após o sucesso da etapa de busca do cliente no OPA.

Esta etapa depende do valor `opa_id_cliente`, obtido na etapa anterior.

## Papel desta etapa
Esta etapa é responsável por:
- consultar a API de contatos do OPA usando `opa_id_cliente`;
- localizar exclusivamente o contato do titular;
- priorizar telefone do tipo `Whatsapp`;
- caso não exista ou não seja válido, tentar telefone do tipo `Celular`;
- validar se o número encontrado é utilizável para WhatsApp;
- gravar o número válido em `contato_whatsapp` quando houver sucesso;
- definir o `motivo_falha` correto quando a etapa não puder continuar;
- direcionar o fluxo para a etapa de encaminhamento da OS quando não houver sucesso.

## Dependência de entrada
A etapa recebe como insumo o valor:

```ts
opa_id_cliente: string;
```

Sem esse valor a etapa não pode ser executada.

## Integração externa
- Serviço: OPA
- Endpoint: `contato`
- Método: `GET`

## Payload da requisição
```json
{
  "filter": {
    "cli_emp": "<opa_id_cliente>"
  }
}
```

## Contratos de saída esperados
Esta etapa deve produzir um destes resultados:

### Sucesso
```ts
{
  status: "success";
  contato_whatsapp: string;
}
```

### Falha de negócio / falha terminal da etapa
```ts
{
  status: "failure";
  motivo_falha: string;
}
```

## Regras gerais
- O foco da busca deve ser sempre o contato do titular.
- Apenas o objeto com `classificacao = "titular"` pode ser usado como fonte principal do número.
- A prioridade de busca do número é:
  1. telefone com `tipo = "Whatsapp"`
  2. telefone com `tipo = "Celular"`
- Apenas números válidos para WhatsApp podem ser aceitos.
- Se a etapa não encontrar um número válido, ela não segue para envio de mensagem.
- Em caso de falha, o fluxo deve seguir para a etapa de encaminhamento da OS.

## Cenários de retorno e regras de validação

### Caso 1 - Requisição bem-sucedida com `data` vazio
Exemplo:
```json
{
  "status": "success",
  "code": 200,
  "data": []
}
```

Tratamento:
- não fazer retry;
- tratar como falha definitiva da etapa;
- atribuir o motivo:

```ts
"NENHUM CONTATO ENCONTRADO NO OPA"
```

- seguir para a etapa de encaminhar OS.

### Caso 2 - Retorno com `content-type: text/html`
Tratamento:
- tratar como falha permanente;
- não fazer retry;
- atribuir o motivo:

```ts
"FALHA AO BUSCAR CONTATO DO CLIENTE NO OPA"
```

- seguir para a etapa de encaminhar OS.

### Caso 3 - Requisição bem-sucedida com registros em `data`
Quando houver registros em `data`, a implementação deve seguir a sequência abaixo.

#### Validação 3.1 - Localizar o titular
Procurar dentro de `data` um objeto com:

```ts
classificacao === "titular"
```

Se não existir objeto titular:
- tratar como falha definitiva;
- atribuir o motivo:

```ts
"CONTATO DO TITULAR NÃO ENCONTRADO NO OPA"
```

- seguir para a etapa de encaminhar OS.

#### Validação 3.2 - Verificar `fones` do titular
Se existir o objeto titular, verificar o campo `fones`.

Se `fones` não existir, estiver vazio ou não vier preenchido:
- tratar como falha permanente;
- atribuir o motivo:

```ts
"NENHUM CONTATO DO TITULAR REGISTRADO NO OPA"
```

- seguir para a etapa de encaminhar OS.

#### Validação 3.3 - Procurar telefone do tipo `Whatsapp`
Se houver registros em `fones`, primeiro procurar um telefone com:

```ts
tipo === "Whatsapp"
```

Se existir e o valor de `numero` for válido para WhatsApp:
- gravar o valor em:

```ts
contato_whatsapp
```

- considerar a etapa concluída com sucesso;
- seguir para a task 14.

Se existir, mas o número não for válido, não concluir ainda; seguir para a busca por `Celular`.

#### Validação 3.4 - Procurar telefone do tipo `Celular`
Se não existir telefone do tipo `Whatsapp` válido, procurar um telefone com:

```ts
tipo === "Celular"
```

Se existir e o número for válido para WhatsApp:
- gravar o valor em:

```ts
contato_whatsapp
```

- considerar a etapa concluída com sucesso;
- seguir para a task 14.

#### Validação 3.5 - Nenhum telefone utilizável
Se não existir telefone do tipo `Whatsapp` nem telefone do tipo `Celular`:
- tratar como erro terminal;
- atribuir o motivo:

```ts
"O TITULAR NÃO POSSUI CONTATO PARA WHATSAPP NO OPA"
```

- seguir para a etapa de encaminhar OS.

#### Validação 3.6 - Telefone existe, mas não é válido para WhatsApp
Se existir telefone do tipo `Celular`, mas o número não for válido para WhatsApp:
- tratar como erro terminal;
- atribuir o motivo:

```ts
"O TITULAR NÃO POSSUI WHATSAPP VÁLIDO NO OPA"
```

- seguir para a etapa de encaminhar OS.

## Regra geral de sucesso
A etapa só é considerada concluída com sucesso quando:
- um número válido for encontrado; e
- esse número for salvo em `contato_whatsapp`.

## Tratamento de falhas da requisição à API do OPA

### Erro permanente
Se a requisição apresentar erro permanente:
- não fazer retry;
- tratar como erro terminal;
- atribuir o motivo:

```ts
"FALHA NO SERVIDOR AO BUSCAR CONTATO DO CLIENTE"
```

- seguir para a etapa de encaminhar OS.

### Erro transitório
Se a requisição apresentar erro transitório:
- tentar retry até 3 vezes com espaçamento entre as tentativas;
- se ainda falhar após as 3 tentativas, tratar como erro terminal;
- atribuir o motivo:

```ts
"FALHA NO SERVIDOR AO BUSCAR CONTATO DO CLIENTE"
```

- seguir para a etapa de encaminhar OS.

## Classificação inicial de falhas

### Falhas de negócio / sem retry
- `data` vazio;
- ausência de titular;
- ausência de `fones` do titular;
- ausência total de telefone `Whatsapp` e `Celular`;
- telefone encontrado mas inválido para WhatsApp.

### Falhas permanentes / sem retry
- resposta `text/html`;
- erro estrutural da API do OPA;
- payload inválido;
- integração malformada;
- resposta incompatível com o contrato esperado.

### Falhas transitórias / com retry
- timeout;
- falha temporária de conexão;
- indisponibilidade momentânea do serviço;
- erros de rede;
- qualquer falha temporária claramente recuperável.

## Responsabilidades da implementação

### O workflow deve
- chamar a activity de busca de contato;
- decidir entre seguir para o disparo da mensagem ou seguir para o encaminhamento da OS;
- manter apenas a orquestração;
- não conter parsing técnico da resposta do OPA.

### A activity deve
- chamar a API do OPA;
- validar o retorno;
- localizar o titular;
- aplicar a prioridade `Whatsapp` -> `Celular`;
- validar o número para uso em WhatsApp;
- devolver sucesso com `contato_whatsapp` ou falha com `motivo_falha`.

## Fora de escopo desta etapa
Esta etapa não deve implementar:
- envio da mensagem no WhatsApp;
- registro final na OS;
- lógica completa da task 13;
- detalhes do disparo da task 14.

## Resultado esperado desta etapa
Ao final desta etapa, o sistema deve ser capaz de:
- consultar contatos do cliente no OPA usando `opa_id_cliente`;
- localizar o contato do titular;
- escolher corretamente um número válido para WhatsApp;
- salvar esse número em `contato_whatsapp`;
- ou, em caso de falha, produzir um `motivo_falha` correto para a etapa de encaminhamento da OS.
