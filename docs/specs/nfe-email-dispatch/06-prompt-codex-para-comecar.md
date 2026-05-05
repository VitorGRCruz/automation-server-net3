# Prompt para o Codex começar a implementação

Use este prompt no Codex depois de copiar este pacote para a raiz do projeto.

```text
Leia obrigatoriamente:
- docs/README.md
- docs/PROJECT_RULES.md
- docs/CODEX_EXECUTION_PROTOCOL.md
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/ARCHITECTURE.md
- docs/TEMPORAL_RULES.md
- docs/ERROR_CLASSIFICATION.md
- docs/INTEGRATIONS_RULES.md
- docs/specs/nfe-email-dispatch/README.md
- docs/specs/nfe-email-dispatch/00-contexto-e-mapa-de-implementacao.md
- docs/specs/nfe-email-dispatch/01-modelagem-banco-automacao.md
- docs/specs/nfe-email-dispatch/04-template-email-pdf-e-smtp.md
- docs/tasks/24-nfe-email-dispatch-foundation-and-modeling.md

Implemente somente a Task 24.
Não implemente ainda o Workflow 1 nem o Workflow 2 completo.

Objetivo desta rodada:
- criar a fundação do módulo nfe;
- criar contratos tipados iniciais;
- criar migration das tabelas da automação;
- registrar a migration no runner;
- inserir o template HTML no caminho definido;
- garantir que o build copie o template para dist;
- preparar a configuração base necessária, sem criar schedules ainda.

Respeite a arquitetura atual:
- workflow só orquestra;
- activity executa I/O;
- ERP segue read-only;
- banco da automação usa system-db;
- SMTP deve reutilizar a integração existente;
- não introduza frameworks ou filas novas;
- não refatore módulos csat/cobrancas fora do necessário.

Ao terminar:
- execute pnpm typecheck;
- execute pnpm lint;
- execute pnpm build se alterar package.json/build/template;
- atualize docs/CURRENT_STATE.md e docs/TASK_BOARD.md;
- responda com resumo, arquivos alterados, validações executadas e pendências.
```

## Próximos prompts

Depois da Task 24, use uma task por vez.

```text
Agora implemente somente a Task 25: docs/tasks/25-nfe-email-dispatch-discovery-workflow.md
```

```text
Agora implemente somente a Task 26: docs/tasks/26-nfe-email-dispatch-processing-core.md
```

```text
Agora implemente somente a Task 27: docs/tasks/27-nfe-email-dispatch-pdf-email-and-finalization.md
```

```text
Agora implemente somente a Task 28: docs/tasks/28-nfe-email-dispatch-schedules-and-operation.md
```
