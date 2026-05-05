# CSAT - Endurecimento para Produção e Agendamento do Trigger

## Objetivo
Preparar o workflow de início da pesquisa de satisfação do módulo CSAT para operação em produção, substituindo a idempotência local por uma idempotência durável e compartilhada, e definindo o disparo automático do trigger por meio de um Temporal Schedule executado a cada 60 minutos.

## Motivação
Após a task 16, o fluxo do CSAT já está funcional e organizado, porém a proteção de idempotência ainda é local, baseada em armazenamento temporário do processo. Isso é suficiente para desenvolvimento e homologação controlada, mas não é adequado para produção.

Em produção, o sistema precisa suportar com segurança:
- reinício do processo Node;
- reinício do worker;
- múltiplos workers ou múltiplos containers;
- retries de activities;
- falhas parciais em integrações externas;
- disparo recorrente e automático do trigger.

## Escopo desta etapa
Esta etapa deve preparar o sistema para produção no que diz respeito a:
- idempotência durável e compartilhada nas activities mutáveis do CSAT;
- disparo agendado do trigger a cada 60 minutos;
- documentação operacional mínima para executar essa rotina em produção;
- remoção da dependência da estratégia local de idempotência para o fluxo do CSAT.

## Fora de escopo
Esta etapa não deve:
- alterar regras de negócio do workflow de CSAT;
- criar novos módulos de automação;
- reescrever o workflow do zero;
- adicionar observabilidade externa avançada;
- criar interface administrativa;
- trocar o banco principal do projeto.

## Requisitos funcionais

### 1. Agendamento do trigger
O trigger do workflow de início da pesquisa de satisfação deve ser executado automaticamente a cada 60 minutos.

A implementação deve usar **Temporal Schedule**.

O schedule deve iniciar o workflow pai do CSAT com um payload mínimo, por exemplo:

```ts
{
  requestId: string,
  source: 'schedule'
}
```

O schedule deve ser nomeado de forma clara e estável, por exemplo:
- `csat-start-survey-hourly`

O schedule deve ser idempotente em sua criação e atualização.
Se já existir, a rotina responsável por garantir o schedule não deve criar duplicatas.

### 2. Idempotência durável e compartilhada
A proteção de idempotência das actions mutáveis do CSAT deve sair do armazenamento local e passar a usar persistência durável e compartilhada.

A base escolhida para esta etapa deve ser o banco MySQL próprio do sistema.

A solução deve funcionar corretamente mesmo com:
- múltiplos processos;
- múltiplos containers;
- restart do serviço;
- retries do Temporal.

## Activities que obrigatoriamente devem usar idempotência durável
A proteção durável deve ser aplicada, no mínimo, nas seguintes activities do CSAT:

1. encaminhar OS por falha;
2. enviar mensagem de WhatsApp ao cliente;
3. registrar evento de sucesso no histórico da OS.

## Estratégia de idempotência esperada
A implementação deve adotar uma estratégia didática, explícita e segura.

A recomendação mínima é uma tabela dedicada para controle de idempotência.

Exemplo conceitual de estrutura:

```sql
CREATE TABLE workflow_step_idempotency (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  workflow_name VARCHAR(120) NOT NULL,
  workflow_id VARCHAR(255) NOT NULL,
  step_name VARCHAR(120) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  execution_status VARCHAR(40) NOT NULL,
  external_reference VARCHAR(255) NULL,
  payload_hash VARCHAR(255) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_workflow_step_idempotency (workflow_name, step_name, idempotency_key)
);
```

A estrutura exata pode variar, desde que preserve:
- unicidade por ação crítica;
- possibilidade de detectar repetição;
- persistência durável;
- rastreabilidade mínima;
- uso simples e didático.

## Comportamento esperado da idempotência
Cada activity mutável deve:
1. calcular uma chave de idempotência estável;
2. verificar/reservar a execução de forma atômica;
3. impedir reexecução perigosa da mesma ação quando já houver sucesso anterior;
4. permitir tratamento consistente em caso de falha;
5. registrar o resultado final da mutação.

## Requisitos para a chave de idempotência
A chave de idempotência deve ser determinística e construída com base no contexto do negócio.

Exemplos de composição aceitável:
- workflow name;
- workflow id;
- nome da etapa;
- id da ordem de serviço;
- id do cliente;
- contato_whatsapp, quando relevante.

A mesma ação crítica executada para o mesmo contexto de negócio deve resultar na mesma chave.

## Requisitos para activities mutáveis

### Encaminhar OS por falha
A idempotência deve evitar múltiplos encaminhamentos acidentais da mesma OS com o mesmo motivo.

### Enviar mensagem ao cliente
A idempotência deve evitar envio duplicado da mesma mensagem para o mesmo cliente/contato durante retries ou reinícios.

### Registrar evento final de sucesso na OS
A idempotência deve evitar gravação duplicada do evento de sucesso no histórico da ordem de serviço.

## Requisitos de integração com o workflow
O workflow deve permanecer limpo e continuar apenas como orquestrador.

A lógica de persistência da idempotência não deve poluir o workflow.
Ela deve ficar encapsulada em activities, helpers reutilizáveis e/ou infraestrutura interna.

## Requisitos de agendamento em produção
Deve existir uma rotina clara para garantir o schedule do CSAT em produção.

Essa rotina pode ser, por exemplo:
- um script dedicado executado no deploy;
- uma rotina explícita iniciada manualmente pelo operador;
- um comando interno do projeto.

O importante é que a rotina seja:
- determinística;
- repetível;
- segura para executar mais de uma vez;
- documentada.

## Requisitos operacionais mínimos
A documentação final deve deixar claro:
- como subir a stack necessária;
- como aplicar a migração da tabela de idempotência;
- como garantir o schedule do CSAT;
- como validar se o schedule está ativo;
- quais variáveis de ambiente são obrigatórias;
- quais activities do CSAT estão protegidas por idempotência durável.

## Variáveis e configuração
A implementação deve introduzir, se necessário, configuração clara e didática para:
- conexão com o banco próprio usado pela idempotência;
- nome do schedule do CSAT;
- intervalo do schedule;
- habilitação do schedule em ambientes controlados.

## Regras de falha
A idempotência durável não deve mascarar erro real de integração.

Ela deve:
- bloquear duplicidade perigosa;
- preservar o comportamento de retry quando ainda fizer sentido;
- registrar status suficiente para depuração;
- continuar permitindo que falhas reais sejam tratadas como falhas.

## Requisitos de documentação
Ao final da task, a documentação deve refletir o estado real do projeto em produção.

No mínimo, devem ser atualizados:
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- `docs/ARCHITECTURE.md`
- `docs/FIRST_WORKFLOW_OVERVIEW.md`

Se fizer sentido, também pode ser criado um documento curto para operação do schedule e da idempotência.

## Resultado esperado desta etapa
Ao final desta task, o projeto deve estar apto para operação controlada em produção do workflow de início do CSAT, com:
- trigger agendado a cada 60 minutos;
- proteção durável contra duplicidade nas mutações críticas;
- workflow mantendo papel de orquestrador;
- documentação atualizada e coerente com a execução real.
