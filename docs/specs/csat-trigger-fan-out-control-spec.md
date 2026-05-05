# CSAT - Controle fino do fan-out do trigger

## Objetivo
Substituir o fan-out atual do workflow pai do CSAT, hoje baseado em `Promise.all` para iniciar todos os child workflows de uma vez, por uma estratégia de inicialização controlada, com tratamento por item, contabilidade explícita do resultado do fan-out e comportamento mais previsível em cenários de volume alto ou falha parcial.

## Motivação
O workflow pai do CSAT atualmente busca os elegíveis e dispara um child workflow por item logo em seguida.

A intenção arquitetural é correta: o workflow pai atua como trigger/orquestrador, e cada item segue de forma independente em seu próprio child workflow.

O problema está na forma de iniciar esses children.
Hoje o fan-out usa `Promise.all(...)` diretamente sobre todos os elegíveis.

Essa abordagem é simples, mas traz riscos operacionais importantes:
- uma falha na inicialização de um único child pode rejeitar o `Promise.all` inteiro;
- parte dos children pode já ter sido iniciada com sucesso antes da rejeição, deixando o resultado do fan-out pouco observável;
- não existe contabilidade fina de quantos children foram iniciados, quantos já estavam rodando e quantos falharam ao iniciar;
- o trigger pode gerar rajadas desnecessárias de comandos quando houver muitos elegíveis;
- o comportamento fica menos consistente com o padrão já implementado no módulo `cobrancas`, que faz o fan-out com controle por item.

Esta etapa existe para endurecer especificamente o fan-out do trigger do CSAT, sem reescrever a arquitetura do módulo.

## Contexto
O workflow pai do CSAT já possui o comportamento geral esperado:
- busca elegíveis no ERP;
- encerra limpo quando a consulta retorna vazia;
- inicia um child workflow independente por item elegível;
- mantém retry manual em duas rodadas para a etapa de trigger.

No entanto, a fase de inicialização dos children ainda está simplificada demais.

O módulo `cobrancas` já contém um exemplo melhor de fan-out controlado, com:
- loop explícito por item;
- `try/catch` por child;
- contadores de sucesso e falha;
- tratamento de caso em que o workflow já está rodando;
- logs mais úteis para operação.

A presente etapa deve alinhar o CSAT a esse padrão, sem alterar a regra de negócio do fluxo.

## Escopo desta etapa
Esta etapa deve cobrir apenas o endurecimento do fan-out do trigger do CSAT.

Ela deve incluir:
- substituição do `Promise.all` por uma estratégia de inicialização controlada;
- tratamento de erro por item no momento do `startChild`;
- contabilidade explícita do resultado do fan-out;
- logs operacionais mais úteis para essa fase;
- retorno do workflow pai refletindo melhor o resultado da fase de início dos children;
- alinhamento estrutural com o padrão já usado no workflow de `cobrancas`, quando fizer sentido.

## Fora de escopo
Esta etapa não deve:
- alterar a regra de negócio do fluxo do CSAT;
- mudar a lógica interna do child workflow do CSAT;
- remover o uso de child workflows;
- transformar o trigger em processamento síncrono item a item até o fim;
- criar uma nova task queue;
- introduzir controle distribuído de concorrência sofisticado;
- reescrever o módulo `csat` inteiro;
- alterar integrações externas sem necessidade direta desta melhoria.

## Requisitos funcionais

### 1. Substituir o `Promise.all` por fan-out controlado
A fase de inicialização dos child workflows do CSAT não deve mais depender de um `Promise.all` aplicado diretamente sobre todos os elegíveis.

A implementação deve passar a iniciar os child workflows com controle explícito por item.

A forma mínima esperada é:
- iterar sobre os elegíveis;
- chamar `startChild(...)` para cada item;
- capturar erro individualmente;
- continuar processando os demais itens mesmo quando houver falha em um item específico.

### 2. Preservar o modelo arquitetural atual
O workflow pai do CSAT deve continuar atuando apenas como orquestrador do trigger.

Ele deve continuar:
- consultando os elegíveis;
- iniciando children independentes por item;
- encerrando após a fase de fan-out.

O child workflow do CSAT deve continuar sendo o responsável pelo processamento completo de cada item.

### 3. Manter independência dos children
Os child workflows do CSAT devem continuar independentes entre si.

A política `ParentClosePolicy.ABANDON` deve ser preservada, salvo necessidade técnica muito bem justificada.

A melhoria desta etapa não deve tornar o pai dependente da conclusão dos children.

