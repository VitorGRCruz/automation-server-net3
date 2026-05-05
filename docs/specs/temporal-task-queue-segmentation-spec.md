# Temporal - Segmentação de Task Queues por Contexto de Execução

## Objetivo
Reduzir o risco operacional e o gargalo implícito da arquitetura atual baseada em uma única task queue principal, separando a execução do Temporal por contexto técnico de trabalho.

A meta desta mudança não é "criar filas por vaidade" nem fragmentar o projeto cedo demais.
A meta é criar uma divisão mínima, explícita e útil entre:
- orquestração de workflows;
- leitura no ERP;
- chamadas ao OPA;
- chamadas ao IXC.

## Problema atual
Hoje o projeto já usa Temporal de forma correta no papel de orquestração, porém a execução real ainda está concentrada em uma task queue principal.

Esse desenho é suficiente para a fase inicial, mas traz limitações importantes quando o sistema crescer:
- concorrência de workflows e activities competindo na mesma fila;
- risco de uma integração lenta ou instável degradar o restante do sistema;
- dificuldade de controlar throughput por integração;
- isolamento operacional fraco;
- menor clareza sobre qual worker executa qual tipo de carga;
- acoplamento implícito entre orquestração e I/O externo.

O problema não é apenas "performance".
O problema principal é **isolamento operacional**.

Quando tudo cai na mesma task queue, o sistema perde a capacidade de tratar de forma diferente:
- decisão de fluxo;
- consultas ao ERP;
- busca de dados no OPA;
- mutações e chamadas no IXC.

## Direção arquitetural proposta
A arquitetura deve evoluir de uma fila principal genérica para uma topologia mínima de task queues com papéis bem definidos.

### Task queues propostas
- `automation-control`
- `automation-erp-read`
- `automation-opa`
- `automation-ixc`

## Princípio central
**Workflows continuam centralizados em `automation-control`.**

A segmentação proposta não transforma cada módulo em um microserviço nem distribui a orquestração entre várias filas.
A intenção é manter a lógica de decisão em um único plano de controle e deslocar apenas a execução externa para filas especializadas.

Em termos simples:
- `automation-control` pensa;
- `automation-erp-read` consulta;
- `automation-opa` busca dados no OPA;
- `automation-ixc` executa chamadas ao IXC.

## Motivação técnica
Essa divisão atende a quatro objetivos concretos:

### 1. Isolamento de falha por integração
Se o IXC estiver lento, indisponível ou com alto volume, isso não deve concorrer diretamente com polling de workflows ou consultas de ERP.

### 2. Controle de concorrência por tipo de carga
Consultas no ERP e mutações no IXC têm características diferentes.
No médio prazo, pode ser desejável limitar cada uma com parâmetros operacionais próprios.

### 3. Legibilidade operacional
Ao olhar para o projeto, deve ficar evidente:
- qual worker executa workflow;
- qual worker executa OPA;
- qual worker executa ERP;
- qual worker executa IXC.

### 4. Escalabilidade incremental
A separação deve permitir aumentar réplicas ou recursos de um worker específico sem escalar tudo junto.

## Escopo arquitetural desta proposta
Esta mudança cobre:
- redefinição da convenção oficial de task queues;
- criação de workers dedicados por contexto de execução;
- roteamento explícito das activities para a fila correta;
- atualização da documentação e da configuração central do projeto;
- adaptação dos módulos atuais (`csat` e `cobrancas`) para o novo modelo.

## Fora de escopo
Esta mudança não deve:
- criar uma task queue por workflow;
- criar uma task queue por módulo de negócio sem necessidade real;
- mover lógica de negócio para client Temporal;
- transformar integrações em serviços independentes fora do projeto;
- introduzir fila fora do Temporal;
- alterar a regra funcional dos fluxos de CSAT e cobrancas;
- resolver observabilidade avançada, tracing ou autoscaling nesta mesma etapa.

## Topologia alvo

```text
Temporal Client / Schedule
          |
          v
   task queue: automation-control
          |
          +--> workflows do projeto
          |
          +--> activities internas leves de controle/diagnóstico
                    |
                    +--> proxyActivities(taskQueue="automation-erp-read")
                    +--> proxyActivities(taskQueue="automation-opa")
                    +--> proxyActivities(taskQueue="automation-ixc")

worker-control
  - registra workflows
  - registra activities compartilhadas de controle
  - não executa chamadas externas pesadas de ERP/OPA/IXC

worker-erp-read
  - registra apenas activities de leitura do ERP

worker-opa
  - registra apenas activities que chamam OPA

worker-ixc
  - registra apenas activities que chamam IXC
  - pode continuar acessando MySQL interno quando a activity precisar encapsular idempotência durável
```

