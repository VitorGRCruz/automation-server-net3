# Task 11 - Implementar etapa reutilizável de encaminhamento da OS por falha no CSAT

## Objetivo
Implementar a etapa reutilizável do módulo CSAT responsável por encaminhar a ordem de serviço para outro setor no ERP, via API do IXC, quando uma etapa anterior falhar e o workflow não puder continuar naturalmente.

A primeira integração concreta desta etapa deve atender o caso de falha ao buscar `opaIdCliente`, mas a implementação deve ser preparada para reutilização em outras falhas do mesmo workflow e em outros workflows do módulo CSAT.

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
- docs/specs/csat-forward-os-on-failure.md
- docs/specs/csat-child-find-customer-in-opa.md

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
- não implementar busca de contato no OPA
- não implementar envio de mensagem
- não alterar a regra do trigger já concluído sem necessidade direta desta task
- não remover a etapa anterior de busca do cliente no OPA
- não criar abstrações genéricas sem uso real
- não mover a arquitetura base do projeto
- não colocar parsing técnico de integração dentro do workflow
- não criar arquivos com responsabilidade artificialmente pequena
- não alterar rotas HTTP sem necessidade direta desta task
- não inventar uma etapa posterior, porque o sucesso desta etapa encerra o ciclo

## Entregáveis obrigatórios

### 1. Contrato tipado de entrada reutilizável
Criar um tipo explícito para a entrada da etapa.

Exemplo esperado:

```ts
export type ForwardServiceOrderOnFailureInput = {
  idOs: number;
  failureMessage: string;
};
```

### 2. Contrato tipado de saída reutilizável
Criar um tipo explícito para o resultado da etapa.

Exemplo esperado:

```ts
export type ForwardServiceOrderOnFailureResult =
  | {
      status: "success";
      forwardedToSectorId: "35";
    }
  | {
      status: "failed";
      failureType: "terminal";
      shouldBeRetriedByNextTrigger: true;
    };
```

### 3. Integração com o endpoint `su_oss_chamado_alterar_setor` do IXC
Criar ou completar a integração necessária para chamar a API do IXC com o payload definido na spec.

Payload obrigatório:

```json
{
  "id_chamado": "<id_os>",
  "id_setor": "35",
  "mensagem": "<motivo_falha>",
  "status": "EN"
}
```

A integração deve:
- usar `idOs` e `failureMessage` vindos do workflow;
- validar o tipo da resposta;
- identificar respostas HTML;
- distinguir sucesso real de erro funcional em HTTP 200;
- devolver dados adequados para a activity.

### 4. Activity reutilizável da etapa
Criar a activity responsável por:
- chamar a integração do IXC;
- validar `content-type`;
- validar a estrutura do JSON;
- analisar o campo `type`;
- tratar `type = success` como sucesso real;
- tratar `type = error` como falha terminal sem retry;
- classificar erros permanentes e transitórios;
- aplicar retry apenas para erro transitório até 3 vezes com intervalos espaçados, se essa política estiver centralizada na activity;
- devolver resultado claro e reutilizável ao workflow.

## Observação importante
Se a implementação do projeto já centraliza retry na configuração da activity, o código deve seguir esse padrão existente, desde que respeite a política desta etapa.

### 5. Ajuste do child workflow do CSAT
O child workflow atual deve:
- chamar a etapa de encaminhamento quando a busca de `opaIdCliente` falhar;
- passar `idOs` e o motivo padronizado da falha;
- concluir com sucesso funcional quando o encaminhamento da OS der certo;
- encerrar com erro terminal quando a etapa de encaminhamento falhar.

## Regras de implementação

### Workflow
O workflow deve conter apenas:
- decisão de caminho;
- chamada da activity de encaminhamento;
- uso do motivo de falha vindo da etapa anterior;
- conclusão do ciclo em caso de sucesso;
- encerramento terminal em caso de falha da própria etapa de encaminhamento.

Não deve conter:
- construção de payload HTTP;
- validação detalhada do retorno JSON;
- parsing técnico de HTML;
- classificação técnica de erro de integração.

### Activity
A activity deve conter:
- chamada real ao IXC;
- validação do `content-type`;
- validação da estrutura do JSON;
- análise do campo `type`;
- classificação de falhas;
- retry transitório conforme a política definida;
- cuidado explícito com idempotência.

## Casos obrigatórios que precisam ser tratados

### Caso 1 - sucesso real
- a resposta é JSON válida;
- `type = success`;
- considerar que a OS foi encaminhada com sucesso;
- concluir o child workflow sem etapa posterior.

### Caso 2 - erro funcional em HTTP 200
- a resposta é JSON válida;
- `type = error`;
- tratar como falha terminal;
- não fazer retry.

### Caso 3 - resposta HTML
- tratar como falha terminal;
- não fazer retry.

### Caso 4 - erro permanente da integração
- tratar como falha terminal;
- não fazer retry.

### Caso 5 - erro transitório
- tentar até 3 vezes com espaçamento;
- tomar cuidado com idempotência;
- se falhar após todas as tentativas, tratar como falha terminal.

## Requisito especial de idempotência
Esta task precisa tratar com bastante cuidado o risco de duplicidade.

Como a etapa altera o ERP, o retry transitório não pode abrir espaço para execução duplicada sem controle.

A solução adotada deve:
- respeitar o modelo do Temporal;
- ser simples e didática;
- priorizar segurança operacional;
- não introduzir complexidade desnecessária além do necessário para evitar conflito.

## Critérios de aceite
A task será considerada pronta se:
- existir integração funcional com o endpoint `su_oss_chamado_alterar_setor` do IXC
- a activity distinguir corretamente `type = success` de `type = error`
- a activity tratar HTML como falha terminal
- falhas funcionais e permanentes não gerarem retry
- falhas transitórias respeitarem a política de retry
- o child workflow usar essa etapa quando a busca de `opaIdCliente` falhar
- a etapa estiver preparada para reutilização futura
- o child workflow permanecer simples, legível e sem poluição técnica
- `pnpm typecheck` passar
- `pnpm lint` passar

## Validação esperada
Executar localmente cenários em que:
- a API retorna `type = success`
- a API retorna `type = error`
- a API retorna HTML
- a integração falha com erro permanente
- a integração falha com erro transitório simulável
- a falha na busca de `opaIdCliente` redireciona para esta etapa corretamente

## Atualização de documentação ao final
Ao concluir a task, atualizar:
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md

Marcar a Task 11 como concluída apenas se todos os critérios de aceite forem atendidos.
