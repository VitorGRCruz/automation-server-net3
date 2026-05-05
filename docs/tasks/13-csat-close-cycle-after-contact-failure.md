# Task 13 - Encerrar ciclo do CSAT após falha na busca de contato

## Objetivo
Implementar a orquestração que fecha o ciclo do workflow de CSAT quando a etapa de busca de contato do cliente no OPA falhar.

Esta task não deve criar uma nova integração com o IXC.
Ela deve reutilizar a ação já existente de encaminhar OS por falha, criada anteriormente.

## Leitura obrigatória antes de codar
- docs/README.md
- docs/PROJECT_RULES.md
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/ARCHITECTURE.md
- docs/TEMPORAL_RULES.md
- docs/FIRST_WORKFLOW_OVERVIEW.md
- docs/specs/csat-find-whatsapp-contact-in-opa.md
- docs/specs/csat-forward-os-on-failure.md
- docs/specs/csat-close-cycle-after-contact-failure.md

## Escopo permitido
O agente pode alterar apenas:
- src/temporal/workflows/csat/**
- src/domain/csat/**
- src/domain/shared/**
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md

## Não pode
- não criar nova integração com o IXC
- não alterar a implementação da ação reutilizável sem necessidade real
- não duplicar a lógica da task 11
- não criar nova política de retry para encaminhamento da OS
- não alterar a task 12 além do necessário para integração do fluxo
- não implementar etapas posteriores ao encerramento do ciclo
- não criar abstrações genéricas sem uso real

## Entregáveis obrigatórios

### 1. Conexão do fluxo de falha da task 12 com a ação reutilizável
Quando a task 12 falhar na busca do contato do cliente no OPA, o workflow deve encaminhar a execução para a etapa de fechamento do ciclo.

### 2. Reaproveitamento da ação de encaminhar OS por falha
A implementação deve usar a ação já existente e passar corretamente:
- `id_os` como `id_chamado`
- `motivo_falha` como `mensagem`

### 3. Encerramento explícito do workflow
Após a execução da ação reutilizável:
- se der certo, encerrar o workflow
- se falhar de forma terminal, encerrar o workflow com falha terminal

## Regras de implementação

### Workflow
O workflow deve:
- detectar que a task 12 falhou
- receber o `motivo_falha` dessa etapa
- chamar a ação reutilizável de encaminhar OS
- encerrar o ciclo depois disso

### Workflow não deve
- reimplementar chamada HTTP
- reclassificar erro do IXC
- repetir a lógica de retry da ação reutilizável

## Critérios de aceite
A task será considerada pronta se:
- a falha da task 12 acionar corretamente a ação reutilizável da task 11
- o `motivo_falha` for propagado corretamente
- o `id_os` for usado corretamente como referência da OS
- o ciclo do workflow for encerrado depois dessa etapa
- não houver duplicação da lógica de integração com o IXC
- o código permanecer simples, legível e didático
- `pnpm typecheck` passar
- `pnpm lint` passar

## Validação esperada
Validar pelo menos estes cenários:
- a task 12 falha e o encaminhamento da OS é executado com sucesso
- a task 12 falha e a ação reutilizável falha terminalmente
- o workflow não continua para etapas posteriores após o fechamento do ciclo

## Atualização de documentação ao final
Ao concluir a task, atualizar:
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md

Marcar a Task 13 como concluída apenas se todos os critérios de aceite forem atendidos.
