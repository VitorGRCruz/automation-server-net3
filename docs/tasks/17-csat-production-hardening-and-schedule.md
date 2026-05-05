# Task 17 - Endurecer CSAT para produção e agendar trigger a cada 60 minutos

## Objetivo
Preparar o workflow de início da pesquisa de satisfação do módulo CSAT para produção, substituindo a idempotência local por idempotência durável compartilhada e criando o schedule oficial do trigger para execução automática a cada 60 minutos.

## Leitura obrigatória antes de codar
- docs/README.md
- docs/PROJECT_RULES.md
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/ARCHITECTURE.md
- docs/TEMPORAL_RULES.md
- docs/ERROR_CLASSIFICATION.md
- docs/FIRST_WORKFLOW_OVERVIEW.md
- docs/specs/csat-production-hardening-and-schedule.md

## Escopo permitido
O agente pode alterar apenas:
- src/temporal/**
- src/infra/**
- src/domain/shared/**
- src/domain/csat/**
- src/integrations/**
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/ARCHITECTURE.md
- docs/FIRST_WORKFLOW_OVERVIEW.md
- docs/** (somente se necessário para operação do schedule e idempotência)

## Não pode
- não alterar regra de negócio do fluxo do CSAT;
- não criar novos módulos além do necessário para a infraestrutura desta task;
- não mover o workflow para outra arquitetura;
- não colocar lógica de banco ou idempotência diretamente no workflow;
- não introduzir abstrações genéricas sem uso real;
- não adicionar ferramentas externas de observabilidade;
- não alterar rotas HTTP sem necessidade direta desta task.

## Contexto
Após a task 16, o CSAT está funcional, porém a idempotência ainda é local e não é suficiente para produção com segurança.

Também é necessário que o trigger passe a ser iniciado automaticamente por schedule, com execução a cada 60 minutos.

## Entregáveis obrigatórios

### 1. Remover dependência da idempotência local para o CSAT
A estratégia atual baseada em `tmpdir()` ou equivalente local não deve continuar sendo a proteção principal do fluxo do CSAT em produção.

A implementação do CSAT deve passar a usar idempotência durável compartilhada.

### 2. Criar armazenamento durável para idempotência
Implementar persistência compartilhada para controle de idempotência usando o banco MySQL próprio do sistema.

A solução deve incluir:
- estrutura persistente para registrar execuções idempotentes;
- operação atômica de reserva/verificação;
- atualização clara do status final da execução;
- código didático e reutilizável.

Se o projeto já tiver convenção para migrações, seguir a convenção existente.
Se ainda não houver convenção formal, criar a estrutura mínima necessária de forma simples e explícita.

### 3. Criar helper/repositório reutilizável de idempotência durável
Criar um componente reutilizável para as activities mutáveis do CSAT.

Esse componente deve, no mínimo:
- reservar execução por chave idempotente;
- detectar sucesso anterior;
- permitir marcar falha/sucesso;
- devolver estado suficiente para a activity decidir o comportamento;
- manter código simples, didático e rastreável.

### 4. Aplicar a idempotência durável nas mutações críticas do CSAT
Aplicar a nova estratégia, no mínimo, nas seguintes activities:
- encaminhar OS por falha;
- enviar mensagem ao cliente;
- registrar evento final de sucesso na OS.

### 5. Garantir que o workflow permaneça limpo
O workflow do CSAT deve continuar apenas como orquestrador.

Não mover a lógica de persistência da idempotência para dentro do workflow.

### 6. Criar o schedule oficial do CSAT
Implementar a rotina oficial para garantir o schedule do trigger do CSAT via Temporal Schedule.

Requisitos:
- execução a cada 60 minutos;
- nome estável do schedule;
- uso seguro em repetição, sem criar duplicatas;
- input coerente para o workflow pai;
- fácil execução em ambiente de produção.

### 7. Definir configuração do schedule
Introduzir configuração clara para o schedule, por exemplo:
- nome do schedule;
- habilitação do schedule;
- intervalo/frequência;
- task queue, se aplicável.

### 8. Atualizar documentação operacional
Atualizar a documentação do projeto para refletir:
- novo mecanismo de idempotência durável;
- etapas protegidas por idempotência;
- como aplicar migração/estrutura do banco;
- como garantir o schedule do CSAT;
- como validar o schedule localmente e em produção.

## Regras de implementação

### Sobre o banco
Usar MySQL como armazenamento da idempotência durável desta task.

### Sobre a chave de idempotência
A chave deve ser estável, previsível e ligada ao contexto da ação.

A mesma ação mutável, para o mesmo contexto de negócio, deve produzir a mesma chave.

### Sobre envio de mensagem
A proteção deve evitar envio duplicado da mesma mensagem ao mesmo cliente/contato em cenários de retry ou reinício.

### Sobre encaminhamento da OS
A proteção deve evitar múltiplos encaminhamentos do mesmo chamado pelo mesmo motivo.

### Sobre o evento final de sucesso
A proteção deve evitar duplicidade no histórico da OS.

### Sobre schedule
A rotina de criação/garantia do schedule deve ser segura para reexecução.
Se o schedule já existir, a rotina deve atualizar/garantir o estado desejado sem criar duplicidade.

## Critérios de aceite
A task será considerada pronta se:

- a idempotência local deixar de ser a proteção principal do CSAT;
- existir persistência durável compartilhada para idempotência;
- as 3 mutações críticas do CSAT estiverem protegidas por essa nova estratégia;
- o workflow continuar limpo como orquestrador;
- existir rotina clara para garantir o schedule do CSAT a cada 60 minutos;
- a documentação estiver atualizada;
- `pnpm lint` passar;
- `pnpm typecheck` passar.

## Validação esperada
Executar, no mínimo, as seguintes validações:

### Idempotência
- repetir a mesma activity mutável com a mesma chave de contexto e confirmar que a mutação externa não é duplicada;
- validar comportamento após reinício do processo/worker;
- validar que múltiplas tentativas não geram efeito duplicado na ação crítica.

### Schedule
- garantir o schedule do CSAT;
- confirmar que ele aparece como ativo;
- validar que o schedule inicia o workflow pai com o input esperado;
- validar que a periodicidade configurada corresponde a 60 minutos.

## Atualização de documentação ao final
Ao concluir a task, atualizar:
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/ARCHITECTURE.md
- docs/FIRST_WORKFLOW_OVERVIEW.md

Se necessário, criar também um documento curto de operação, por exemplo:
- `docs/CSAT_PRODUCTION_OPERATION.md`

## Ao terminar
O agente deve informar:
1. resumo do que foi feito;
2. arquivos alterados;
3. como validar localmente;
4. riscos ou pendências restantes.
