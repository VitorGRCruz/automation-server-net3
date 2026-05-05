# CSAT Child - Buscar cliente no OPA

## Objetivo
Executar a primeira etapa real do child workflow do CSAT após o trigger: localizar o cliente na plataforma de atendimento OPA a partir do `id_cliente` vindo do ERP.

O objetivo desta etapa é recuperar o identificador do cliente no OPA e armazená-lo como `opaIdCliente` para que o workflow possa seguir para a próxima etapa de busca de contato.

## Papel desta etapa no workflow
Esta etapa acontece logo após o registro elegível do trigger entrar no child workflow.

Ela é responsável por:
- chamar a API do OPA no endpoint `/cliente`;
- usar como parâmetro apenas o `idCliente` vindo do ERP;
- validar a consistência do retorno;
- recuperar o valor `_id` do cliente no OPA;
- decidir entre sucesso, falha permanente ou falha terminal após retries transitórios.

## Entrada esperada
A etapa recebe um registro elegível já validado pelo trigger do CSAT.

Contrato mínimo de entrada:

```ts
export type CsatEligibleRecord = {
  idCliente: number;
  idContrato: number;
  idOs: number;
  nomeCliente: string;
  idTicket: number | null;
  idFilial: number;
};
```

O único valor usado para a chamada ao OPA nesta etapa é:
- `idCliente`

## Integração externa
- Serviço: OPA
- Endpoint: `/cliente`
- Método HTTP: definir na integração conforme a API já usada no projeto
- Autenticação: seguir padrão da integração OPA já adotado no projeto
- Content-Type esperado na resposta válida: `application/json`

## Payload da requisição
```json
{
  "filter": {
    "id": <id_cliente>
  }
}
```

## Observação crítica da API OPA
Se alguma das chaves do payload estiver digitada errada, a API pode retornar todos os clientes da base.

Por isso, esta etapa deve tratar como falha permanente qualquer resposta que não respeite o comportamento esperado de retornar exatamente um cliente correspondente ao `idCliente` informado.

## Retornos conhecidos da API

### 1. Sucesso com um cliente
Exemplo:
```json
{
  "status": "success",
  "code": 200,
  "data": [
    {
      "_id": "67781792d1dab59b4909f489",
      "id": "30527",
      "id_filial": "3",
      "nome": "CLIENTE TESTE"
    }
  ]
}
```

### 2. Sucesso com lista vazia
Exemplo:
```json
{
  "status": "success",
  "code": 200,
  "data": []
}
```

### 3. Erro JSON estruturado
Exemplo:
```json
{
  "status": "error",
  "code": 400,
  "data": {
    "error": "NO_ARGUMENT_ERROR",
    "message": "Field 'nome' is required"
  },
  "description": "Required arguments not supplied"
}
```

### 4. Retorno HTML de erro
Exemplo: página HTML ou stack trace HTML com `content-type` compatível com `text/html`.

### 5. Retorno HTML da interface do sistema
Exemplo: resposta HTML da página do OPA Suite em vez do JSON da API.

## Regra principal de sucesso
A etapa só será considerada bem sucedida quando:
- a resposta for válida em JSON;
- `data` existir;
- `data` for um array;
- `data` tiver exatamente 1 item;
- o item tiver `_id` preenchido.

Nesse caso:
- recuperar o valor de `_id`;
- armazenar o valor como `opaIdCliente`;
- devolver sucesso para o workflow;
- seguir para a próxima etapa: busca de contato do cliente no OPA.

## Regras de falha funcional
Os seguintes casos devem ser tratados como falha permanente:

### Caso 1 - `data` vazio
Se a resposta for bem sucedida, mas `data` vier vazio:
- tratar como falha permanente;
- atribuir a mensagem final:
  `FALHA NO SERVIDOR AO BUSCAR CLIENTE NO OPA`

### Caso 2 - `data` com mais de um item
Se a resposta for bem sucedida, mas `data` vier com mais de um cliente:
- tratar como falha permanente;
- atribuir a mensagem final:
  `FALHA NO SERVIDOR AO BUSCAR CLIENTE NO OPA`

