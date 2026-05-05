# Task 23 - Segmentar task queues do Temporal por contexto de execução

## Objetivo
Evoluir a base Temporal do projeto para substituir a convenção atual de fila principal única por uma topologia mínima de task queues separadas por contexto técnico de execução.

A mudança deve preservar o papel do Temporal como orquestrador central, mantendo todos os workflows na fila de controle e roteando as activities externas para filas especializadas de ERP, OPA e IXC.

## Leitura obrigatória antes de codar
- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ARCHITECTURE.md`
- `docs/TEMPORAL_RULES.md`
- `docs/specs/temporal-task-queue-segmentation-by-execution-context.md`

## Escopo permitido
O agente pode alterar apenas:
- `src/temporal/**`
- `src/infra/config/**`
- `src/domain/**` apenas se necessário para adaptação de imports/tipos
- `src/app/**` apenas se necessário para continuar iniciando workflows na fila correta
- `docker-compose.yml`
- `.env.example` apenas se a nova topologia exigir ajustes claros de runtime
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ARCHITECTURE.md`
- `docs/TEMPORAL_RULES.md`
- `docs/README.md` se os comandos de runtime mudarem
- `docs/specs/**`
- `docs/tasks/**`

## Não pode
- não alterar regra funcional dos workflows de `csat` ou `cobrancas`
- não reescrever os módulos de negócio do zero
- não criar task queue por workflow
- não criar task queue por módulo de negócio sem justificativa operacional explícita
- não introduzir fila fora do Temporal
- não mover regra de negócio para client Temporal
- não introduzir observabilidade externa avançada nesta task
- não aproveitar a task para refatorações amplas não relacionadas à segmentação das filas

## Contexto
O projeto hoje já usa Temporal como base de orquestração, mas ainda concentra a execução em uma fila principal, com convenção inicial pouco explorada.

Isso cria risco de gargalo e de acoplamento operacional entre:
- workflows;
- leituras do ERP;
- chamadas ao OPA;
- chamadas ao IXC.

A presente task implementa a divisão mínima proposta na spec de arquitetura, usando as seguintes filas:
- `automation-control`
- `automation-erp-read`
- `automation-opa`
- `automation-ixc`

## Entregáveis obrigatórios

### 1. Redefinir a convenção oficial de task queues
A configuração central do projeto deve passar a expor explicitamente as task queues:
- `control`
- `erpRead`
- `opa`
- `ixc`

Os nomes finais em string devem seguir a convenção da spec.

A convenção antiga baseada em fila principal única não deve continuar como caminho padrão do código novo.

### 2. Criar worker de controle
Deve existir um worker dedicado à fila `automation-control`.

Esse worker deve registrar:
- todos os workflows do projeto;
- activities leves de diagnóstico ou controle, se existirem.

Esse worker **não deve** continuar concentrando as activities externas pesadas por padrão.

### 3. Criar workers especializados por integração
Devem existir workers dedicados para:
- `automation-erp-read`
- `automation-opa`
- `automation-ixc`

Cada worker deve registrar apenas as activities coerentes com sua responsabilidade técnica principal.

### 4. Roteamento explícito de activities nos workflows
Os workflows atuais devem passar a usar `proxyActivities` com `taskQueue` explícita para cada grupo de integração.

No mínimo, isso deve ficar claro para:

#### ERP
- trigger de elegíveis do CSAT
- trigger de elegíveis de cobrancas

#### OPA
- busca do cliente no OPA
- busca de contato válido no OPA

#### IXC
- encaminhamento da OS por falha
- envio de mensagem do CSAT
- registro do evento final de sucesso na OS
- criação da OS de conferência de retirada

### 5. Preservar workflows e child workflows na fila de controle
Todos os workflows existentes devem continuar sendo iniciados na fila `automation-control`, incluindo:
- workflow de diagnóstico
- workflow pai do CSAT
- child workflow do CSAT
- workflow pai de cobrancas
- child workflow de cobrancas
- workflow de recovery de cobrancas

### 6. Ajustar clients e schedules
Clients e schedules que iniciam workflows devem continuar funcionando, mas agora sempre apontando para `automation-control`.

Isso vale, no mínimo, para:
- diagnóstico manual
- scripts de start manual
- schedule do CSAT
- schedule de cobrancas

### 7. Atualizar runtime local se necessário
Se o runtime local atual estiver configurado para subir apenas um worker genérico, ele deve ser ajustado de forma clara para a nova topologia.

É aceitável que o `docker-compose.yml` passe a subir múltiplos serviços de worker, desde que:
- os nomes fiquem claros;
- o ambiente continue simples o suficiente para desenvolvimento;
- a documentação reflita honestamente o novo passo a passo.

### 8. Atualizar documentação
A documentação deve refletir o novo desenho real.

No mínimo, atualizar:
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ARCHITECTURE.md`
- `docs/TEMPORAL_RULES.md`
- `docs/README.md` se os comandos de execução mudarem

## Regras de implementação

### Sobre a fila de controle
A fila `automation-control` é o plano de controle do projeto.
Ela deve concentrar a execução dos workflows e a coordenação do sistema.

### Sobre filas de integração
As filas `automation-erp-read`, `automation-opa` e `automation-ixc` devem ser usadas apenas para execução de activities orientadas a essas integrações.

### Sobre activities híbridas
Se uma activity acessar mais de um recurso técnico, ela deve ser classificada pela integração externa dominante da ação.

Exemplo:
- uma activity que chama IXC e consulta idempotência no MySQL interno continua sendo da fila `automation-ixc`.

### Sobre idempotência
A mudança de task queue não pode quebrar a idempotência durável já implementada.

### Sobre retry
As políticas de retry existentes devem ser preservadas, salvo ajustes mínimos necessários para o novo roteamento.

### Sobre compatibilidade
A implementação pode remover a convenção antiga de fila principal única se isso deixar o código mais claro.
A prioridade é coerência do desenho final.

## Critérios de aceite
A task será considerada pronta se:

- existir configuração central clara para `automation-control`, `automation-erp-read`, `automation-opa` e `automation-ixc`;
- existir worker de controle e workers especializados por integração;
- os workflows atuais rotearem activities externas para a fila correta;
- clients e schedules iniciarem workflows em `automation-control`;
- o projeto continuar compilando;
- `pnpm lint` passar;
- `pnpm typecheck` passar;
- a documentação estiver atualizada de forma coerente com a implementação real.

## Validação esperada
Executar, no mínimo, as seguintes validações:

### Estrutura
- confirmar que os entrypoints de worker especializados existem e são legíveis;
- confirmar que os workflows permanecem registrados apenas no worker de controle.

### Roteamento
- confirmar no código que activities de ERP usam `automation-erp-read`;
- confirmar no código que activities de OPA usam `automation-opa`;
- confirmar no código que activities de IXC usam `automation-ixc`.

### Runtime
- subir o ambiente local e confirmar que os workers entram em execução sem erro de registro;
- iniciar ao menos um workflow de diagnóstico ou fluxo controlado e validar que a fila de controle recebe o workflow.

### Regressão mínima
- validar que o módulo `csat` continua compilando com o novo roteamento;
- validar que o módulo `cobrancas` continua compilando com o novo roteamento.

## Atualização de documentação ao final
Ao concluir a task, atualizar:
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ARCHITECTURE.md`
- `docs/TEMPORAL_RULES.md`
- `docs/README.md` se aplicável

Marcar a Task 19 como concluída apenas se os critérios de aceite forem atendidos.

## Ao terminar
O agente deve informar:
1. resumo do que foi feito;
2. arquivos alterados;
3. como subir os workers na nova topologia;
4. como validar localmente;
5. riscos ou pendências restantes.
