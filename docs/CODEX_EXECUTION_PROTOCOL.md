# Protocolo de execução para Codex

## Regra central
O agente deve trabalhar com **escopo estreito e verificável**. Nunca assumir memória de sessões anteriores.

## Leitura obrigatória por task
Sempre ler:
- `docs/README.md`
- `docs/PROJECT_RULES.md`
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`
- a task ativa em `docs/tasks/`

Se não houver task ativa, tratar `docs/tasks/` e `docs/specs/` como histórico e usar `docs/CURRENT_STATE.md` + o documento operacional pertinente como base principal.

## Como executar uma task
1. Ler os documentos obrigatórios.
2. Resumir mentalmente o objetivo em uma frase.
3. Alterar apenas os arquivos permitidos pela task.
4. Validar a saída com typecheck ou comando indicado.
5. Atualizar `docs/CURRENT_STATE.md` e `docs/TASK_BOARD.md` no final.
6. Parar ao concluir o escopo; não seguir para a próxima task automaticamente.

## Proibições
- Não expandir escopo por conta própria.
- Não criar refactors paralelos.
- Não mover muitas peças de uma vez sem task específica.
- Não introduzir bibliotecas extras sem necessidade clara.
- Não reescrever a arquitetura em nome de "melhorias" não pedidas.

## Dúvidas e conflitos
Se houver conflito entre código atual e docs, obedecer esta prioridade:
1. `docs/PROJECT_RULES.md`
2. task ativa
3. `docs/ARCHITECTURE.md`
4. estado atual do código

## Saída padrão esperada do agente
Ao terminar, responder no formato:
1. resumo curto do que foi feito;
2. arquivos alterados;
3. validação executada;
4. pendências ou riscos;
5. confirmação de atualização de `docs/CURRENT_STATE.md` e `docs/TASK_BOARD.md`.