### Caso 3 - item sem `_id`
Se existir exatamente um item em `data`, mas `_id` estiver ausente, vazio ou inválido:
- tratar como falha permanente;
- atribuir a mensagem final:
  `FALHA NO SERVIDOR AO BUSCAR CLIENTE NO OPA`

### Caso 4 - resposta HTML
Se a resposta vier com `content-type` em `text/html`, ou corpo HTML incompatível com a API esperada:
- tratar como falha permanente;
- atribuir a mensagem final:
  `FALHA NO SERVIDOR AO BUSCAR CLIENTE NO OPA`

### Caso 5 - erro permanente da integração
Se a integração falhar por erro permanente:
- tratar como falha permanente;
- atribuir a mensagem final:
  `FALHA NO SERVIDOR AO BUSCAR CLIENTE NO OPA`

## Política de retry

### Erro transitório
Se ocorrer erro transitório:
- tentar retry até 3 vezes;
- usar intervalos espaçados entre as tentativas;
- se ainda falhar após todas as tentativas, tratar como falha terminal;
- atribuir a mensagem final:
  `FALHA NO SERVIDOR AO BUSCAR CLIENTE NO OPA`

### Erro desconhecido
Nesta etapa, erros desconhecidos devem seguir a mesma política dos transitórios, a menos que a implementação já consiga classificá-los com segurança como permanentes.

## Classificação inicial de erros

### Transitórios
Exemplos:
- timeout;
- falha temporária de rede;
- indisponibilidade momentânea do serviço OPA;
- resposta 502, 503, 504;
- erro momentâneo de DNS ou conexão.

### Permanentes
Exemplos:
- payload inválido;
- chave incorreta no payload;
- resposta HTML do sistema;
- resposta funcional inconsistente com a regra da etapa;
- endpoint inválido;
- autenticação inválida persistente;
- contrato da resposta incompatível com o esperado.

## Saída esperada da etapa
A etapa deve devolver um resultado explícito e didático.

Exemplo de contrato esperado:

```ts
export type FindOpaCustomerResult =
  | {
      status: "success";
      opaIdCliente: string;
    }
  | {
      status: "failed";
      failureType: "permanent" | "terminal";
      eventMessage: "FALHA NO SERVIDOR AO BUSCAR CLIENTE NO OPA";
    };
```

## Mensagem de falha obrigatória
Sempre que esta etapa terminar sem conseguir atribuir `opaIdCliente`, a mensagem que deve ser preservada para etapas posteriores é:

```ts
const CSAT_OPA_CUSTOMER_LOOKUP_FAILURE = "FALHA NO SERVIDOR AO BUSCAR CLIENTE NO OPA";
```

## Próximos caminhos do workflow

### Em caso de sucesso
Se `opaIdCliente` for atribuído com sucesso:
- a próxima etapa será a busca do contato do cliente pela API do OPA.

### Em caso de falha
Se `opaIdCliente` não for atribuído:
- a próxima etapa será uma etapa específica de tratamento de falha;
- essa etapa futura será responsável por encaminhar a ordem de serviço para um setor específico;
- essa etapa ainda não deve ser implementada agora.

## Responsabilidades da implementação

### O workflow deve
- chamar a activity de busca do cliente no OPA;
- reagir ao resultado da etapa;
- seguir para a próxima etapa em caso de sucesso;
- seguir para a trilha de falha em caso de insucesso.

### A activity deve
- montar a requisição;
- chamar a API do OPA;
- validar `content-type` e estrutura do retorno;
- classificar falhas;
- aplicar retry transitório conforme a política definida nesta etapa, se essa política for implementada no nível da activity;
- devolver um resultado claro ao workflow.

## Fora de escopo desta etapa
Esta etapa não deve implementar:
- busca de contato do cliente no OPA;
- envio de mensagem;
- registro final do evento na ordem de serviço;
- etapa de encaminhamento por falha;
- outras integrações além do OPA.

## Resultado esperado desta etapa
Ao final desta etapa, o sistema deve ser capaz de:
- receber um registro elegível do CSAT;
- buscar o cliente correspondente no OPA usando `idCliente`;
- atribuir `opaIdCliente` quando houver correspondência válida;
- classificar corretamente falhas permanentes e transitórias;
- preservar a mensagem de falha padronizada para a trilha posterior do workflow.
