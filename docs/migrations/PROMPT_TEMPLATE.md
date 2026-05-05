# Prompt-base para o Codex

Leia primeiro:
- `docs/PROJECT_RULES.md`
- `docs/ARCHITECTURE.md`
- `docs/TEMPORAL_RULES.md`
- `docs/migrations/MIGRATION_RULES.md`
- `docs/migrations/WORKFLOW_EXTRACTION_CHECKLIST.md`
- `docs/migrations/equipment-retrieval-verification-migration-task.md`

No projeto `automation-old` existe um workflow legado chamado `equipment-retrieval-verification`.
Quero migrá-lo para o projeto `automation-server-net3`.

Importante:
- isso não é uma cópia de código;
- quero a lógica do workflow migrada para o novo modelo com Temporal;
- respeite a arquitetura e organização do `automation-server-net3`;
- não gosto de códigos com mais de 400 linhas;
- não gosto de arquivos artificiais com menos de 5 linhas;
- meu lema é ORGANIZAÇÃO, DIDÁTICA E INTELIGÊNCIA.

Sua tarefa é:
1. localizar e estudar o workflow antigo;
2. mapear a lógica completa antes de codar;
3. reconstruir no projeto novo usando workflow + activities + domain + integrations;
4. atualizar os docs relevantes;
5. executar `pnpm lint` e `pnpm typecheck`.

Ao final, responda com:
- resumo da lógica extraída do legado;
- como ela foi adaptada no projeto novo;
- arquivos alterados;
- validações executadas;
- riscos ou pendências.