### 4. Tratar falhas de início por item
Se a inicialização de um child workflow falhar para um item específico, essa falha não deve abortar automaticamente toda a fase de fan-out.

O sistema deve:
- registrar a falha com contexto suficiente;
- seguir tentando iniciar os demais items elegíveis;
- contabilizar a falha no resultado agregado da fase de fan-out.

### 5. Tratar corretamente o caso de workflow já em execução
Se o `startChild(...)` falhar porque já existe uma execução correspondente em andamento para aquele item, esse caso não deve ser tratado como falha operacional genérica.

Ele deve ser tratado de forma explícita e contabilizado separadamente, por exemplo como:
- `skippedAlreadyRunning`

A forma exata de detectar esse caso pode seguir o mesmo padrão já usado no módulo `cobrancas`.

### 6. Contabilidade explícita do fan-out
A fase de fan-out do trigger do CSAT deve produzir contadores explícitos, no mínimo para:
- children iniciados com sucesso;
- itens ignorados porque já havia workflow em execução;
- itens cuja inicialização falhou.

Esses contadores devem ser usados:
- em logs;
- no retorno do workflow pai, quando fizer sentido e sem quebrar contratos indevidamente.

### 7. Melhorar a observabilidade local do trigger
Os logs do workflow pai do CSAT devem passar a registrar a fase de fan-out com contexto suficiente para operação local.

No mínimo, os logs devem informar:
- `requestId`;
- `source`;
- quantidade de elegíveis encontrados;
- quantidade de child workflows iniciados;
- quantidade de casos já em execução;
- quantidade de falhas ao iniciar.

### 8. Alinhar o padrão do CSAT ao padrão já usado em `cobrancas`
Sempre que fizer sentido, a implementação deve reaproveitar ou espelhar o padrão de fan-out já presente no workflow de `equipment-retrieval-verification`.

O objetivo não é criar abstração genérica prematura.
O objetivo é reduzir inconsistência arquitetural entre dois módulos que já usam o mesmo modelo conceitual de trigger + child workflows.

## Requisitos técnicos

### Estratégia mínima recomendada
A solução recomendada para esta etapa é:
- extrair uma função interna dedicada para iniciar os child workflows elegíveis;
- percorrer os itens com `for...of`;
- usar `try/catch` por item;
- contabilizar `started`, `alreadyRunning` e `startFailures`;
- registrar logs claros ao final.

### Reuso de política de `workflowId`
A task deve revisar o `workflowId` usado para o child workflow do CSAT e garantir que ele continue coerente com a estratégia do módulo.

Se fizer sentido, pode também ser avaliado o uso explícito de `workflowIdReusePolicy`, desde que a decisão fique simples, didática e alinhada ao comportamento esperado do CSAT.

Essa revisão não deve virar redesign da política de identidade do módulo.

### Tratamento de erro
A melhoria não deve mascarar erro real.

Erros de início do child workflow devem:
- ser visíveis em log;
- entrar na contabilidade da fase de fan-out;
- não derrubar automaticamente o trigger inteiro quando afetarem apenas itens isolados.

## Critério de conclusão da etapa
A etapa será considerada concluída quando:
- o `Promise.all` do fan-out do CSAT deixar de existir;
- a inicialização dos child workflows ocorrer com controle por item;
- falhas de início deixarem de abortar automaticamente toda a fase de fan-out;
- existir contabilidade explícita do resultado do fan-out;
- os logs da fase de fan-out estiverem mais úteis;
- o comportamento do CSAT estiver mais alinhado ao padrão já usado em `cobrancas`;
- a documentação estiver atualizada para refletir a nova estratégia.

## Requisitos de documentação
Ao final da task, a documentação deve refletir o estado real do trigger do CSAT.

No mínimo, devem ser atualizados:
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/FIRST_WORKFLOW_OVERVIEW.md`, se ele mencionar o fan-out do trigger de forma relevante
- `docs/ARCHITECTURE.md`, se houver descrição do padrão de trigger + child workflows que precise refletir esse endurecimento

## Resultado esperado desta etapa
Ao final desta task, o trigger do CSAT deve continuar simples, porém mais seguro operacionalmente.

O resultado esperado é um workflow pai que:
- continua buscando elegíveis e iniciando child workflows por item;
- deixa de depender de `Promise.all` para o fan-out;
- passa a lidar melhor com falhas parciais;
- oferece melhor leitura operacional da fase de disparo;
- se aproxima do padrão mais maduro já usado no módulo `cobrancas`.
