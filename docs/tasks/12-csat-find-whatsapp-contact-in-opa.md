# Task 12 - Implementar busca de contato válido de WhatsApp no OPA

## Objetivo
Implementar a etapa do child workflow de CSAT responsável por localizar um contato válido de WhatsApp do cliente no OPA, usando o `opa_id_cliente` obtido na etapa anterior.

## Leitura obrigatória antes de codar
- docs/README.md
- docs/PROJECT_RULES.md
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/ARCHITECTURE.md
- docs/TEMPORAL_RULES.md
- docs/INTEGRATIONS_RULES.md
- docs/ERROR_CLASSIFICATION.md
- docs/specs/csat-child-find-customer-in-opa.md
- docs/specs/csat-forward-os-on-failure.md
- docs/specs/csat-find-whatsapp-contact-in-opa.md

## Escopo permitido
O agente pode alterar apenas:
- src/temporal/workflows/csat/**
- src/temporal/activities/csat/**
- src/integrations/opa/**
- src/domain/csat/**
- src/domain/shared/**
- src/infra/**
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md

## Não pode
- não implementar envio de mensagem da task 14;
- não implementar registro final de sucesso na OS;
- não alterar o comportamento já consolidado do trigger do CSAT;
- não mover a arquitetura base do projeto;
- não criar abstrações genéricas sem uso real;
- não colocar parsing técnico da resposta do OPA dentro do workflow;
- não alterar rotas HTTP sem necessidade direta desta task.

## Entregáveis obrigatórios

### 1. Contrato tipado de resultado da etapa
Criar um contrato claro para o resultado da busca de contato no OPA.

Exemplo esperado:
```ts
type FindWhatsappContactResult =
  | { status: "success"; contatoWhatsapp: string }
  | { status: "failure"; motivoFalha: string };
```

### 2. Activity real de busca de contato no OPA
Criar uma activity para consultar o endpoint `contato` no OPA usando `opa_id_cliente`.

Essa activity deve:
- chamar a API real do OPA;
- validar `content-type`;
- validar presença e formato de `data`;
- localizar exclusivamente o contato do titular;
- analisar o campo `fones` do titular;
- priorizar telefone do tipo `Whatsapp`;
- se necessário, tentar telefone do tipo `Celular`;
- validar se o número encontrado é válido para uso em WhatsApp;
- devolver sucesso com `contatoWhatsapp` ou falha com `motivoFalha`.

### 3. Classificação formal de falhas
A implementação deve distinguir claramente:
- falhas de negócio sem retry;
- falhas permanentes sem retry;
- falhas transitórias com retry.

## Motivos de falha obrigatórios
A implementação deve usar exatamente estes motivos quando aplicável:

- `NENHUM CONTATO ENCONTRADO NO OPA`
- `FALHA AO BUSCAR CONTATO DO CLIENTE NO OPA`
- `CONTATO DO TITULAR NÃO ENCONTRADO NO OPA`
- `NENHUM CONTATO DO TITULAR REGISTRADO NO OPA`
- `O TITULAR NÃO POSSUI CONTATO PARA WHATSAPP NO OPA`
- `O TITULAR NÃO POSSUI WHATSAPP VÁLIDO NO OPA`
- `FALHA NO SERVIDOR AO BUSCAR CONTATO DO CLIENTE`

## Regras de implementação

### Workflow
O workflow deve:
- chamar a activity de busca de contato;
- seguir para a task 14 se vier sucesso com `contatoWhatsapp`;
- seguir para a etapa de encaminhamento da OS se vier falha com `motivoFalha`;
- permanecer simples e legível.

O workflow não deve:
- interpretar o payload bruto da API do OPA;
- conter a lógica de busca do titular;
- conter a lógica de escolha entre `Whatsapp` e `Celular`.

### Activity
A activity deve conter:
- chamada real ao OPA;
- análise da resposta;
- validações de negócio;
- escolha do número;
- classificação de falhas;
- retry somente para falhas transitórias.

## Regras de retry

### Falhas sem retry
Não deve haver retry quando ocorrer:
- `data` vazio;
- retorno `text/html`;
- ausência de titular;
- ausência de `fones` do titular;
- ausência total de telefone `Whatsapp` e `Celular`;
- número encontrado mas inválido para WhatsApp;
- erro permanente.

### Falhas com retry
Deve haver retry com espaçamento entre tentativas, até 3 vezes, quando ocorrer:
- erro transitório de comunicação com o OPA;
- timeout;
- falha temporária de rede;
- indisponibilidade temporária do serviço.

Se ainda falhar após as 3 tentativas:
- tratar como erro terminal;
- devolver o motivo:

```ts
"FALHA NO SERVIDOR AO BUSCAR CONTATO DO CLIENTE"
```

## Critérios de aceite
A task será considerada pronta se:

- existir activity real de busca de contato no OPA;
- a activity localizar exclusivamente o titular;
- a prioridade `Whatsapp` -> `Celular` estiver implementada corretamente;
- apenas números válidos para WhatsApp forem aceitos;
- o resultado de sucesso devolver `contatoWhatsapp`;
- o resultado de falha devolver `motivoFalha` correto;
- o workflow decidir corretamente entre task 13 e task 14;
- `pnpm typecheck` passar;
- `pnpm lint` passar;
- não houver lógica técnica da API do OPA dentro do workflow.

## Validação esperada
Executar localmente cenários em que:
- a API retorna `data` vazio;
- a API retorna `text/html`;
- a API retorna registros sem titular;
- a API retorna titular sem `fones`;
- a API retorna titular com `Whatsapp` válido;
- a API retorna titular sem `Whatsapp`, mas com `Celular` válido;
- a API retorna telefone existente, porém inválido para WhatsApp;
- a API apresenta falha transitória simulada/classificada.

## Atualização de documentação ao final
Ao concluir a task, atualizar:
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md

Marcar a Task 12 como concluída apenas se todos os critérios de aceite forem atendidos.
