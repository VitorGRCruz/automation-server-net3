# CSAT - Encaminhar ordem de serviço por falha

## Objetivo
Encerrar com segurança um ciclo do workflow do módulo CSAT quando uma etapa anterior falhar de forma que o fluxo não possa seguir naturalmente.

Esta etapa é responsável por encaminhar a ordem de serviço para um setor específico no ERP via API do IXC, registrando o motivo da falha da última etapa executada.

## Papel desta etapa no workflow
Esta etapa existe para fechar o ciclo de uma execução que não conseguiu seguir para as próximas etapas.

Ela deve ser usada quando:
- uma etapa anterior falhar e impedir a continuidade natural do workflow;
- o workflow precisar registrar no ERP o motivo da falha antes de encerrar;
- o mesmo comportamento precisar ser reutilizado em outros pontos do módulo CSAT.

Exemplos de uso:
- falha ao buscar `opaIdCliente`;
- falha ao buscar contato do cliente no OPA;
- falha no envio da mensagem;
- outros pontos do módulo CSAT em que seja necessário encaminhar a OS com um motivo de falha.

## Reutilização
Esta etapa deve ser preparada para reutilização.

Ela não deve depender exclusivamente do erro da busca de `opaIdCliente`.
Deve receber parâmetros suficientes para ser usada por diferentes etapas do mesmo workflow e também por outros workflows do módulo CSAT.

## Entrada esperada
Contrato mínimo de entrada:

```ts
export type ForwardServiceOrderOnFailureInput = {
  idOs: number;
  failureMessage: string;
};
```

### Significado dos campos
- `idOs`: identificador da ordem de serviço vindo do trigger do CSAT.
- `failureMessage`: motivo padronizado da falha vindo da etapa anterior.

## Integração externa
- Serviço: IXC
- Endpoint: `su_oss_chamado_alterar_setor`
- Método HTTP: `POST`
- Content-Type esperado na resposta válida: `application/json`

## Payload da requisição
```json
{
  "id_chamado": "<id_os>",
  "id_setor": "35",
  "mensagem": "<motivo_falha>",
  "status": "EN"
}
```

### Regras fixas desta etapa
Os seguintes valores fazem parte do comportamento atual da etapa:
- `id_setor = '35'`
- `status = 'EN'`

## Regra principal de sucesso
A etapa só será considerada bem sucedida quando:
- a resposta for JSON válida;
- o HTTP estiver bem sucedido para a requisição;
- o campo `type` da resposta for exatamente `success`.

Exemplo de sucesso:

```json
{
  "type": "success",
  "message": "Registro inserido com sucesso!",
  "id": "263511"
}
```

Neste caso:
- considerar que o registro foi gravado com sucesso no ERP;
- encerrar a execução do child workflow com sucesso funcional;
- não há etapa posterior.

## Observação crítica da API IXC
Mesmo quando a requisição for bem sucedida em nível HTTP, a operação pode ter falhado no serviço.

Por isso, esta etapa deve sempre analisar o campo `type` da resposta.

### Regra obrigatória
- `type = success` -> sucesso real da etapa;
- `type = error` -> falha da etapa;
- resposta HTML / `text/html` -> falha da etapa.

## Retornos conhecidos da API

### 1. Sucesso real
```json
{
  "type": "success",
  "message": "Registro inserido com sucesso!",
  "id": "263511"
}
```

### 2. Erro funcional em JSON
```json
{
  "type": "error",
  "message": "Recurso su_oss_chamado_alterar_setors não está disponível!"
}
```

```json
{
  "type": "error",
  "message": "Versão v1xxx do webservice não está disponível!"
}
```

```json
{
  "type": "error",
  "message": "Preencha ID chamado"
}
```

```json
{
  "type": "error",
  "message": "Ocorreu um erro ao processar. Contate o suporte IXC Soft.",
  "id": "263521"
}
```

### 3. Resposta HTML
A API também pode retornar HTML em vez de JSON válido.
Nesse caso, a etapa deve tratar a resposta como falha terminal.

## Desfechos obrigatórios desta etapa

