# Task 18 - Habilitar ambiente e validar prontidão operacional do CSAT

## Objetivo
Concluir as pendências operacionais deixadas após a task 17, preparando o ambiente local completo para execução do workflow de início da pesquisa de satisfação do módulo CSAT com validação real de infraestrutura, schedule e idempotência durável.

## Leitura obrigatória antes de codar
- docs/README.md
- docs/PROJECT_RULES.md
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/ARCHITECTURE.md
- docs/FIRST_WORKFLOW_OVERVIEW.md
- docs/specs/csat-production-hardening-and-schedule.md
- docs/specs/csat-production-enablement-and-final-validation.md

## Escopo permitido
O agente pode alterar apenas:
- docker-compose.yml
- .env.example
- src/infra/**
- src/temporal/**
- src/domain/**
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/ARCHITECTURE.md
- docs/FIRST_WORKFLOW_OVERVIEW.md
- docs/README.md
- docs/specs/**
- docs/tasks/**

## Não pode
- não criar novos módulos de negócio
- não alterar regras funcionais do fluxo do CSAT sem necessidade operacional
- não modificar rotas HTTP sem necessidade direta desta task
- não introduzir fila adicional fora do Temporal
- não trocar a estratégia de arquitetura base do projeto
- não fazer refatorações amplas fora de ambiente, configuração, runtime e validação

## Entregáveis obrigatórios

### 1. Completar o docker-compose local
Ajustar o `docker-compose.yml` para subir o MySQL próprio do sistema, além da stack já necessária.

O compose deve:
- subir o MySQL do sistema;
- definir volume persistente local;
- tornar o ambiente executável de forma previsível;
- permitir que a aplicação/worker acessem esse banco.

### 2. Atualizar `.env.example`
Adicionar todas as novas variáveis obrigatórias para rodar e validar o ambiente.

No mínimo, o `.env.example` deve contemplar:
- Temporal
- schedule do CSAT
- MySQL do sistema
- ERP MySQL
- OPA
- IXC
- API local

### 3. Garantir rotina de criação/validação do schedule
A base do projeto deve permitir:
- criar o schedule do trigger do CSAT;
- não duplicar schedule já existente;
- documentar como validar e recriar o schedule.

O schedule deve disparar o trigger do CSAT a cada 60 minutos.

### 4. Validar runtime local
Garantir que exista um caminho documentado e funcional para:
- subir a stack local;
- iniciar worker;
- validar conexão com Temporal;
- validar conexão com o MySQL do sistema;
- confirmar que a idempotência durável está operacional.

### 5. Revisar documentação operacional
Atualizar a documentação para refletir o estado real do ambiente após esta task.

A documentação deve deixar claro:
- como subir o ambiente;
- como configurar variáveis;
- como iniciar worker;
- como criar/garantir o schedule;
- como rodar o smoke test mínimo;
- como diagnosticar falhas comuns de ambiente.

## Smoke tests mínimos obrigatórios
Documentar e, se viável dentro do ambiente, executar validação mínima para:

1. Trigger sem elegíveis.
2. Trigger com elegíveis.
3. Encaminhamento da OS por falha.
4. Envio de mensagem com proteção contra duplicidade.
5. Registro final de sucesso sem duplicidade indevida.

## Regras importantes

### Idempotência
A task deve confirmar que a idempotência durável substitui efetivamente a estratégia local baseada em `tmpdir()` para o uso de produção/homologação.

### Schedule
O schedule não deve ser criado em duplicidade.
A identificação do schedule deve ser estável e documentada.

### Documentação
A documentação final desta task deve ser suficiente para que outra pessoa consiga subir o ambiente local sem depender de memória de conversa.

## Critérios de aceite
A task será considerada pronta se:

- `docker-compose.yml` passar a subir também o MySQL do sistema;
- `.env.example` refletir o estado real mínimo necessário;
- houver rotina clara e estável para garantir o schedule do CSAT de 60 em 60 minutos;
- existir documentação operacional atualizada;
- `pnpm lint` passar;
- `pnpm typecheck` passar;
- houver evidência clara de validação local do runtime, ou documentação honesta e objetiva do que foi validado e do que ainda depende de credenciais/ambiente real.

## Validação esperada
Ao final, deve ser possível:

- subir a stack com Docker;
- iniciar o worker;
- validar que MySQL do sistema e Temporal estão acessíveis;
- garantir o schedule do CSAT;
- executar smoke test controlado do fluxo.

## Atualização de documentação ao final
Ao concluir a task, atualizar:
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/ARCHITECTURE.md
- docs/FIRST_WORKFLOW_OVERVIEW.md
- docs/README.md

Marcar a Task 18 como concluída apenas se os critérios de aceite forem atendidos.