## Regras de desenho

### 1. `automation-control` é a fila oficial dos workflows
Todos os workflows do projeto devem continuar sendo executados em `automation-control`, salvo exceção futura explicitamente justificada.

Isso inclui:
- workflow de diagnóstico;
- workflow pai do CSAT;
- child workflow do CSAT;
- workflow pai de cobrancas;
- child workflow de cobrancas;
- workflow de recovery de cobrancas.

### 2. Activities externas devem ser roteadas por integração
A escolha da fila da activity deve refletir o sistema externo principal acessado por ela.

#### `automation-erp-read`
Deve receber activities como:
- `fetchCsatEligibleItemsActivity`
- `fetchEquipmentRetrievalVerificationEligiblesActivity`
- futuras consultas read-only ao ERP

#### `automation-opa`
Deve receber activities como:
- `findOpaCustomerActivity`
- `findWhatsappContactActivity`
- futuras buscas de cliente, contato ou dados no OPA

#### `automation-ixc`
Deve receber activities como:
- `sendCsatMessageActivity`
- `forwardServiceOrderOnFailureActivity`
- `registerCsatSuccessEventOnOsActivity`
- `createEquipmentRetrievalVerificationOrderActivity`
- futuras mutações ou leituras técnicas da API IXC

### 3. Activities internas leves podem ficar em `automation-control`
Activities puramente internas e leves, sem custo externo relevante, podem permanecer em `automation-control`.

Exemplos aceitáveis:
- `diagnosticsPingActivity`
- futuras activities de montagem simples, validação local ou controle técnico

### 4. O workflow decide o destino das activities de forma explícita
O roteamento deve ficar claro no código do workflow por meio de `proxyActivities` com `taskQueue` explícita.

Exemplo conceitual:

```ts
const erpReadActivities = proxyActivities<typeof erpReadActivitiesModule>({
  taskQueue: temporalConfig.taskQueues.erpRead,
  startToCloseTimeout: '5 minutes',
  retry: { ... }
});

const opaActivities = proxyActivities<typeof opaActivitiesModule>({
  taskQueue: temporalConfig.taskQueues.opa,
  startToCloseTimeout: '2 minutes',
  retry: { ... }
});

const ixcActivities = proxyActivities<typeof ixcActivitiesModule>({
  taskQueue: temporalConfig.taskQueues.ixc,
  startToCloseTimeout: '2 minutes',
  retry: { ... }
});
```

O workflow continua sem chamar integração diretamente.
A única diferença é que agora ele declara para qual fila cada activity deve ser enviada.

## Requisitos funcionais

### 1. Configuração centralizada de task queues
A configuração do projeto deve deixar explícitas as filas oficiais:

```ts
const taskQueues = {
  control: 'automation-control',
  erpRead: 'automation-erp-read',
  opa: 'automation-opa',
  ixc: 'automation-ixc'
} as const;
```

A nomenclatura final pode variar minimamente, desde que preserve o sentido acima e permaneça estável.

### 2. Bootstrap de workers dedicados
O projeto deve passar a ter bootstrap claro e separado para:
- worker de controle;
- worker de ERP read-only;
- worker de OPA;
- worker de IXC.

A separação deve ficar didática também em nível de arquivos.

Exemplo de direção aceitável:

```text
src/temporal/worker/
  create-control-worker.ts
  create-erp-read-worker.ts
  create-opa-worker.ts
  create-ixc-worker.ts
  run-control-worker.ts
  run-erp-read-worker.ts
  run-opa-worker.ts
  run-ixc-worker.ts
```

Também é aceitável uma factory reutilizável com entrypoints explícitos, desde que o resultado final permaneça legível.

### 3. Registro de workflows apenas no worker de controle
A bundle de workflows do projeto deve ser registrada apenas no worker ligado à fila `automation-control`.

Workers especializados por integração não devem registrar workflows.
Eles devem registrar apenas as activities compatíveis com sua responsabilidade.

### 4. Schedules e clients iniciam workflows na fila de controle
Toda inicialização de workflow por client ou schedule deve apontar para `automation-control`.

Isso vale para:
- rota manual de diagnóstico;
- scripts de start manual;
- schedules do CSAT;
- schedules de cobrancas.

### 5. Compatibilidade com child workflows
Child workflows devem continuar na fila de controle, a menos que exista justificativa operacional explícita e documentada para outro desenho.

O fato de uma activity do child ir para outra queue não altera a fila do próprio child workflow.

### 6. Compatibilidade com idempotência durável
A mudança não deve quebrar a estratégia atual de idempotência durável nas activities mutáveis.

