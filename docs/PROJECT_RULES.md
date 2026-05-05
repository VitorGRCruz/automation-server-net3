# Regras permanentes do projeto

## Identidade do projeto
- Nome provisório: `automation-server-net3`
- Objetivo: ambiente completo para automações de processos internos em uma empresa.
- Stack principal: Node.js, TypeScript, Fastify, Temporal, Docker, MariaDB/MySQL, integrações HTTP externas.
- Gerenciador de pacotes: `pnpm`.
- Repositório: projeto único Node, sem monorepo.

## Módulos previstos
- `csat`
- `cobrancas`
- `nfe`

## Primeira entrega real de negócio
Preparar o ambiente completo para viabilizar o primeiro workflow real: **início da pesquisa de satisfação**.

## Princípios obrigatórios
1. **Workflow só orquestra.**
   - Decide ordem, branching, retries, encerramento e child workflows.
   - Não contém acesso direto a banco, HTTP, SMTP ou efeitos colaterais.
2. **Activity executa.**
   - Faz chamadas externas, acesso a banco, parsing, validação e side effects.
3. **Rota HTTP não contém regra de negócio.**
   - Só valida entrada, autentica, chama service/client e devolve resposta.
4. **Integrações externas ficam isoladas.**
   - Clientes de ERP, OPA, IXC e SMTP não devem ficar espalhados pelo projeto.
5. **Arquitetura didática.**
   - Nem arquivos gigantescos, nem excesso de arquivos minúsculos.
   - Como regra prática: evitar arquivos com menos de 5 linhas e evitar arquivos grandes demais por acúmulo de responsabilidades.
6. **Evitar abstrações genéricas antes da hora.**
   - Só extrair abstrações quando houver uso real em mais de um ponto ou ganho claro de legibilidade.
7. **Tipagem explícita.**
   - Entradas, saídas, contratos de integração e resultados de activity devem ser tipados.
8. **Logs simples e legíveis.**
   - Preferir logs estruturados, curtos e consistentes.
9. **Sem fila paralela ao Temporal.**
   - O Temporal é o mecanismo de orquestração assíncrona principal.
10. **Configuração em código por enquanto.**
    - Não introduzir banco ou engine dinâmica para configurar workflows nesta fase.

## Preferências declaradas pelo dono do projeto
- Organização, didática e eficiência sempre.
- Não repetir código sem necessidade.
- Não poluir rotas, workflows ou etapas.
- Não gerar desorganização arquitetural.
- Não manter lixo técnico por apego ao teste inicial.

## Regras de escopo para qualquer alteração
O agente **não deve**:
- mover ou renomear tudo de uma vez sem task específica;
- introduzir NestJS, monorepo, Redis, BullMQ ou frameworks extras de orquestração;
- criar um banco próprio só para logs gerais de execução;
- implementar o workflow completo de negócio fora da trilha de tasks.

## Convenção de nomenclatura
- Rotas: `*.route.ts`
- Plugins Fastify: `*.plugin.ts`
- Workflows: `*.workflow.ts`
- Activities: `*.activity.ts`
- Services de domínio: `*.service.ts`
- Clients de integração: `*.client.ts`
- Tipos/contratos: `*.types.ts`
- Configuração: `*.config.ts` ou `env.ts`

## Convenção de módulos
Cada módulo de negócio terá sua própria árvore quando houver necessidade real. Exemplo:

```text
src/
  temporal/
    workflows/
      csat/
    activities/
      csat/
  domain/
    csat/
  integrations/
    erp-db/
    opa/
    ixc/
```

## Regras de atualização de documentação
Ao concluir uma task, o agente deve atualizar somente:
- `docs/CURRENT_STATE.md`
- `docs/TASK_BOARD.md`

Nenhum outro arquivo de docs deve ser alterado sem necessidade explícita.
