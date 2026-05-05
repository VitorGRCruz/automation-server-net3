# Task 22 - Controlar o fan-out do trigger do CSAT

## Objetivo
Endurecer a fase de fan-out do workflow pai do CSAT, substituindo a inicialização em massa baseada em `Promise.all` por uma estratégia controlada, com tratamento por item, melhor observabilidade e comportamento mais previsível em caso de falha parcial.

## Leitura obrigatória antes de codar
- docs/README.md
- docs/PROJECT_RULES.md
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/ARCHITECTURE.md
- docs/TEMPORAL_RULES.md
- docs/ERROR_CLASSIFICATION.md
- docs/FIRST_WORKFLOW_OVERVIEW.md
- docs/specs/csat-trigger-fan-out-control.md

## Escopo permitido
O agente pode alterar:
- src/temporal/workflows/csat/**
- src/domain/csat/**
- src/domain/shared/**
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/FIRST_WORKFLOW_OVERVIEW.md
- docs/ARCHITECTURE.md

Se houver necessidade técnica muito clara, também pode ajustar pequenos helpers já existentes em:
- src/temporal/workflows/cobrancas/**

Mas apenas se isso for estritamente necessário para reaproveitar padrão já consolidado.

## Não pode
- não alterar a regra de negócio do fluxo do CSAT;
- não reescrever o child workflow do CSAT;
- não trocar o modelo de child workflows por outro modelo de execução;
- não mover integração externa para dentro do workflow;
- não criar nova task queue;
- não adicionar infraestrutura nova para controle de concorrência;
- não transformar esta task em redesign completo do módulo `csat`;
- não alterar APIs HTTP sem necessidade direta desta task;
- não introduzir abstrações genéricas sem uso real.

## Contexto
O workflow pai do CSAT já está funcional e possui a arquitetura correta em alto nível:
- busca elegíveis;
- encerra quando não há itens;
- inicia um child workflow por item;
- mantém o processamento real dentro do child.

O problema atual está no fan-out.
A inicialização dos child workflows ainda usa `Promise.all(...)` diretamente sobre a lista de elegíveis.

Isso é simples, mas frágil do ponto de vista operacional, porque:
- uma falha no `startChild` de um item pode rejeitar o fan-out inteiro;
- parte dos children pode já ter sido iniciada antes da rejeição;
- o resultado agregado da fase fica pouco observável;
- não há contabilidade explícita de sucesso, duplicidade em andamento e falha de início.

O módulo `cobrancas` já possui um padrão melhor para esse ponto, e esta task deve alinhar o CSAT a esse padrão sem expandir o escopo desnecessariamente.

## Entregáveis obrigatórios

### 1. Remover o `Promise.all` do fan-out do trigger do CSAT
O workflow pai do CSAT não deve mais iniciar todos os child workflows em um único `Promise.all(...)`.

A inicialização deve passar a ser controlada por item.

### 2. Criar uma função explícita para o fan-out controlado
Extrair uma função interna clara e didática para a fase de inicialização dos child workflows elegíveis.

Essa função deve, no mínimo:
- receber o contexto necessário do trigger;
- iterar sobre os itens elegíveis;
- tentar iniciar o child workflow de cada item;
- tratar erro por item;
- retornar contadores agregados da fase.

### 3. Tratar corretamente o caso de workflow já em execução
Se um child workflow não puder ser iniciado porque já existe execução em andamento para aquele item, esse caso deve ser tratado explicitamente, sem contaminar a contagem de falha genérica.

A task deve introduzir contagem separada para esse cenário, por exemplo:
- `skippedAlreadyRunning`

A implementação pode espelhar o padrão já usado no workflow de `cobrancas`.

### 4. Preservar o comportamento arquitetural do trigger
O workflow pai do CSAT deve continuar:
- atuando como orquestrador;
- iniciando child workflows independentes;
- não aguardando a conclusão dos children;
- mantendo `ParentClosePolicy.ABANDON`, salvo justificativa técnica muito clara.

### 5. Melhorar contabilidade e retorno da fase de fan-out
A task deve tornar explícito, no mínimo:
- quantos child workflows foram iniciados com sucesso;
- quantos itens foram ignorados por já haver workflow em execução;
- quantos falharam ao iniciar.

Esses dados devem ser usados em logs e, se fizer sentido, incorporados ao retorno do workflow pai sem quebrar desnecessariamente o contrato existente.

### 6. Melhorar logs do trigger do CSAT
Os logs da fase de fan-out devem trazer contexto suficiente para leitura operacional local.

No mínimo, o log final da fase deve incluir:
- `requestId`
- `source`
- `eligibleItemsFound`
- `childWorkflowsStarted`
- `skippedAlreadyRunning`
- `skippedStartFailures`

Também deve existir log por item quando a inicialização falhar de fato.

### 7. Atualizar documentação
Atualizar a documentação do projeto para refletir que o fan-out do trigger do CSAT passou a ser controlado item a item e não mais baseado em `Promise.all`.

## Regras de implementação

### Sobre a solução esperada
A solução mínima esperada para esta task é deliberadamente simples:
- `for...of` com `await startChild(...)`;
- `try/catch` por item;
- contadores explícitos;
- logs claros.

Não há necessidade de introduzir paralelismo em lote, semáforos ou mecanismos mais sofisticados nesta etapa.

### Sobre alinhamento com `cobrancas`
O agente deve usar o módulo `cobrancas` como referência de padrão para o fan-out controlado.

Não é obrigatório extrair utilitário compartilhado entre módulos nesta task.
A prioridade é primeiro alinhar comportamento e legibilidade.

### Sobre `workflowId`
A task deve preservar ou revisar com cuidado a estratégia de `workflowId` dos child workflows do CSAT.

Se for introduzido `workflowIdReusePolicy`, a decisão deve ser simples, explícita e coerente com a semântica do fluxo.

### Sobre semântica de falha
Falha de início de um child workflow individual não deve derrubar automaticamente toda a fase de fan-out.

Essa falha deve:
- ser registrada em log;
- entrar na contabilidade agregada;
- permitir que os demais itens ainda sejam processados.

## Critérios de aceite
A task será considerada pronta se:

- o `Promise.all` tiver sido removido do fan-out do trigger do CSAT;
- existir função clara e didática para inicialização controlada dos children;
- a fase de fan-out tratar falha individual por item;
- o caso de `already running` for tratado separadamente;
- existirem contadores explícitos da fase de fan-out;
- os logs estiverem mais úteis para operação;
- a documentação estiver atualizada;
- `pnpm typecheck` passar;
- `pnpm lint` passar.

## Validação esperada
O agente deve validar, no mínimo, os seguintes cenários:

### Cenário 1 - sem elegíveis
- o trigger encerra normalmente sem iniciar children.

### Cenário 2 - com elegíveis e sem falhas
- todos os child workflows elegíveis são iniciados;
- o retorno do trigger reflete a contagem correta.

### Cenário 3 - falha de início em item isolado
- a falha de um item não impede a tentativa dos demais;
- a falha aparece em log;
- a contagem de falha de início é incrementada.

### Cenário 4 - workflow já em execução
- o caso é tratado separadamente;
- a execução não é contabilizada como falha genérica;
- o trigger segue processando os demais itens.

## Atualização de documentação ao final
Ao concluir a task, atualizar:
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/FIRST_WORKFLOW_OVERVIEW.md
- docs/ARCHITECTURE.md, se necessário

## Ao terminar
O agente deve informar:
1. resumo do que foi feito;
2. arquivos alterados;
3. como validar localmente;
4. riscos ou pendências restantes.
