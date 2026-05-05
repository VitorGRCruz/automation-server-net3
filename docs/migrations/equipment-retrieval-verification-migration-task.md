# Task de migração - `equipment-retrieval-verification`

## Contexto
No workspace existem dois projetos:
- `automation-old`
- `automation-server-net3`

O workflow `equipment-retrieval-verification` existe no `automation-old` e precisa ser migrado para o `automation-server-net3`.

Esta migração faz parte de uma mudança gradual de ambiente.

## Objetivo
Migrar a lógica do workflow `equipment-retrieval-verification` do projeto antigo para o novo, respeitando o modelo com Temporal e a arquitetura do `automation-server-net3`.

## Regra mais importante
**Não copiar código do legado de forma literal.**

A tarefa é:
- estudar o workflow antigo;
- extrair a lógica e as etapas;
- reconstruir o workflow no projeto novo.

## Leitura obrigatória antes de codar
- `docs/PROJECT_RULES.md`
- `docs/ARCHITECTURE.md`
- `docs/TEMPORAL_RULES.md`
- `docs/migrations/MIGRATION_RULES.md`
- `docs/migrations/WORKFLOW_EXTRACTION_CHECKLIST.md`

## Escopo permitido
O Codex pode ler arquivos do `automation-old` relacionados ao workflow `equipment-retrieval-verification`.

O Codex pode alterar no `automation-server-net3` apenas o necessário em:
- `src/temporal/workflows/**`
- `src/temporal/activities/**`
- `src/domain/**`
- `src/integrations/**`
- `docs/**`

## O que o Codex deve fazer
### Fase 1 - Levantamento
1. Localizar todos os arquivos do workflow `equipment-retrieval-verification` no `automation-old`.
2. Mapear a lógica completa do fluxo.
3. Identificar:
   - entrada;
   - etapas;
   - integrações;
   - regras de decisão;
   - falhas;
   - retries;
   - sucesso final.
4. Resumir a lógica extraída antes de implementar.

### Fase 2 - Reconstrução
5. Propor a estrutura do workflow no `automation-server-net3`.
6. Reutilizar componentes já existentes no projeto novo quando fizer sentido.
7. Criar workflow, activities, tipos e integrações necessários.
8. Garantir que o workflow Temporal fique limpo e apenas orquestre.

### Fase 3 - Finalização
9. Validar `pnpm lint` e `pnpm typecheck`.
10. Atualizar a documentação relevante em `docs/`.

## Restrições importantes
- Não criar arquivo com mais de 400 linhas.
- Não criar microarquivos artificiais com menos de 5 linhas.
- Não copiar e colar código do legado.
- Não levar para o projeto novo padrões ruins do projeto antigo.
- Sempre priorizar organização, didática e inteligência.

## Critérios de aceite
A task só estará pronta quando:
- a lógica do workflow antigo tiver sido mapeada e descrita;
- o workflow novo estiver adaptado ao Temporal;
- a arquitetura do `automation-server-net3` estiver respeitada;
- o código estiver organizado e legível;
- `pnpm lint` passar;
- `pnpm typecheck` passar;
- a documentação da migração estiver atualizada.

## Saída esperada do Codex
Ao terminar, o Codex deve responder com:
1. resumo do workflow legado encontrado;
2. resumo da arquitetura adotada no projeto novo;
3. lista de arquivos alterados;
4. validações executadas;
5. riscos e pendências.
