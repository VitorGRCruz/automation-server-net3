# Task 14 - Implementar envio de mensagem de WhatsApp via IXC OmniChannel

## Objetivo
Implementar a etapa do child workflow de CSAT responsável por enviar a mensagem inicial de pesquisa de satisfação ao cliente usando a API do IXC, via recurso OmniChannel.

## Leitura obrigatória antes de codar
- docs/README.md
- docs/PROJECT_RULES.md
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/ARCHITECTURE.md
- docs/TEMPORAL_RULES.md
- docs/INTEGRATIONS_RULES.md
- docs/ERROR_CLASSIFICATION.md
- docs/specs/csat-find-whatsapp-contact-in-opa.md
- docs/specs/csat-forward-os-on-failure.md
- docs/specs/csat-send-whatsapp-message-via-ixc.md

## Escopo permitido
O agente pode alterar apenas:
- src/temporal/workflows/csat/**
- src/temporal/activities/csat/**
- src/integrations/ixc/**
- src/domain/csat/**
- src/domain/shared/**
- src/infra/**
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md

## Não pode
- não implementar a task 15;
- não alterar a lógica já consolidada da task 11 de encaminhar OS;
- não alterar a lógica já consolidada da task 12 de busca de contato no OPA além do necessário para integrar o próximo passo;
- não mover a arquitetura base do projeto;
- não criar abstrações genéricas sem uso real;
- não colocar parsing técnico da resposta do IXC dentro do workflow;
- não alterar rotas HTTP sem necessidade direta desta task.

## Entregáveis obrigatórios

### 1. Contrato tipado de resultado da etapa
Criar um contrato claro para o resultado do envio da mensagem.

Exemplo esperado:
```ts
type SendWhatsappMessageResult =
  | { status: "success" }
  | { status: "failure"; motivoFalha: string };
```

### 2. Activity real de envio via IXC
Criar uma activity para chamar o endpoint `botaoAjax_22282` da API do IXC.

Essa activity deve:
- montar o payload usando `id_cliente` e `contato_whatsapp`;
- chamar a API real do IXC;
- validar o retorno técnico da requisição;
- validar o conteúdo da resposta, especialmente o campo `type`;
- distinguir sucesso técnico de sucesso real;
- devolver sucesso apenas quando o envio tiver sido realmente concluído;
- devolver falha com `motivoFalha` nos demais casos.

### 3. Classificação formal de falhas
A implementação deve distinguir claramente:
- falhas de operação sem retry (`type = error`);
- falhas permanentes sem retry;
- falhas transitórias com retry.

## Motivo de falha obrigatório
A implementação deve usar exatamente este motivo quando aplicável:

- `FALHA NO SERVIDOR AO ENVIAR MENSAGEM AO CLIENTE`

## Regras de implementação

### Workflow
O workflow deve:
- chamar a activity de envio de mensagem;
- seguir para a task 15 se vier sucesso real;
- seguir para a etapa de encaminhamento da OS se vier falha com `motivoFalha`;
- permanecer simples e legível.

O workflow não deve:
- interpretar o payload bruto da API do IXC;
- conter lógica de classificação técnica de erro;
- conter lógica técnica de proteção contra duplicidade.

### Activity
A activity deve conter:
- montagem do payload;
- chamada real ao IXC;
- análise da resposta técnica;
- análise do campo `type`;
- classificação de falhas;
- retry somente para falhas transitórias;
- mecanismo de proteção contra duplicidade de envio.

## Regras de retry

### Falhas sem retry
Não deve haver retry quando ocorrer:
- resposta com `type = error`;
- erro permanente da requisição;
- qualquer cenário em que a API responda tecnicamente, mas indique falha real da operação.

### Falhas com retry
Deve haver retry com espaçamento entre tentativas, até 3 vezes, quando ocorrer:
- erro transitório de comunicação com o IXC;
- timeout;
- falha temporária de rede;
- indisponibilidade temporária do serviço.

Se ainda falhar após as 3 tentativas:
- tratar como erro terminal;
- devolver o motivo:

```ts
"FALHA NO SERVIDOR AO ENVIAR MENSAGEM AO CLIENTE"
```

## Regra obrigatória de idempotência
Esta task exige proteção contra duplicidade de envio.

A implementação deve ser cuidadosa para que retries não provoquem o envio duplicado da mesma mensagem ao mesmo cliente.

A solução escolhida deve respeitar a arquitetura atual do projeto e manter o workflow limpo. A proteção deve ficar encapsulada no ponto técnico mais apropriado, preferencialmente activity/integração.

## Critérios de aceite
A task será considerada pronta se:

- existir activity real de envio via IXC OmniChannel;
- o payload usar corretamente `id_cliente` e `contato_whatsapp`;
- a activity validar o campo `type` da resposta;
- apenas sucesso real seja tratado como sucesso da etapa;
- falhas retornem `motivoFalha` correto;
- retries ocorram apenas para erros transitórios;
- exista proteção contra duplicidade de envio;
- o workflow decida corretamente entre task 15 e etapa de encaminhamento da OS;
- `pnpm typecheck` passar;
- `pnpm lint` passar;
- não haja lógica técnica do IXC dentro do workflow.

## Validação esperada
Executar localmente cenários em que:
- a API responde tecnicamente, mas retorna `type = error`;
- a API apresenta erro permanente;
- a API apresenta erro transitório simulado/classificado;
- a API retorna sucesso real;
- retries transitórios não geram envio duplicado.

## Atualização de documentação ao final
Ao concluir a task, atualizar:
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md

Marcar a Task 14 como concluída apenas se todos os critérios de aceite forem atendidos.
