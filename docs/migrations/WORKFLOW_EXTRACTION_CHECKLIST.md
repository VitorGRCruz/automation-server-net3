# Checklist de extração de lógica do workflow legado

Use esta checklist antes de começar a codar a migração.

## 1. Identificação geral
- Nome do workflow no `automation-old`:
- Arquivos principais relacionados:
- Módulo funcional:
- Objetivo do workflow em 1 frase:

## 2. Gatilho
- Como o workflow começa?
- É manual, schedule, webhook, fila ou outro?
- Quais parâmetros entram?

## 3. Etapas reais
Liste as etapas em ordem.

Para cada etapa, responder:
- nome da etapa;
- o que ela faz;
- qual integração usa;
- qual é o sucesso esperado;
- quais falhas podem ocorrer;
- se a falha é terminal ou permite continuação;
- se existe retry;
- se precisa de idempotência.

## 4. Fechamento do ciclo
- Como o workflow termina em sucesso?
- Como o workflow termina em erro?
- Existe etapa final de auditoria, registro, encaminhamento ou notificação?

## 5. Dependências técnicas
- APIs externas envolvidas:
- Banco(s) consultado(s):
- Funções reutilizáveis já existentes no projeto novo que podem ser reaproveitadas:

## 6. Decisão de migração
Depois do levantamento, decidir:
- quais etapas já existem no `automation-server-net3` e podem ser reutilizadas;
- quais etapas precisam ser implementadas novas;
- quais integrações do legado devem ser descartadas ou refeitas;
- se o workflow será único ou terá child workflows.

## 7. Resultado obrigatório antes de codar
O Codex deve deixar um resumo curto no próprio output com:
- mapa do workflow legado;
- proposta de reconstrução no projeto novo;
- arquivos que pretende criar ou alterar.
