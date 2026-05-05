# CSAT Production Enablement and Final Validation

## Objetivo
Concluir a habilitação operacional do ambiente do projeto para que o workflow de início da pesquisa de satisfação do módulo CSAT possa ser executado com segurança em ambiente próximo de produção.

Esta etapa não cria novas regras de negócio do workflow.
Ela existe para fechar as pendências de ambiente, configuração, validação operacional e documentação final.

## Contexto
Após a task 17, a arquitetura do workflow do CSAT já foi endurecida para produção, incluindo:
- idempotência durável para mutações críticas;
- schedule do Temporal para o trigger do CSAT;
- organização final da arquitetura e documentação.

Porém ainda restaram pendências operacionais:
- o `docker-compose.yml` atual não sobe o MySQL próprio do sistema;
- o ambiente ainda depende de configuração manual de novas variáveis;
- a integração real com MySQL e Temporal não foi validada neste ambiente;
- o schedule precisa ser validado operacionalmente.

## Escopo desta etapa
Esta task deve:
- completar a infraestrutura local mínima para executar o sistema com os serviços necessários;
- documentar e expor corretamente as variáveis de ambiente obrigatórias;
- validar a conectividade entre aplicação, MySQL do sistema e Temporal;
- validar o schedule do trigger do CSAT;
- executar smoke tests operacionais do fluxo;
- atualizar a documentação final de execução local e prontidão.

## O que precisa ficar funcional

### 1. Docker Compose com MySQL do sistema
O `docker-compose.yml` deve passar a subir também o banco próprio do sistema, além da stack já necessária para execução local.

Este MySQL próprio do sistema será usado para:
- dados internos do sistema;
- especialmente o mecanismo durável de idempotência do CSAT.

## Requisitos do MySQL do sistema
- deve existir container próprio;
- deve ter volume persistente local;
- deve ter credenciais configuráveis por variáveis de ambiente;
- deve expor porta configurável ou claramente documentada;
- deve estar integrado ao app para uso local.

## 2. Variáveis de ambiente
As variáveis de ambiente necessárias para o ambiente operacional local devem ser documentadas e refletidas em arquivo de exemplo.

No mínimo, devem existir grupos claros para:

### Temporal
- host/target do Temporal
- namespace
- task queue
- schedule habilitado ou não
- identificação do schedule do CSAT

### MySQL do sistema
- host
- port
- database
- user
- password

### ERP MySQL
- host
- port
- database
- user
- password

### Integrações externas
- credenciais/URLs do OPA
- credenciais/URLs do IXC

### API local
- porta
- autenticação básica, se aplicável ao ambiente local

## Regra importante
O `.env.example` deve refletir o estado real necessário para subir e validar o ambiente.

## 3. Validação do runtime
A task deve garantir que seja possível subir e validar localmente, de forma documentada:

- stack Docker necessária;
- aplicação/worker;
- conexão com o MySQL do sistema;
- conexão com o Temporal;
- execução do worker;
- criação/garantia do schedule do trigger do CSAT.

## 4. Schedule do CSAT
O trigger do CSAT deve ficar operacional com agendamento a cada 60 minutos.

## Requisitos do schedule
- deve existir rotina clara para criar ou garantir a existência do schedule;
- a rotina não deve criar schedules duplicados;
- deve haver identificação estável do schedule;
- deve existir documentação explicando como habilitar, recriar, remover ou validar o schedule.

## 5. Smoke tests obrigatórios
A task deve prever e documentar a validação dos principais cenários mínimos do workflow do CSAT.

### Cenários mínimos esperados
1. Trigger executa e não encontra elegíveis.
2. Trigger executa e encontra elegíveis.
3. Falha ao buscar cliente no OPA e encaminhamento da OS é disparado.
4. Falha ao buscar contato no OPA e fechamento do ciclo acontece corretamente.
5. Falha ao enviar mensagem e fechamento do ciclo acontece corretamente.
6. Sucesso completo até o registro final na OS.
7. Reexecução controlada para verificar proteção de idempotência nas mutações críticas.

