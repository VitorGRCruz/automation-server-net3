# Task 10 - Implementar busca do cliente no OPA no child workflow do CSAT

## Objetivo
Implementar a próxima etapa real do child workflow do CSAT: buscar o cliente na plataforma de atendimento OPA a partir do `idCliente` vindo do ERP e recuperar o valor `_id` como `opaIdCliente`.

## Leitura obrigatória antes de codar
- docs/README.md
- docs/PROJECT_RULES.md
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/ARCHITECTURE.md
- docs/TEMPORAL_RULES.md
- docs/INTEGRATIONS_RULES.md
- docs/ERROR_CLASSIFICATION.md
- docs/FIRST_WORKFLOW_OVERVIEW.md
- docs/specs/csat-child-find-customer-in-opa.md

## Escopo permitido
O agente pode alterar apenas:
- src/temporal/workflows/csat/**
- src/temporal/activities/csat/**
- src/integrations/opa/**
- src/domain/csat/**
- src/domain/shared/**
- src/infra/**
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md

## Não pode
- não implementar busca de contato no OPA
- não implementar envio de mensagem
- não implementar etapa final de gravação na ordem de serviço
- não implementar etapa de encaminhamento por falha
- não alterar a lógica do trigger já concluído sem necessidade direta desta task
- não criar abstrações genéricas sem uso real
- não mover a arquitetura base do projeto
- não colocar parsing técnico de integração dentro do workflow
- não criar arquivos com responsabilidade artificialmente pequena
- não alterar rotas HTTP sem necessidade direta desta task

## Entregáveis obrigatórios

### 1. Contrato tipado do resultado da etapa
Criar um tipo claro para o resultado da busca do cliente no OPA.

Exemplo esperado:

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

### 2. Constante de mensagem de falha
Criar uma constante compartilhada e explícita para o motivo de falha desta etapa:

```ts
export const CSAT_OPA_CUSTOMER_LOOKUP_FAILURE = "FALHA NO SERVIDOR AO BUSCAR CLIENTE NO OPA";
```

### 3. Integração com o endpoint `/cliente` do OPA
Criar ou completar a integração necessária para chamar o OPA usando o payload definido na spec.

Payload obrigatório:

```json
{
  "filter": {
    "id": <id_cliente>
  }
}
```

A integração deve:
- usar `idCliente` do registro elegível;
- validar o tipo da resposta;
- identificar respostas HTML;
- devolver dados adequados para a activity.

### 4. Activity da etapa
Criar a activity responsável por:
- chamar a integração do OPA;
- validar o retorno;
- garantir que `data` tenha exatamente 1 item;
- garantir que `_id` exista;
- classificar falhas permanentes e transitórias;
- aplicar retry de erro transitório até 3 vezes com intervalos espaçados, se essa política estiver centralizada na activity;
- devolver resultado claro ao workflow.

## Observação importante
Se a implementação do projeto já centraliza retry na configuração da activity, o código deve seguir esse padrão existente, desde que respeite a política desta etapa.

### 5. Ajuste do child workflow do CSAT
O child workflow deve:
- chamar a activity de busca do cliente no OPA;
- em caso de sucesso, preservar `opaIdCliente` para a próxima etapa;
- em caso de falha, encerrar a etapa atual com o motivo padronizado preservado para a futura trilha de encaminhamento;
- manter a orquestração simples e didática.

## Regras de implementação

### Workflow
O workflow deve conter apenas:
- decisão de caminho;
- chamada da activity;
- preservação do resultado para a próxima etapa;
- definição do próximo caminho em caso de sucesso ou falha.

Não deve conter:
- construção de payload HTTP;
- validação detalhada do retorno JSON;
- parsing técnico de HTML;
- classificação técnica de erro de integração.

### Activity
A activity deve conter:
- chamada real ao OPA;
- validação do `content-type`;
- validação da estrutura do JSON;
- verificação da quantidade de itens em `data`;
- leitura de `_id`;
- classificação de falhas;
- retry transitório conforme a política definida.

## Casos obrigatórios que precisam ser tratados

### Caso 1 - sucesso com um item válido
- `data` contém exatamente um item;
- `_id` existe e está preenchido;
- retornar `status: "success"` com `opaIdCliente`.

### Caso 2 - sucesso com `data` vazio
- tratar como falha permanente;
- retornar mensagem padronizada.

### Caso 3 - sucesso com múltiplos itens
- tratar como falha permanente;
- retornar mensagem padronizada.

### Caso 4 - item sem `_id`
- tratar como falha permanente;
- retornar mensagem padronizada.

### Caso 5 - resposta HTML
- tratar como falha permanente;
- retornar mensagem padronizada.

### Caso 6 - erro permanente da integração
- tratar como falha permanente;
- retornar mensagem padronizada.

### Caso 7 - erro transitório
- tentar até 3 vezes com espaçamento;
- se falhar após todas as tentativas, tratar como falha terminal;
- retornar mensagem padronizada.

## Critérios de aceite
A task será considerada pronta se:
- existir integração funcional com o endpoint `/cliente` do OPA
- a activity estiver validando corretamente JSON e HTML
- `opaIdCliente` estiver sendo recuperado corretamente a partir de `_id`
- falhas funcionais estiverem sendo tratadas como permanentes
- falhas transitórias estiverem respeitando a política de retry
- o child workflow permanecer simples, legível e sem poluição técnica
- `pnpm typecheck` passar
- `pnpm lint` passar
- a mensagem de falha padronizada estiver preservada para uso em etapa posterior

## Validação esperada
Executar localmente cenários em que:
- a API retorna exatamente um cliente válido
- a API retorna `data: []`
- a API retorna múltiplos clientes
- a API retorna HTML
- a API retorna erro permanente
- a API retorna erro transitório simulável

## Atualização de documentação ao final
Ao concluir a task, atualizar:
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md

Marcar a Task 10 como concluída apenas se todos os critérios de aceite forem atendidos.
