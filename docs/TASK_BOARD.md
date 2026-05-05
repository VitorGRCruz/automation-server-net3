# Quadro de tasks

> Histórico de entrega. Para o retrato atual do runtime, usar `docs/CURRENT_STATE.md`.

## Status geral
- [x] Task 00 - Fundação e reorganização do esqueleto do projeto
- [x] Task 01 - Configuração por ambiente e Docker Compose de desenvolvimento
- [x] Task 02 - Base HTTP com Fastify, plugins e autenticação
- [x] Task 03 - Base Temporal reutilizável (client, worker, task queues, exemplo diagnóstico)
- [x] Task 04 - Contratos compartilhados e taxonomia de erros
- [x] Task 05 - Entrypoints HTTP para ações simples e início de workflows
- [x] Task 06 - Base da integração read-only com MySQL do ERP
- [x] Task 07 - Estrutura do módulo `csat` pronta para receber workflows reais
- [x] Task 08 - Scaffold do primeiro workflow real sem lógica final de negócio
- [x] Task 09 - Implementar trigger de elegíveis do CSAT
- [x] Task 10 - Implementar busca do cliente no OPA no child workflow do CSAT
- [x] Task 11 - Implementar etapa reutilizável de encaminhamento da OS por falha no CSAT
- [x] Task 12 - Implementar busca de contato válido de WhatsApp no OPA
- [x] Task 13 - Encerrar ciclo do CSAT após falha na busca de contato
- [x] Task 14 - Implementar envio de mensagem de WhatsApp via IXC OmniChannel
- [x] Task 15 - Registrar evento de sucesso da mensagem na OS
- [x] Task 16 - Revisão final, refatoração, alinhamento e polimento do workflow de início do CSAT
- [x] Task 17 - Endurecer CSAT para produção e agendar trigger a cada 60 minutos
- [x] Task 18 - Habilitar ambiente e validar prontidão operacional do CSAT
- [x] Task 19 - API — implementar `livez`, `readyz` e `healthz`
- [x] Task 20 - Worker — adicionar health server próprio com `livez`, `readyz` e `healthz`
- [x] Task 21 - Health runtime — finalizar deep health, cache, documentação e validação
- [x] Task 22 - Controlar o fan-out do trigger do CSAT
- [x] Task 23 - Segmentar task queues do Temporal por contexto de execução
- [x] Task 24 - NF-e Email Dispatch — fundação, contratos e modelagem
- [x] Task 25 - NF-e Email Dispatch — Workflow 1 de descoberta de vendas candidatas
- [x] Task 26 - NF-e Email Dispatch — núcleo do Workflow 2 de processamento
- [x] Task 27 - NF-e Email Dispatch — PDF IXC, template, SMTP e finalização completa
- [x] Task 28 - NF-e Email Dispatch — schedules, operação e validação final

## Regras de atualização
- Marcar apenas a task concluída.
- Não marcar tasks futuras por antecipação.
- Ao concluir uma task, registrar em uma linha curta abaixo da checklist o que foi entregue.

