# Regras de integrações externas

## Integrações implementadas
- MySQL do ERP em modo read-only
- API OPA
- API IXC
- SMTP

## Uso atual no runtime
- `csat` usa ERP read-only, OPA e IXC;
- `cobrancas` usa ERP read-only e IXC;
- SMTP já existe como capacidade compartilhada e como activity durável, mas não está conectado a workflow ou rota de negócio atual.

## Regras obrigatórias
1. Cada integração fica em sua própria pasta.
2. O client técnico não carrega regra de negócio do workflow.
3. Timeout, autenticação, base URL e credenciais vêm de configuração.
4. Falhas técnicas precisam ser normalizadas antes de subir para activity/workflow.
5. O ERP deve continuar sendo tratado como read-only.

## Estrutura atual
```text
src/integrations/
  erp-db/
    erp-db.client.ts
    erp-db.queries.ts
    erp-db.types.ts
  opa/
    opa.client.ts
    opa.types.ts
  ixc/
    ixc.client.ts
    ixc-mutation-response.ts
    ixc.types.ts
  smtp/
    smtp.client.ts
    smtp.types.ts
```

## Convenções por integração
### ERP MySQL
- conexão centralizada;
- SQL concentrado em `erp-db.queries.ts`;
- nada de SQL em rota, workflow ou activity.

Observação importante do estado atual:
- a query de elegíveis do `csat` continua restrita a um filtro fixo de contratos;
- a query de elegíveis de `cobrancas` ainda está hardcoded para um caso específico e não deve ser interpretada como consulta genérica de produção.

### OPA
- autenticação por `Authorization: Bearer <token>`;
- client expõe chamadas de leitura e probe leve autenticado.

### IXC
- autenticação por `Authorization: Basic <base64(id:senha)>`, com origem em `IXC_BASIC_AUTH_CREDENTIAL`;
- client expõe probes leves e mutações reais usadas pelos workflows.

### SMTP
- autenticação por usuário e senha;
- `smtp.config.ts` normaliza `from`, `reply-to` e `tlsServername`;
- o envio compartilhado já usa idempotência durável no MariaDB do sistema.

## Regra de fronteira
- **integração** conversa com o sistema externo;
- **activity** traduz resposta técnica em resultado útil para o workflow;
- **workflow** só consome o resultado final.
