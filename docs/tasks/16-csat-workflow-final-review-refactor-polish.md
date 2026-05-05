# Task 16 - Revisão final, refatoração, alinhamento e polimento do workflow de início do CSAT

## Objetivo
Revisar e polir a implementação completa do workflow de início da pesquisa de satisfação do módulo CSAT, melhorando organização, consistência, legibilidade e segurança estrutural antes da continuidade do projeto e preparação para produção.

## Leitura obrigatória antes de codar
- docs/README.md
- docs/PROJECT_RULES.md
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/ARCHITECTURE.md
- docs/TEMPORAL_RULES.md
- docs/ERROR_CLASSIFICATION.md
- docs/FIRST_WORKFLOW_OVERVIEW.md
- docs/specs/csat-trigger-elegibles.md
- docs/specs/csat-child-find-customer-in-opa.md
- docs/specs/csat-forward-os-on-failure.md
- docs/specs/csat-find-whatsapp-contact-in-opa.md
- docs/specs/csat-close-cycle-after-contact-failure.md
- docs/specs/csat-send-whatsapp-message-via-ixc.md
- docs/specs/csat-register-success-event-on-os.md
- docs/specs/csat-workflow-final-review-and-polish.md

## Escopo permitido
O agente pode alterar:
- src/temporal/workflows/csat/**
- src/temporal/activities/csat/**
- src/integrations/erp/**
- src/integrations/opa/**
- src/integrations/ixc/**
- src/domain/csat/**
- src/domain/shared/**
- src/infra/**
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/FIRST_WORKFLOW_OVERVIEW.md
- docs/ARCHITECTURE.md

## Não pode
- não criar novos workflows de negócio além do que já existe no fluxo de início do CSAT
- não alterar o comportamento de negócio sem necessidade clara
- não reescrever o módulo inteiro do zero
- não introduzir abstrações genéricas sem uso real
- não espalhar lógica técnica por dentro dos workflows
- não alterar rotas HTTP sem necessidade direta desta task
- não introduzir novas integrações externas
- não criar observabilidade externa nova nesta task

## Entregáveis obrigatórios

### 1. Revisão arquitetural do fluxo
Garantir que:
- workflows estejam atuando como orquestradores;
- activities contenham integração e validação da etapa;
- helpers e regras pequenas estejam em locais apropriados;
- o módulo esteja mais didático para manutenção.

### 2. Alinhamento de nomenclatura
Revisar e ajustar quando necessário:
- nomes de arquivos
- nomes de funções
- nomes de workflows e activities
- tipos
- constantes de falha
- nomes de variáveis com significado de negócio

### 3. Redução de duplicação real
Extrair apenas duplicações que já estejam claras no módulo, especialmente:
- classificação de falhas
- validações repetidas
- construção de respostas internas padronizadas
- mecanismos internos de proteção contra duplicidade, se houver repetição óbvia

### 4. Revisão de idempotência
Revisar com atenção as etapas que interagem com IXC ou que podem ser executadas mais de uma vez.
Melhorar segurança contra duplicidade quando já houver material suficiente para isso sem criar arquitetura desnecessária.

### 5. Polimento dos logs
Melhorar logs para que:
- informem melhor o caminho da execução;
- tragam contexto útil;
- não sejam excessivamente técnicos;
- não poluam a leitura.

### 6. Atualização da documentação
Atualizar:
- docs/CURRENT_STATE.md
- docs/TASK_BOARD.md
- docs/FIRST_WORKFLOW_OVERVIEW.md
- docs/ARCHITECTURE.md

A documentação deve refletir o estado real após esta revisão final.

## Critérios de aceite
A task será considerada pronta se:

- o fluxo completo do CSAT estiver coerente de ponta a ponta;
- a separação entre workflow, activity, integration e domain estiver melhor ou pelo menos correta;
- nomes e arquivos estiverem mais consistentes;
- duplicações desnecessárias evidentes tiverem sido tratadas;
- não houver regressão clara de comportamento;
- a documentação estiver atualizada;
- `pnpm typecheck` passar;
- `pnpm lint` passar;
- se houver suíte existente, os testes relevantes passarem.

## Validação esperada
O agente deve revisar e validar, no mínimo, os seguintes cenários do fluxo:

- trigger sem elegíveis
- trigger com elegíveis
- falha ao buscar cliente no OPA e fechamento correto do ciclo
- sucesso na busca do cliente e falha ao buscar contato
- sucesso na busca do contato e falha no envio da mensagem
- sucesso no envio da mensagem e sucesso no registro final da OS
- falha terminal na etapa final de registro da OS

## Observação importante
Esta task é de refinamento do que já existe.
A prioridade é melhorar o que foi construído, sem explodir o escopo e sem transformar o módulo em algo mais complexo do que precisa ser.

## Atualização final
Ao concluir a task:
- atualizar `CURRENT_STATE.md`
- atualizar `TASK_BOARD.md`
- marcar a Task 16 como concluída
- deixar claro na documentação que o workflow inicial do CSAT passou por revisão final e ficou pronto para servir como base para os próximos fluxos do módulo
