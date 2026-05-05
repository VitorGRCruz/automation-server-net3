# CSAT - Fechamento do ciclo após falha na busca de contato

## Objetivo
Encerrar corretamente o ciclo do workflow de início da pesquisa de satisfação quando a etapa de busca do contato do cliente no OPA falhar.

Esta etapa não implementa uma nova integração com o IXC.
Ela reutiliza a ação já existente de encaminhar a ordem de serviço para outro setor, criada anteriormente para registrar falhas operacionais no ERP/IXC.

## Papel desta etapa
Esta etapa acontece depois da falha da task 12, que tenta localizar um contato válido de WhatsApp do cliente no OPA.

Quando a task 12 falha, ela deve produzir um `motivo_falha` compatível com as regras definidas na própria etapa.
Esse motivo deve ser usado para acionar a ação reutilizável de encaminhamento da OS.

O objetivo aqui é garantir que:
- a falha da busca de contato não deixe o ciclo aberto;
- a OS seja encaminhada para o setor correto usando a ação reutilizável já existente;
- o workflow seja encerrado depois desse encaminhamento;
- não exista duplicação da lógica de integração com o IXC.

## Dependências
Esta etapa depende de:
- `id_os`, vindo do registro retornado pelo trigger do CSAT;
- `motivo_falha`, produzido pela task 12 em caso de insucesso na busca de contato;
- a ação reutilizável de encaminhar OS por falha, implementada anteriormente.

## Entrada esperada
A etapa deve receber, no mínimo:

```ts
type CsatCloseCycleAfterContactFailureInput = {
  idOs: number;
  motivoFalha: string;
};
```

## Regra principal
Se a task 12 falhar e produzir um `motivo_falha`, o workflow deve:
1. chamar a ação reutilizável de encaminhar OS por falha;
2. passar `id_os` como `id_chamado`;
3. passar `motivo_falha` como `mensagem`;
4. aguardar o resultado dessa ação;
5. encerrar o workflow após a conclusão dessa etapa.

## Comportamento esperado

### Caso 1 - Encaminhamento da OS concluído com sucesso
Se a ação reutilizável registrar corretamente o encaminhamento da OS:
- considerar o ciclo encerrado com sucesso operacional de fechamento;
- não executar etapas posteriores;
- finalizar o workflow do cliente.

### Caso 2 - Encaminhamento da OS falhar
Se a ação reutilizável falhar:
- respeitar integralmente a política definida na própria ação reutilizável;
- não recriar regras de retry nesta etapa;
- não duplicar classificação de erro aqui;
- deixar que a própria ação determine se a falha é terminal.

Se a ação reutilizável encerrar com falha terminal:
- considerar o workflow encerrado com falha terminal;
- não executar etapas posteriores.

## Regras de arquitetura

### Esta etapa deve:
- apenas orquestrar o fechamento do ciclo;
- chamar a ação reutilizável já existente;
- manter o fluxo legível e didático;
- encerrar o workflow ao final.

### Esta etapa não deve:
- reimplementar a chamada ao endpoint do IXC;
- duplicar a lógica da task 11;
- redefinir política de retry do encaminhamento;
- criar uma integração paralela para o mesmo objetivo.

## Reutilização
A ação de encaminhar OS por falha é reutilizável em outros pontos do módulo CSAT.
Esta etapa da task 13 apenas registra o uso dessa ação especificamente após falha na busca de contato do cliente no OPA.

## Fora de escopo
Esta etapa não deve implementar:
- nova integração HTTP com o IXC;
- busca de contato no OPA;
- envio de mensagem;
- qualquer continuação do fluxo após o fechamento do ciclo.

## Resultado esperado desta etapa
Ao final desta etapa, o sistema deve ser capaz de:
- detectar a falha da task 12;
- usar o `motivo_falha` gerado nessa etapa;
- chamar a ação reutilizável de encaminhamento da OS;
- encerrar corretamente o ciclo do workflow após essa chamada.
