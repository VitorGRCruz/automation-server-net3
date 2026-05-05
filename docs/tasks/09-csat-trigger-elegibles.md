# Task 09 - Implementar trigger de elegíveis do CSAT

## Objetivo
Implementar a primeira etapa real do workflow de CSAT: consulta de elegíveis no MySQL do ERP e tratamento do resultado no workflow pai do trigger.

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
- docs/specs/csat-trigger-elegibles.md

## Escopo permitido
O agente pode alterar apenas:
- src/temporal/workflows/csat/**
- src/temporal/activities/csat/**
- src/integrations/erp/**
- src/domain/csat/**
- src/domain/shared/**
- src/infra/**
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md

## Não pode
- não implementar OPA
- não implementar IXC API além do que já existir
- não implementar envio de mensagem
- não implementar busca de contato
- não implementar registro final na OS
- não criar abstrações genéricas sem uso real
- não mover a arquitetura base do projeto
- não colocar lógica técnica pesada dentro do workflow
- não criar arquivos com responsabilidade artificialmente pequena
- não alterar rotas HTTP sem necessidade direta desta task

## Entregáveis obrigatórios

### 1. Contrato tipado do registro elegível
Criar o tipo principal do registro retornado pela consulta do ERP.

Exemplo esperado:
```ts
type CsatEligibleRecord = {
  idCliente: number;
  idContrato: number;
  idOs: number;
  nomeCliente: string;
  idTicket: number | null;
  idFilial: number;
};
```

### 2. Activity real de consulta ao ERP
Criar uma activity para consultar o MySQL do ERP em modo read-only, usando a query definida na spec.

Essa activity deve:
- executar a query;
- mapear o retorno para o contrato tipado;
- classificar falhas;
- devolver um resultado claro.

### 3. Classificação formal de falha
Criar um retorno ou erro tipado que permita distinguir:
- sucesso com registros
- sucesso vazio
- erro transitório
- erro permanente

## Observação
Nesta etapa, erros desconhecidos devem ser tratados como transitórios.

### 4. Workflow pai do trigger do CSAT
O workflow pai deve:
- executar a activity de busca de elegíveis;
- encerrar se vier vazio;
- iniciar um child workflow por registro se vier sucesso com registros;
- aplicar a política de retry descrita na spec;
- encerrar com falha terminal em erro permanente;
- encerrar com falha terminal após falha da segunda rodada de tentativas transitórias.

### 5. Preparar child workflow
O child workflow não precisa estar completo, mas deve existir uma estrutura mínima para receber o payload de um registro elegível e registrar progresso/log suficiente para comprovar o fan-out.

## Regras de implementação

### Workflow
O workflow deve conter apenas:
- decisão de caminho
- controle da política de tentativa
- chamada de activities
- chamada de child workflows

Não deve conter:
- query SQL
- acesso a MySQL
- parsing técnico de erro de banco

### Activity
A activity deve conter:
- chamada real ao MySQL
- query
- mapeamento do resultado
- classificação de falhas

## Política de retry que deve ser implementada

### Rodada 1
- 1 execução inicial
- até 3 tentativas após erro transitório ou desconhecido

### Se ainda falhar
- aguardar 3 minutos

### Rodada 2
- nova execução
- até 3 tentativas após erro transitório ou desconhecido

### Se ainda falhar
- encerrar como falha terminal

## Critérios de aceite
A task será considerada pronta se:

- existir activity real de busca de elegíveis no ERP
- o workflow pai de CSAT estiver orquestrando corretamente os caminhos principais
- o fan-out por registro estiver preparado com child workflow mínimo
- a classificação de erro estiver explícita e didática
- a implementação estiver simples e legível
- `pnpm typecheck` passar
- `pnpm lint` passar
- não houver lógica de integração externa dentro do workflow

## Validação esperada
Executar localmente um cenário em que:
- a query retorna vazio
- a query retorna registros
- ocorre um erro transitório simulado/classificado
- ocorre um erro permanente simulado/classificado

## Atualização de documentação ao final
Ao concluir a task, atualizar:
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md

Marcar a Task 09 como concluída apenas se todos os critérios de aceite forem atendidos.
