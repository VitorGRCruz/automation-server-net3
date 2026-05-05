# Classificação de erros e políticas de retry

## Objetivo
Criar uma linguagem única para o projeto inteiro ao tratar falhas.

## Categorias obrigatórias
### 1. Erro transitório
Falha que pode desaparecer com nova tentativa, sem mudança de input.

Exemplos:
- timeout temporário;
- conexão recusada momentaneamente;
- indisponibilidade temporária da API;
- falha intermitente de rede.

**Tratamento padrão:** permitir retry, preferencialmente por Retry Policy da activity.

### 2. Erro permanente
Falha que não será resolvida repetindo imediatamente com o mesmo input.

Exemplos:
- credencial inválida;
- recurso inexistente;
- payload inválido;
- endpoint removido;
- tabela/campo incorreto por erro de implementação.

**Tratamento padrão:** não retry automático infinito; devolver resultado claro para decisão do workflow.

### 3. Resultado de negócio negativo
Não é exatamente erro técnico; é uma condição legítima do domínio.

Exemplos:
- trigger sem elegíveis;
- cliente não encontrado na plataforma;
- contato titular ausente;
- número não disponível ou inválido.

**Tratamento padrão:** não lançar exceção genérica. Devolver resultado explícito para o workflow decidir o próximo passo.

## Regras do projeto
1. Nem toda ausência de dado é erro técnico.
2. O workflow deve tomar decisões de fluxo com base em resultados claros.
3. Activities devem lançar erros técnicos classificados ou devolver resultados de negócio tipados.
4. Erros que geram side effect importante e precisam de registro de negócio devem ser encaminhados à etapa apropriada, não escondidos em log.

## Convenção sugerida
Criar tipos/estruturas compartilhadas equivalentes a:
- `TransientIntegrationError`
- `PermanentIntegrationError`
- resultados de negócio explícitos por etapa

## Casos obrigatórios de auditoria de negócio
Mesmo sem persistir auditoria operacional fora do Temporal, existem falhas que precisam de registro de negócio próprio, especialmente:
- falha terminal do trigger;
- falha em etapa final de registro que, se omitida, faz o processo “sumir” do ponto de vista operacional.

## Retry manual de negócio
Quando a regra pedir algo como:
- tentar 3 vezes;
- esperar 30 minutos;
- tentar mais 3 vezes;
- depois encerrar como terminal,

isso deve ser modelado no workflow, usando retry declarativo de activity para as tentativas curtas e timer/espera durável para o novo ciclo.
