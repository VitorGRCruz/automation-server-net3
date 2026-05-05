# Visão do primeiro workflow real: CSAT início da pesquisa

## Objetivo funcional
Iniciar a pesquisa de satisfação para clientes elegíveis, respeitando trigger, retries, validações, idempotência durável e registro final do desfecho por item.

## Estado atual
O workflow de `csat` continua sendo a principal referência arquitetural do projeto para fluxos reais com:
- trigger por schedule;
- fan-out controlado;
- child workflow por item;
- uso combinado de ERP, OPA, IXC e MariaDB do sistema;
- proteção durável contra duplicidade nas mutações do IXC.

## Fluxo real implementado hoje
1. O trigger oficial é operado por `Temporal Schedule` com intervalo configurável.
2. O workflow pai consulta elegíveis no ERP read-only.
3. Quando a origem é `schedule`, o workflow pai resolve o `requestId` a partir do `workflowId` real da execução.
4. Se a consulta vier vazia, o workflow encerra sem children.
5. Se a consulta falhar por erro transitório ou desconhecido, o workflow aplica duas rodadas com espera durável de 3 minutos entre elas.
6. Se a consulta falhar terminalmente, a falha final do trigger é registrada por activity leve em `automation-control`.
7. Para cada item elegível, o workflow pai tenta iniciar um child workflow com `workflowId` estável por `idOs`.
8. O child workflow busca o cliente no OPA.
9. Se o cliente não puder ser resolvido, o child workflow encaminha a OS para o setor de falha no IXC e encerra o item.
10. Se o cliente existir, o child workflow busca o contato do titular no OPA, priorizando `Whatsapp` e depois `Celular`.
11. Se não houver contato válido, o child workflow encaminha a OS por falha e encerra o item.
12. Se houver contato válido, o child workflow envia a mensagem inicial pelo IXC OmniChannel.
13. Se o envio falhar de forma terminal, o child workflow encaminha a OS por falha e encerra o item.
14. Se o envio for confirmado, o child workflow registra o evento final de sucesso na OS.
15. As três mutações do IXC usam idempotência durável no MariaDB do sistema.

## Decomposição arquitetural atual
### Workflow pai
- busca elegíveis;
- aplica retry de trigger;
- registra falha terminal do trigger;
- faz o fan-out controlado.

### Child workflow por item
- resolve cliente;
- resolve contato;
- envia mensagem;
- registra evento de sucesso;
- encaminha a OS quando o item falha.

### Activities centrais
- `fetchCsatEligibleItemsActivity`
- `findOpaCustomerActivity`
- `findWhatsappContactActivity`
- `forwardServiceOrderOnFailureActivity`
- `sendCsatMessageActivity`
- `registerCsatSuccessEventOnOsActivity`

## Operação real hoje
- a fila de workflow é `automation-control`;
- o fluxo completo depende também dos workers `automation-erp-read`, `automation-opa` e `automation-ixc`;
- `pnpm temporal:worker` sobe só o worker de controle e não executa o fluxo de negócio completo sozinho;
- não existe hoje uma rota HTTP nem um script dedicado para disparar manualmente o trigger de `csat`; o caminho operacional encapsulado no projeto é o schedule do Temporal.

## Validação operacional local
Para validar a infraestrutura usada por esse fluxo:

```bash
docker compose up -d temporal system-db
pnpm temporal:workers:all
pnpm temporal:ensure:csat-schedule
pnpm temporal:describe:csat-schedule
```

Se você também quiser subir a API nesse cenário:

```bash
pnpm docker:dev:up:api
```

O workflow de diagnóstico continua útil para validar a infraestrutura Temporal sem acionar regra de negócio:

```bash
pnpm temporal:start
```

## Limitações atuais que impactam este fluxo
- a query de elegíveis do ERP continua com filtro fixo por contrato;
- os smoke tests de negócio exigem credenciais reais de ERP, OPA e IXC, além de massa controlada;
- `GET /healthz` detalhado da API continua público no código atual e deve ficar em rede interna.

## Resultado atual
O fluxo inicial de `csat` está implementado e continua sendo a melhor referência do projeto para:
- uso de workflows + child workflows;
- roteamento por task queue especializada;
- side effects com idempotência durável;
- operação explícita de schedule fora do bootstrap.