## Registro curto de entregas
- Task 00 concluída com reorganização da base HTTP/Temporal, config em código e fluxo de diagnóstico no lugar do exemplo `hello`.
- Task 01 concluída com config por ambiente centralizada, `.env.example` e `docker-compose.yml` de desenvolvimento para API, worker e Temporal.
- Task 02 concluída com plugins locais de auth/erro, healthcheck público e rota manual protegida de diagnóstico.
- Task 03 concluída com client Temporal reutilizável, bootstrap organizado do worker e task queues iniciais alinhadas ao projeto.
- Task 04 concluída com taxonomia compartilhada de erros transitórios/permanentes, base de resultados tipados e adaptação mínima do diagnóstico para usar os novos contratos.
- Task 05 concluída com rota manual síncrona de diagnóstico, rota HTTP para iniciar workflow Temporal e respostas curtas com `ok`, `workflowId` e `runId`.
- Task 06 concluída com configuração por ambiente do ERP MySQL, client read-only isolado, normalização inicial de erros e arquivo dedicado para queries futuras.
- Task 07 concluída com estrutura inicial do módulo `csat`, contratos tipados do fluxo e placeholders explícitos para workflow pai, child workflow e activities futuras.
- Task 08 concluída com a orquestração principal do workflow `csat`, child workflow por item e registro explícito dos pontos de entrada para trigger failure e desfecho final.
- Task 09 concluída com query real de elegíveis, retry em duas rodadas, fan-out mínimo e validação local com `pnpm lint` e `pnpm typecheck`.
- Task 10 concluída com client OPA, activity real de busca do cliente e ajuste do child workflow para preservar `opaIdCliente` ou falha padronizada, com `pnpm lint` e `pnpm typecheck` passando.
- Task 11 concluída com client IXC em Basic Auth, activity reutilizável para encaminhar a OS por falha e ajuste do child workflow para encerrar a trilha de falha da busca no OPA, com `pnpm lint` e `pnpm typecheck` passando.
- Task 12 concluída com activity real de busca de contato no endpoint `contato` do OPA, priorização `Whatsapp` -> `Celular`, normalização de número válido e ajuste do child workflow para seguir para envio ou encaminhar a OS por falha, com `pnpm lint` e `pnpm typecheck` passando.
- Task 13 concluída com fechamento explícito do child workflow após falha na busca de contato, propagação de `motivo_falha` para a action reutilizável de encaminhar a OS e encerramento terminal quando o fechamento via IXC falha, com `pnpm lint` e `pnpm typecheck` passando.
- Task 14 concluída com envio real via `botaoAjax_22282` do IXC OmniChannel, contrato tipado de sucesso/falha com `motivoFalha`, proteção local contra duplicidade por execução e ajuste do child workflow para seguir ao próximo passo lógico ou encaminhar a OS por falha, com `pnpm lint` e `pnpm typecheck` passando.
- Task 15 concluída com registro real do evento de sucesso na OS via `su_oss_chamado_mensagem`, contrato tipado para `success`, `permanent`, `transient`, `response-error` e `html`, retry manual em 3 tentativas só para falhas transitórias no child workflow e validação com `pnpm lint` e `pnpm typecheck`.
- Task 16 concluída com revisão final do fluxo inicial do CSAT, parser compartilhado para mutações do IXC, idempotência local também no encaminhamento da OS, padronização de logs por etapa e validação com `pnpm lint` e `pnpm typecheck`.
- Task 17 concluída com idempotência durável do CSAT em MySQL próprio do sistema, migration/runner explícitos, rotina idempotente para garantir o `Temporal Schedule` horário do trigger e validação com `pnpm lint` e `pnpm typecheck`.
- Task 18 concluída com `docker-compose` incluindo MySQL do sistema, `.env.example` alinhado ao runtime real, entrypoints para validar MySQL/schedule do CSAT e documentação final de operação local e prontidão.
- Task 19 concluída com camada de health da API em `src/app/health/`, endpoints `livez`/`readyz`/`healthz`, alias temporário `GET /health`, cache curto configurável e validação com `pnpm typecheck` e `pnpm lint`.
- Task 20 concluída com health server próprio do worker via `node:http`, estado em memória para bootstrap/execução, endpoints `livez`/`readyz`/`healthz` e validação com `pnpm typecheck` e `pnpm lint`.
- Task 21 concluída com deep health da API cobrindo Temporal, MySQL do sistema, ERP, OPA e IXC, deep health do worker alinhado ao runtime central, TTLs separados por endpoint de health, documentação operacional final e pendência explícita de proteger o `healthz` detalhado se houver exposição fora da rede interna.
- Task 22 concluída com fan-out controlado no trigger do CSAT, contadores explícitos de início/skip/falha, `workflowId` estável por `idOs` e validação com `pnpm typecheck` e `pnpm lint`.
- Task 23 concluída com segmentação de task queues em `automation-control`/`automation-erp-read`/`automation-opa`/`automation-ixc`, workers especializados, roteamento explícito de activities e validação com `pnpm typecheck` e `pnpm lint`.
- Task 24 concluída com fundação do módulo `nfe`, contratos tipados, migration `003` das tabelas da automação, repositório inicial no `system-db`, config base por env, scaffold local dos workflows e build copiando o template HTML para `dist`, validado com `pnpm typecheck`, `pnpm lint` e `pnpm build`.
- Task 25 concluída com o Workflow 1 de descoberta de `nfe`, activities de load/fetch/enqueue, query ERP por cliente, child workflow com cálculo de `effectiveStart`, parent workflow com paralelismo máximo de 5 children e registro das activities/workflows no runtime, validado com `pnpm typecheck` e `pnpm lint`.
- Task 26 concluída com o núcleo do Workflow 2 de `nfe`, activities de load/claim/fetch-context/finalize, query ERP do contexto de e-mail, child workflow por venda com `attemptStartedAt` estável, finalização idempotente de status e parent workflow com paralelismo máximo de 5 children, validado com `pnpm typecheck` e `pnpm lint`.
- Task 27 concluída com busca do PDF da NF-e via IXC, persistência temporária em volume compartilhado, render seguro do template HTML, envio via `sendSmtpEmailActivity` sem retry automático, mapeamento completo de status finais no child workflow e validação com `pnpm typecheck`, `pnpm lint` e `pnpm build`.
- Task 28 concluída com schedules oficiais de discovery e processing do `nfe`, scripts `ensure/describe/delete`, verificação explícita para impedir processing durante discovery, documentação operacional dedicada e validação com `pnpm typecheck`, `pnpm lint` e `pnpm build`.
- API externa de `nfe` concluída com `POST /api/nfe/email-dispatch/customers`, consultas paginadas de clientes/vendas com filtros, service HTTP dedicado, upsert idempotente no `system-db` e validação com `pnpm typecheck` e `pnpm lint`.
- API externa de `nfe` ampliada com `DELETE /api/nfe/email-dispatch/customers`, contagem de vendas por status em `GET /api/nfe/email-dispatch/sales/status-counts`, filtro por `last_attempt_at` e validação com `pnpm typecheck` e `pnpm lint`.
- Migração `equipment-retrieval-verification` concluída com query legada adaptada para activity no ERP, criação da OS `104` via IXC com idempotência durável, workflow pai com recovery em 2 horas e child workflow por `idReceber`, validado com `pnpm lint` e `pnpm typecheck`.
- Ajuste operacional concluído com `Temporal Schedule` oficial do trigger de `cobrancas`, intervalo padrão de 30 minutos, env dedicado de `startAt` e scripts para garantir/inspecionar/remover o schedule.
- Modo dev/test run-scoped concluído com `runtimePolicy` opcional nos workflows reais de `csat`, `cobrancas` e `nfe`, escopo lógico por `testRunId` para workflow IDs/idempotência/NF-e, scripts `temporal:dev:*`, migration `004_add_nfe_runtime_scope.sql` e validação com `pnpm typecheck`, `pnpm lint` e `pnpm build`.
