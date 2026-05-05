# Regras de migração de workflows legados

## Regra principal
**Não copiar o workflow antigo para dentro do projeto novo.**

A migração deve ser uma **reconstrução orientada por lógica**, não uma cópia de código.

## O que o Codex deve fazer
1. Ler o workflow antigo por completo.
2. Identificar:
   - objetivo do workflow;
   - gatilho de entrada;
   - etapas reais;
   - integrações externas;
   - decisões e bifurcações;
   - motivos de falha;
   - políticas de retry;
   - condição de sucesso final.
3. Reescrever a lógica no modelo do `automation-server-net3`.

## O que o Codex não pode fazer
- Não copiar e colar arquivos do `automation-old` para o projeto novo.
- Não transportar helpers antigos automaticamente.
- Não reproduzir arquitetura antiga.
- Não colocar lógica técnica dentro do workflow Temporal.
- Não criar arquivos com menos de 5 linhas sem necessidade real.
- Não criar arquivos com mais de 400 linhas.
- Não inventar abstrações genéricas sem uso real.

## Mapeamento obrigatório
Toda migração deve produzir este mapeamento antes de alterar código:
- nome do workflow antigo;
- objetivo funcional;
- input inicial;
- output final;
- lista de etapas;
- integração usada em cada etapa;
- regra de transição entre etapas;
- erros terminais;
- erros transitórios;
- pontos de idempotência.

## Estrutura-alvo no projeto novo
- `src/temporal/workflows/<modulo>/...`
- `src/temporal/activities/<modulo>/...`
- `src/integrations/...`
- `src/domain/<modulo>/...`

## Regra de separação
### Workflow
Deve conter apenas:
- ordem das etapas;
- decisões de caminho;
- chamada de activities;
- child workflows quando fizer sentido;
- encerramento com sucesso ou falha.

### Activity
Deve conter:
- chamadas externas;
- parsing de payloads;
- classificação de falhas;
- validações técnicas e de negócio da etapa.

### Domain / types
Deve conter:
- contratos;
- motivos de falha;
- resultados tipados;
- utilitários de regra de negócio reaproveitáveis.

## Regra de qualidade
A migração só está pronta quando:
- a lógica do workflow antigo estiver preservada;
- a arquitetura do projeto novo estiver respeitada;
- os nomes estiverem claros;
- o código estiver didático;
- não houver cópia cega do legado.
