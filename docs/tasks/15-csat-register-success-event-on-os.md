# Task 15 - Registrar evento de sucesso da mensagem na OS

## Objetivo
Implementar a etapa final de sucesso do primeiro workflow de CSAT: registrar no histórico da ordem de serviço que a mensagem de WhatsApp foi enviada com sucesso ao cliente.

## Leitura obrigatória antes de codar
- docs/README.md
- docs/PROJECT_RULES.md
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/ARCHITECTURE.md
- docs/TEMPORAL_RULES.md
- docs/INTEGRATIONS_RULES.md
- docs/ERROR_CLASSIFICATION.md
- docs/specs/csat-send-whatsapp-message-via-ixc.md
- docs/specs/csat-register-success-event-on-os.md

## Escopo permitido
O agente pode alterar apenas:
- src/temporal/workflows/csat/**
- src/temporal/activities/csat/**
- src/integrations/ixc/**
- src/domain/csat/**
- src/domain/shared/**
- src/infra/**
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md

## Não pode
- não implementar novas etapas além do fechamento com sucesso;
- não duplicar lógica já existente de envio de mensagem;
- não criar nova integração de encaminhamento de OS;
- não mover a arquitetura base do projeto;
- não colocar lógica técnica pesada dentro do workflow;
- não criar abstrações genéricas sem uso real;
- não alterar rotas HTTP sem necessidade direta desta task.

## Entregáveis obrigatórios

### 1. Contrato da etapa de registro de sucesso
Criar ou ajustar tipos necessários para representar:
- sucesso real;
- falha permanente;
- falha transitória;
- falha por resposta com `type = "error"`;
- falha por `content-type = "text/html"`.

### 2. Activity real para registrar evento na OS
Criar ou completar a activity responsável por:
- chamar o endpoint `su_oss_chamado_mensagem`;
- montar o payload corretamente;
- validar o `content-type`;
- validar o campo `type`;
- classificar as falhas;
- devolver um resultado claro ao workflow.

### 3. Orquestração da etapa final no workflow
O workflow deve:
- chamar esta activity apenas após o sucesso real da task 14;
- aplicar retry somente em falhas transitórias;
- encerrar com erro em falhas permanentes, `type = "error"`, `text/html` ou esgotamento das tentativas;
- encerrar com sucesso em caso de confirmação real do registro.

## Payload esperado
```json
{
  "id_chamado": "<id_os>",
  "mensagem": "<contato_whatsapp>",
  "status": "A",
  "id_evento": "18",
  "tipo_cobranca": "NENHUM",
  "finaliza_processo": "N"
}
```

## Regras de implementação

### Workflow
O workflow deve conter apenas:
- decisão de caminho;
- retry em alto nível para falhas transitórias;
- encerramento com sucesso ou erro;
- chamada da activity.

Não deve conter:
- detalhes do payload;
- parsing técnico da resposta;
- lógica de integração HTTP.

### Activity
A activity deve conter:
- chamada real ao IXC;
- construção do payload;
- validação do `content-type`;
- validação do campo `type`;
- classificação formal das falhas;
- proteção contra duplicidade indevida em caso de retry.

## Política de retry
Em caso de falha transitória:
- realizar até 3 tentativas com intervalos espaçados;
- se ainda falhar, encerrar o workflow com erro;
- não chamar nenhuma próxima etapa.

Não deve haver retry para:
- `type = "error"`;
- `content-type = "text/html"`;
- erros permanentes.

## Critérios de aceite
A task será considerada pronta se:

- existir activity real para registrar o evento na OS via IXC;
- o workflow só chamar essa etapa após sucesso real da task 14;
- respostas com `type = "error"` forem tratadas como falha definitiva;
- respostas com `content-type = "text/html"` forem tratadas como falha definitiva;
- falhas transitórias tiverem retry seguro;
- a task encerre o workflow com sucesso quando a operação for confirmada;
- `pnpm typecheck` passar;
- `pnpm lint` passar.

## Validação esperada
Executar localmente cenários em que:
- a API retorna sucesso real;
- a API retorna sucesso técnico com `type = "error"`;
- a API retorna `text/html`;
- ocorre falha transitória simulada com retry;
- ocorre falha permanente.

## Atualização de documentação ao final
Ao concluir a task, atualizar:
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md

Marcar a Task 15 como concluída apenas se todos os critérios de aceite forem atendidos.
