# NF-e Email Dispatch — pacote de implementação

## Objetivo

Implementar o módulo `nfe` no `automation-server-net3` para descobrir vendas com NF-e emitida no ERP IXC e enviar automaticamente a NF-e por e-mail usando Temporal, MySQL da automação, API IXC, SMTP e template HTML.

## Leitura recomendada

Antes de codar qualquer task, ler:

1. `docs/README.md`
2. `docs/PROJECT_RULES.md`
3. `docs/CODEX_EXECUTION_PROTOCOL.md`
4. `docs/CURRENT_STATE.md`
5. `docs/TASK_BOARD.md`
6. `docs/ARCHITECTURE.md`
7. `docs/TEMPORAL_RULES.md`
8. `docs/ERROR_CLASSIFICATION.md`
9. `docs/INTEGRATIONS_RULES.md`
10. Este diretório: `docs/specs/nfe-email-dispatch/`
11. A task ativa em `docs/tasks/24...` até `docs/tasks/28...`

## Ordem dos documentos deste diretório

```text
00-contexto-e-mapa-de-implementacao.md
01-modelagem-banco-automacao.md
02-workflow-1-fetch-customer-nfe-sales-candidates.md
03-workflow-2-process-nfe-email-dispatch-sales.md
04-template-email-pdf-e-smtp.md
05-checklist-de-aceite.md
06-prompt-codex-para-comecar.md
```

## Abordagem de implementação

A implementação deve ser feita por tasks pequenas e verificáveis:

1. **Task 24** — fundação do módulo, contratos, modelagem e migration das tabelas.
2. **Task 25** — Workflow 1 de descoberta e enfileiramento de vendas candidatas.
3. **Task 26** — núcleo do Workflow 2: seleção, claim, consulta ERP, validação de e-mail e gravação final sem ainda fechar PDF/e-mail completo.
4. **Task 27** — busca do PDF via IXC, renderização do template, envio SMTP sem retry e atualização final completa.
5. **Task 28** — schedules, operação, Docker/volume temporário, documentação final e validação.

## Regra de prioridade em conflitos

Em caso de conflito, obedecer esta ordem:

1. `docs/PROJECT_RULES.md`
2. task ativa em `docs/tasks/`
3. este pacote de specs `docs/specs/nfe-email-dispatch/`
4. `docs/ARCHITECTURE.md`
5. código atual do projeto
6. documentos históricos antigos dentro de `docs/tasks/` ou `docs/specs/`

## Escopo funcional da automação

A automação terá dois workflows principais:

```text
Workflow 1 — fetchCustomerNfeSalesCandidates
  Descobre vendas com NF-e pronta no ERP e insere jobs PENDING no banco da automação.

Workflow 2 — processNfeEmailDispatchSales
  Processa jobs PENDING/FAILED_TRANSIENT, baixa o PDF da NF-e, envia e-mail e grava status final.
```

## Fora do escopo da primeira entrega

Não implementar nesta primeira trilha:

- telas administrativas;
- relatórios operacionais;
- cadastro via rota HTTP;
- rotina de recuperação automática de `IN_PROGRESS` antigo;
- limpeza periódica de arquivos temporários;
- reestruturação ampla dos módulos existentes `csat` e `cobrancas`;
- troca da arquitetura de workers do projeto.
