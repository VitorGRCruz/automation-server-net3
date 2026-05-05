# Migração de workflows do `automation-old` para `automation-server-net3`

Use estes markdowns quando o projeto `automation-old` estiver aberto no mesmo workspace do VS Code junto com o `automation-server-net3`.

## Objetivo
Migrar workflows antigos para o novo ambiente com Temporal **sem copiar código cegamente**.

## Ordem de leitura para o Codex
1. `docs/PROJECT_RULES.md`
2. `docs/ARCHITECTURE.md`
3. `docs/TEMPORAL_RULES.md`
4. `docs/migrations/MIGRATION_RULES.md`
5. `docs/migrations/WORKFLOW_EXTRACTION_CHECKLIST.md`
6. `docs/migrations/equipment-retrieval-verification-migration-task.md`

## Ideia central
No projeto antigo, o workflow já existe e contém regra de negócio pronta.
No projeto novo, a arquitetura mudou. Agora usamos:
- workflow Temporal para orquestração;
- activities para integrações e efeitos colaterais;
- organização didática por módulo;
- separação equilibrada, sem arquivos gigantes e sem microarquivos artificiais.

## Resultado esperado
O Codex deve:
- ler o workflow antigo;
- extrair a lógica de negócio e as etapas reais;
- mapear entradas, saídas, bifurcações, retries e integrações;
- reimplementar essa lógica no `automation-server-net3` respeitando a arquitetura nova;
- evitar cópia literal de arquivos, estrutura antiga ou padrões antigos.
