# CSAT Child - Enviar mensagem de WhatsApp via IXC OmniChannel

## Objetivo
Enviar a mensagem inicial da pesquisa de satisfação ao cliente usando a API do IXC, por meio do recurso OmniChannel.

Esta etapa só pode ser executada após o sucesso da etapa de localização do contato do cliente no OPA.

## Papel desta etapa
Esta etapa é responsável por:
- acionar a API do IXC no endpoint de envio OmniChannel;
- usar o `id_cliente` vindo do trigger e o `contato_whatsapp` validado na task anterior;
- validar não apenas o sucesso técnico da requisição, mas também o sucesso real da operação;
- identificar falhas de operação mesmo quando a resposta HTTP estiver tecnicamente bem-sucedida;
- proteger o fluxo contra duplicidade de envio em cenários de retry;
- definir o `motivo_falha` correto quando o envio não puder ser concluído;
- direcionar o fluxo para a etapa de encaminhamento da OS quando não houver sucesso real;
- seguir para a task 15 somente em caso de sucesso real no envio da mensagem.

## Dependências de entrada
A etapa recebe como insumos:

```ts
id_cliente: number;
contato_whatsapp: string;
```

Sem esses valores a etapa não pode ser executada corretamente.

## Integração externa
- Serviço: IXC
- Endpoint: `botaoAjax_22282`
- Método: `POST`

## Payload da requisição
```json
{
  "tipo_envio_mensagem": "omnichannel",
  "celular": "<contato_whatsapp>",
  "id_cliente": "<id_cliente>",
  "msg_omnichannel": "16"
}
```

## Origem dos dados do payload
- `id_cliente`: vem do registro retornado pelo trigger;
- `contato_whatsapp`: vem da task anterior, após busca e validação do contato do cliente no OPA.

## Contratos de saída esperados
Esta etapa deve produzir um destes resultados:

### Sucesso
```ts
{
  status: "success";
}
```

### Falha terminal da etapa
```ts
{
  status: "failure";
  motivo_falha: string;
}
```

## Regra geral de validação do sucesso
A etapa não pode considerar apenas o status HTTP da requisição.

Também é obrigatório validar o conteúdo da resposta, especialmente o campo:

```ts
type
```

A task 14 só é considerada concluída com sucesso quando:
- a requisição é concluída com sucesso técnico; e
- a resposta indica sucesso real da operação.

## Motivo de falha obrigatório
Sempre que o envio não puder ser concluído com sucesso real, a etapa deve registrar exatamente o motivo:

```ts
"FALHA NO SERVIDOR AO ENVIAR MENSAGEM AO CLIENTE"
```

## Cenários de retorno e regras de tratamento

### Caso 1 - Requisição bem-sucedida, mas operação falhou (`type = error`)
Exemplo:
```json
{
  "type": "error",
  "message": "Este número de Whatsapp não é válido!"
}
```

Tratamento:
- não fazer retry;
- tratar como erro terminal da etapa;
- atribuir o motivo:

```ts
"FALHA NO SERVIDOR AO ENVIAR MENSAGEM AO CLIENTE"
```

- seguir para a etapa de encaminhar a OS;
- encerrar este ciclo do workflow.

### Caso 2 - Erro permanente na requisição
Se a chamada apresentar erro permanente:
- não fazer retry;
- tratar como erro terminal;
- atribuir o motivo:

```ts
"FALHA NO SERVIDOR AO ENVIAR MENSAGEM AO CLIENTE"
```

- seguir para a etapa de encaminhar a OS;
- encerrar este ciclo do workflow.

### Caso 3 - Erro transitório na requisição
Se a chamada apresentar erro transitório:
- fazer até 3 tentativas de retry com espaçamento entre elas;
- aplicar proteção contra duplicidade de envio;
- garantir que o mesmo envio não seja disparado mais de uma vez por engano durante os retries.

Se ainda falhar após as 3 tentativas:
- tratar como erro terminal;
- atribuir o motivo:

```ts
"FALHA NO SERVIDOR AO ENVIAR MENSAGEM AO CLIENTE"
```

- seguir para a etapa de encaminhar a OS;
- encerrar este ciclo do workflow.

### Caso 4 - Sucesso real
Se a resposta indicar sucesso real da operação:
- considerar a task 14 concluída com sucesso;
- não gerar `motivo_falha`;
- seguir para a task 15, que será responsável por registrar o evento no histórico da OS.

## Regras de segurança e idempotência
Esta etapa exige cuidado especial com duplicidade de envio.

A implementação deve adotar proteção para evitar que retries ou reexecuções provoquem o envio duplicado da mesma mensagem ao mesmo cliente.

A estratégia concreta pode variar conforme a arquitetura atual do projeto, mas a implementação deve obedecer a estas regras:
- retries não podem disparar duplicidade por descuido;
- a lógica deve ser segura mesmo em caso de falha transitória;
- o workflow deve permanecer simples, deixando a proteção técnica encapsulada em activity/integração quando possível.

## Responsabilidades da implementação

### O workflow deve:
- chamar a activity responsável pelo envio da mensagem;
- decidir entre seguir para a task 15 ou para a etapa de encaminhar OS;
- manter a orquestração simples e legível;
- não conter parsing técnico da resposta do IXC.

### A activity deve:
- montar o payload com os dados recebidos;
- chamar a API real do IXC;
- analisar a resposta técnica e o conteúdo retornado;
- validar o campo `type`;
- classificar falhas como transitórias ou permanentes;
- aplicar os retries permitidos para falhas transitórias;
- tratar a proteção contra duplicidade de envio.

## Fora de escopo desta etapa
Esta etapa não deve implementar:
- a etapa de encaminhar OS por falha;
- o registro do evento final de sucesso na OS;
- regras de negócio de outros workflows fora do envio inicial de CSAT.

## Resultado esperado desta etapa
Ao final desta etapa, o sistema deve ser capaz de:
- enviar a mensagem inicial de CSAT via IXC OmniChannel;
- distinguir sucesso técnico de sucesso real;
- encerrar corretamente o ciclo em caso de falha;
- evitar duplicidade indevida durante retries;
- seguir para a task 15 apenas quando a mensagem tiver sido enviada com sucesso real.