Em especial:
- activities do IXC podem continuar acessando MySQL interno do sistema para reserva/finalização de idempotência;
- isso não exige uma fila separada para MySQL interno nesta etapa;
- a responsabilidade principal da fila continua sendo determinada pelo sistema externo dominante da activity.

## Requisitos não funcionais

### 1. Clareza maior que abstração
A implementação deve preferir código explícito e fácil de manter a uma abstração excessivamente genérica de filas e workers.

### 2. Escalável por processo
O desenho deve permitir executar, no mínimo em teoria e idealmente já na prática:
- 1 réplica do worker de controle;
- N réplicas do worker de IXC;
- 1 ou mais réplicas do worker de OPA;
- 1 ou mais réplicas do worker de ERP.

### 3. Evolução incremental
A mudança deve permitir migração do código atual sem reescrever todos os workflows do zero.

### 4. Backward compatibility apenas se simples
Não é obrigatório manter a task queue antiga `automation-main` se isso complicar a leitura.

A preferência desta proposta é substituir a convenção antiga pela nova convenção clara.

## Mapeamento inicial das activities atuais

### Controle
- `diagnosticsPingActivity`

### ERP Read
- `fetchCsatEligibleItemsActivity`
- `fetchEquipmentRetrievalVerificationEligiblesActivity`

### OPA
- `findOpaCustomerActivity`
- `findWhatsappContactActivity`

### IXC
- `forwardServiceOrderOnFailureActivity`
- `sendCsatMessageActivity`
- `registerCsatSuccessEventOnOsActivity`
- `createEquipmentRetrievalVerificationOrderActivity`
- `registerEquipmentRetrievalVerificationTriggerFailureActivity` apenas se permanecer tecnicamente acoplada ao IXC; caso seja apenas log/audit interno, ela pode ficar em `automation-control`

## Decisão importante sobre activities híbridas
Algumas activities podem tocar mais de um recurso técnico.
O critério desta spec é:

**classificar pela integração externa dominante da ação.**

Exemplo:
- uma activity do IXC que consulta/grava idempotência no MySQL interno continua sendo `automation-ixc`, porque o objetivo de negócio principal dela é a mutação no IXC.

## Estratégia de rollout sugerida

### Fase 1 - Introdução das novas filas
- adicionar configuração das novas queues;
- criar workers dedicados;
- manter workflows na fila de controle;
- migrar activities atuais para o roteamento explícito.

### Fase 2 - Ajustes operacionais
- revisar scripts e compose para subir workers dedicados;
- permitir escala independente por worker;
- atualizar documentação operacional.

### Fase 3 - Refinamento opcional
- revisar limites de concorrência por worker;
- medir throughput por integração;
- avaliar se algum contexto precisa de tuning próprio.

## Riscos e cuidados

### 1. Separar filas não substitui idempotência
Se uma activity mutável está em `automation-ixc`, ela continua sujeita a retry e reentrega.
A proteção de idempotência continua obrigatória.

### 2. Separar filas não substitui rate limiting
A divisão melhora isolamento, mas não define sozinha o volume seguro contra OPA, IXC ou ERP.

### 3. Aumentar número de workers aumenta custo operacional
A solução é melhor operacionalmente, mas adiciona processos, scripts e configuração.
Isso precisa ser assumido conscientemente.

### 4. Não transformar cada queue em um silo de negócio
A separação proposta é por **contexto técnico de execução**, não por módulo de negócio.
Isso evita explosão combinatória de workers.

## Critérios de aceite arquiteturais
Esta proposta será considerada corretamente implementada quando:

- existir convenção oficial clara para `automation-control`, `automation-erp-read`, `automation-opa` e `automation-ixc`;
- workflows passarem a rodar em `automation-control`;
- activities externas forem roteadas explicitamente para suas filas;
- existirem workers dedicados por contexto;
- clients e schedules iniciarem workflows na fila de controle;
- documentação do projeto refletir o novo desenho real;
- a mudança não alterar a regra funcional dos fluxos atuais.

## Documentação que deve ser atualizada quando esta mudança for implementada
No mínimo:
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ARCHITECTURE.md`
- `docs/TEMPORAL_RULES.md`
- `docs/README.md` se houver comandos de runtime local
- documentação operacional de compose/worker, se existir

## Resultado esperado
Ao final da implementação desta spec, o projeto deve deixar de ter uma única fila principal como gargalo implícito e passar a ter um plano de controle claro, com execução especializada por integração, mantendo o Temporal como motor de orquestração e sem transformar o código em uma arquitetura excessivamente fragmentada.