### Caso 1 - resposta HTTP bem sucedida, mas `type = error`
Se a requisição responder com HTTP bem sucedido, mas o corpo vier com `type = error`:
- tratar como falha terminal;
- não fazer retry;
- encerrar a execução com erro terminal.

Justificativa de negócio:
- nada foi efetivamente alterado no ERP para registrar o fechamento da falha;
- por isso, esse cliente e essa OS aparecerão novamente na próxima execução natural do trigger;
- isso é desejado, porque é como se essa execução não tivesse sido concluída corretamente.

### Caso 2 - resposta HTML ou `content-type` compatível com `text/html`
Se a resposta vier como HTML:
- tratar como falha terminal;
- não fazer retry;
- encerrar a execução com erro terminal.

### Caso 3 - erro permanente
Se a integração falhar por erro permanente:
- tratar como erro terminal;
- não fazer retry;
- encerrar a execução.

### Caso 4 - erro transitório
Se a integração falhar por erro transitório:
- realizar retry até 3 vezes com intervalos bem espaçados;
- cuidar da idempotência para evitar efeitos duplicados;
- se ainda falhar após todos os retries, tratar como erro terminal e encerrar.

## Regra de idempotência
Esta etapa exige atenção especial à idempotência.

Como ela realiza uma alteração no ERP, retries mal controlados podem gerar conflito, duplicidade lógica ou resultados inconsistentes.

A implementação deve considerar que:
- retries transitórios são obrigatórios;
- a operação não pode ser disparada de forma solta e duplicada sem controle;
- a estratégia de retry deve respeitar o modelo do Temporal e a forma como a activity será reexecutada;
- qualquer solução adotada deve priorizar segurança operacional e previsibilidade.

## Classificação inicial de erros

### Transitórios
Exemplos:
- timeout;
- falha temporária de rede;
- indisponibilidade momentânea do serviço IXC;
- resposta 502, 503, 504;
- erro momentâneo de DNS ou conexão.

### Permanentes
Exemplos:
- autenticação inválida persistente;
- endpoint inválido;
- payload inválido;
- ausência estrutural de campo obrigatório;
- resposta JSON incompatível com o contrato esperado;
- erro funcional inequívoco retornado pela API que indique inviabilidade persistente da operação.

### Erros funcionais com `type = error`
Mesmo em HTTP 200, respostas com `type = error` devem ser tratadas como falha terminal da etapa atual, sem retry.

## Saída esperada da etapa
A etapa deve devolver um resultado explícito e reutilizável.

Exemplo de contrato esperado:

```ts
export type ForwardServiceOrderOnFailureResult =
  | {
      status: "success";
      forwardedToSectorId: "35";
    }
  | {
      status: "failed";
      failureType: "terminal";
      shouldBeRetriedByNextTrigger: true;
    };
```

## Comportamento final do workflow

### Em caso de sucesso
Se a ordem de serviço for encaminhada com sucesso:
- considerar o ciclo encerrado corretamente;
- concluir a execução do child workflow;
- não há próxima etapa.

### Em caso de falha desta etapa
Se a etapa falhar de forma terminal:
- encerrar a execução com erro terminal;
- não haverá nova tentativa dentro desta execução além dos retries transitórios definidos;
- o registro reaparecerá na próxima execução do trigger porque nada foi alterado com sucesso no ERP.

## Fora de escopo desta etapa
Esta etapa não deve implementar:
- busca de contato do cliente;
- envio de mensagem;
- criação de novas regras de negócio para o trigger;
- mudanças no comportamento da etapa anterior além do necessário para integrá-la a esta etapa;
- auditoria externa adicional fora do que o projeto já definir.

## Resultado esperado desta etapa
Ao final desta etapa, o sistema deve ser capaz de:
- encerrar um fluxo do CSAT encaminhando a OS por falha;
- reutilizar essa mesma etapa em mais de um ponto do módulo;
- diferenciar sucesso real de erro funcional retornado pelo IXC;
- aplicar retry apenas para falhas transitórias;
- encerrar corretamente quando nem a etapa de fechamento conseguir ser gravada.