## 6. Idempotência
A validação operacional deve confirmar que as mutações críticas não sejam executadas em duplicidade indevida durante retries ou reexecuções.

As mutações críticas mínimas são:
- encaminhar OS por falha;
- enviar mensagem;
- registrar evento final de sucesso na OS.

## Runbook operacional mínimo
### Subir a infraestrutura local mínima
```bash
docker compose up -d temporal system-db
```

### Aplicar a migration da tabela de idempotência
```bash
node --env-file-if-exists=.env --import tsx src/infra/system-db/run-system-db-migrations.ts
```

### Confirmar conectividade com MySQL do sistema e tabela durável
```bash
node --env-file-if-exists=.env --import tsx src/infra/system-db/check-system-db-runtime.ts
```

Resultado esperado:
- conexão bem-sucedida com o MySQL do sistema;
- leitura da tabela `workflow_step_idempotency`;
- retorno de contadores por status para a idempotência durável.

### Iniciar worker e validar Temporal ponta a ponta
Em um terminal separado:

```bash
pnpm temporal:worker
```

Em outro terminal:

```bash
pnpm temporal:start
```

Resultado esperado:
- o worker conecta na fila `automation-main`;
- o workflow de diagnóstico executa com sucesso;
- isso valida client, worker, workflow e activity no runtime local.

### Garantir, validar e recriar o schedule do CSAT
Garantir ou atualizar:

```bash
node --env-file-if-exists=.env --import tsx src/temporal/client/ensure-csat-trigger-schedule.ts
```

Inspecionar:

```bash
node --env-file-if-exists=.env --import tsx src/temporal/client/describe-csat-trigger-schedule.ts
```

Recriar:

```bash
node --env-file-if-exists=.env --import tsx src/temporal/client/delete-csat-trigger-schedule.ts
node --env-file-if-exists=.env --import tsx src/temporal/client/ensure-csat-trigger-schedule.ts
```

Resultado esperado:
- `scheduleId` estável;
- intervalo de `60` minutos;
- ausência de duplicidade;
- `source = schedule` no payload do action input.
- após remoção, o `describe` pode levar alguns segundos para refletir `exists = false` no Temporal local.

## Smoke tests operacionais controlados
### Validado diretamente nesta task
- lint e typecheck do repositório;
- `docker-compose.yml` com Temporal + MySQL do sistema;
- migration explícita do MySQL do sistema;
- checagem do runtime do MySQL do sistema e da tabela `workflow_step_idempotency`;
- caminho operacional de worker + workflow de diagnóstico do Temporal;
- ciclo de garantir, inspecionar e remover/recriar o schedule do CSAT.

### Ainda dependente de ambiente externo real
- trigger sem elegíveis no ERP;
- trigger com elegíveis reais;
- encaminhamento da OS por falha no IXC;
- envio de mensagem com proteção contra duplicidade;
- registro final de sucesso sem duplicidade indevida.

Para esses cenários, a validação deve ocorrer com:
- credenciais reais de ERP, OPA e IXC;
- massa controlada para evitar disparos indevidos;
- consulta posterior à tabela `workflow_step_idempotency` para confirmar ausência de repetição perigosa.

## Resultado esperado
Ao final desta task, o projeto deve ficar:
- executável em ambiente local completo;
- com variáveis de ambiente claramente configuráveis;
- com MySQL do sistema integrado à stack local;
- com schedule do CSAT operacional;
- com documentação suficiente para subir, validar e operar localmente;
- pronto para homologação final e posterior promoção para produção.

## Fora de escopo
Esta task não deve:
- criar novos workflows de negócio;
- alterar a lógica do fluxo do CSAT sem necessidade operacional;
- mudar regras funcionais já aprovadas;
- introduzir observabilidade externa complexa;
- reestruturar a arquitetura fora do necessário para habilitação do ambiente.
