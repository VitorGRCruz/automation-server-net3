# CSAT Trigger - Busca de Elegíveis

## Objetivo
Executar o trigger inicial do módulo CSAT (pesquisa de satisfação), consultando o banco MySQL do ERP para obter os registros elegíveis para o primeiro disparo da pesquisa.

Este trigger será executado por agendamento a cada 60 minutos.

## Papel desta etapa
Esta etapa representa o início do workflow de CSAT.

Ela é responsável por:
- executar a consulta de elegíveis no ERP;
- encerrar o trigger sem continuar caso não haja registros;
- iniciar o processamento independente de cada registro retornado;
- aplicar a política de retry do trigger em caso de erro transitório ou desconhecido;
- encerrar imediatamente em caso de erro permanente.

## Frequência
- Executar a cada 60 minutos.

## Fonte de dados
- Banco MySQL do ERP
- Acesso somente leitura

## Query inicial
```sql
SELECT
  cc.id_cliente,
  cc.id AS id_contrato,
  os.id AS id_os,
  c.razao AS nome_cliente,
  os.id_ticket,
  cc.id_filial
FROM cliente_contrato cc
JOIN cliente c ON c.id = cc.id_cliente
JOIN su_oss_chamado os
  ON os.id_contrato_kit = cc.id
 AND os.id_assunto = 94
WHERE cc.id IN (38804, 39171)
ORDER BY os.id ASC;
```

## Observação importante
A cláusula `WHERE cc.id IN (38804, 39171)` deve ser tratada como uma condição inicial da versão atual.
Não assumir que isso é a regra final de negócio permanente.
A implementação deve permitir futura evolução da query sem exigir refatoração estrutural do workflow.

## Estrutura mínima de retorno por registro
Cada linha retornada pela consulta deve ser mapeada para o seguinte contrato:

```ts
type CsatEligibleRecord = {
  idCliente: number;
  idContrato: number;
  idOs: number;
  nomeCliente: string;
  idTicket: number | null;
  idFilial: number;
};
```

## Regras de negócio da etapa

### Caso 1 - Consulta bem sucedida e sem registros
Se a consulta for executada com sucesso e retornar zero registros:
- considerar o trigger concluído com sucesso;
- não iniciar child workflows;
- não executar outras etapas do fluxo.

### Caso 2 - Consulta bem sucedida e com registros
Se a consulta for executada com sucesso e retornar um ou mais registros:
- considerar o trigger bem sucedido;
- para cada registro, iniciar um fluxo independente;
- cada registro deve seguir o mesmo trilho de processamento, mas com execução independente dos demais.

## Política de retry do trigger

### Erro permanente
Se a consulta falhar por erro permanente:
- considerar o trigger encerrado com falha terminal;
- não realizar retry;
- encerrar a execução imediatamente.

### Erro transitório ou desconhecido
Se a consulta falhar por erro transitório ou desconhecido:
- realizar até 3 tentativas no contexto da execução atual;
- se ainda falhar após essas 3 tentativas, aguardar 3 minutos;
- iniciar uma nova tentativa de execução do trigger;
- essa nova tentativa também terá até 3 tentativas;
- se falhar novamente após a segunda rodada, considerar falha terminal e encerrar.

## Classificação inicial de erros

### Erros transitórios
Devem ser tratados como transitórios, por exemplo:
- falha temporária de conexão com MySQL;
- timeout de conexão;
- erro de rede;
- indisponibilidade temporária do serviço de banco.

### Erros permanentes
Devem ser tratados como permanentes, por exemplo:
- credenciais inválidas;
- banco/schema inexistente;
- SQL inválido;
- coluna ou tabela inexistente;
- configuração inválida que impeça a execução corretamente.

### Erros desconhecidos
Qualquer erro não classificado explicitamente como permanente deve ser tratado como transitório nesta etapa.

## Responsabilidades da implementação

### O workflow deve
- orquestrar a execução do trigger;
- decidir entre encerrar, repetir ou iniciar child workflows;
- manter a lógica da política de retry em alto nível;
- permanecer simples e legível.

### A activity deve
- executar a query no MySQL do ERP;
- mapear os registros retornados;
- classificar falhas como transitórias ou permanentes;
- nunca conter lógica de orquestração do workflow.

## Fora de escopo desta etapa
Esta etapa não deve implementar:
- busca de cliente na plataforma de atendimento;
- busca de contatos;
- validação de telefone;
- envio de mensagem;
- registro final na ordem de serviço;
- regras completas do child workflow.

## Resultado esperado desta etapa
Ao final desta etapa, o sistema deve ser capaz de:
- executar o trigger do CSAT;
- consultar elegíveis no ERP;
- encerrar corretamente quando não houver dados;
- iniciar processamento independente por registro retornado;
- aplicar a política de retry definida para o trigger.
