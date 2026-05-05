# CSAT - Registrar evento de sucesso da mensagem na OS

## Objetivo
Registrar no histórico da ordem de serviço que a mensagem de WhatsApp foi enviada com sucesso ao cliente.

Esta etapa só deve ser executada após o sucesso real da etapa de envio da mensagem via IXC OmniChannel.

## Papel desta etapa
Esta etapa representa o fechamento bem-sucedido do ciclo principal do workflow de início da pesquisa de satisfação.

Ela é responsável por:
- chamar a API do IXC para registrar um evento no histórico da ordem de serviço;
- validar se a operação foi realmente concluída com sucesso;
- aplicar a política de retry apenas para falhas transitórias;
- encerrar o workflow com sucesso quando o registro do evento for confirmado;
- encerrar o workflow com falha quando o registro não puder ser concluído.

## Dependências de entrada
Esta etapa depende de:
- `id_os`, obtido a partir do contexto da ordem de serviço em processamento;
- `contato_whatsapp`, obtido da task anterior e efetivamente utilizado no envio da mensagem.

## Integração
- Serviço: IXC
- Endpoint: `su_oss_chamado_mensagem`
- Método: `POST`

## Payload
```json
{
  "id_chamado": "<id_os>",
  "mensagem": "<contato_whatsapp>",
  "status": "A",
  "id_evento": "18",
  "tipo_cobranca": "NENHUM",
  "finaliza_processo": "N"
}
```

## Origem dos dados do payload
- `<id_os>`: deve vir do contexto do registro atual do workflow;
- `<contato_whatsapp>`: deve ser o mesmo número validado e utilizado na etapa de envio da mensagem.

## Regra de execução
Esta etapa só pode ser chamada quando a task de envio da mensagem tiver sido concluída com sucesso real.

Se a etapa anterior falhou, esta etapa não deve ser executada.

## Validação obrigatória da resposta
A validação do resultado **não pode** considerar apenas o status HTTP da requisição.

Também é obrigatório validar:
- o conteúdo da resposta;
- o campo `type`;
- o `content-type` da resposta.

## Exemplos de retorno com sucesso técnico, mas falha de operação

### Exemplo 1
```json
{
  "type": "error",
  "message": "Preencha Mensagem",
  "atualiza_campos": [
    {
      "tipo": "s",
      "campo": "tipo_cobranca",
      "valor": "NENHUM"
    }
  ]
}
```

### Exemplo 2
```json
{
  "type": "error",
  "message": "Recurso su_oss_chamado_mensagem não está disponível!"
}
```

## Retorno com `content-type: text/html`
Qualquer retorno com `content-type` igual a `text/html` deve ser tratado como erro.

## Cenários e tratamento

### Caso 1 - Sucesso técnico com erro de negócio
Se a requisição for concluída tecnicamente, mas a resposta vier com `type = "error"`:
- tratar como falha definitiva;
- não realizar retry;
- encerrar o ciclo do workflow com erro;
- não chamar nenhuma próxima etapa.

### Caso 2 - Retorno em `text/html`
Se a resposta vier com `content-type = text/html`:
- tratar como falha definitiva;
- não realizar retry;
- encerrar o ciclo do workflow com erro;
- não chamar nenhuma próxima etapa.

### Caso 3 - Erro permanente na requisição
Se ocorrer erro permanente:
- tratar como erro terminal;
- não realizar retry;
- encerrar o ciclo do workflow com erro;
- não chamar nenhuma próxima etapa.

### Caso 4 - Erro transitório na requisição
Se ocorrer erro transitório:
- realizar até 3 tentativas de retry com intervalos espaçados;
- implementar retry com cuidado em relação à idempotência;
- garantir que o registro não seja criado duplicadamente por engano;
- se, após 3 tentativas, continuar falhando, tratar como falha definitiva;
- encerrar o ciclo do workflow com erro;
- não chamar nenhuma próxima etapa.

### Caso 5 - Sucesso real
Se a API confirmar sucesso real da operação:
- considerar a task concluída com sucesso;
- encerrar o workflow com sucesso;
- não chamar nenhuma nova etapa.

## Regras de idempotência
Esta etapa precisa ser segura para retry.

A implementação deve evitar:
- criação duplicada do mesmo evento;
- repetição incorreta da chamada em cenários de incerteza;
- conflito causado por reenvio indevido do mesmo registro.

A solução de idempotência deve ser didática, explícita e coerente com as regras gerais do projeto.

## Classificação esperada de falhas

### Falhas permanentes
Exemplos:
- payload estruturalmente inválido;
- endpoint/recurso indisponível de forma definitiva;
- resposta incompatível com a operação esperada;
- qualquer erro de negócio retornado em `type = "error"`.

### Falhas transitórias
Exemplos:
- timeout;
- falha momentânea de rede;
- indisponibilidade temporária do serviço;
- falhas temporárias do servidor IXC.

## Responsabilidades da implementação

### O workflow deve:
- chamar a activity responsável por registrar o evento;
- decidir retry apenas em caso de falha transitória;
- encerrar o workflow com sucesso ou erro conforme o resultado final;
- permanecer simples e legível.

### A activity deve:
- executar a chamada real para o IXC;
- montar o payload corretamente;
- validar `content-type`;
- validar o campo `type`;
- classificar falhas;
- implementar o comportamento esperado para a integração.

## Fora de escopo desta etapa
Esta etapa não deve:
- encaminhar OS para outro setor;
- enviar mensagem ao cliente;
- buscar contato;
- buscar cliente no OPA;
- iniciar novas etapas após sucesso.

## Resultado esperado desta etapa
Ao final desta etapa, o sistema deve ser capaz de:
- registrar no histórico da OS que a mensagem foi enviada com sucesso;
- encerrar o workflow com sucesso quando o registro for confirmado;
- encerrar com erro quando o registro falhar definitivamente.
