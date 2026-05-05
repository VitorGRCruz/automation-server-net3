# NF-e Email Dispatch — template, PDF e SMTP

## Objetivo

Definir como o Workflow 2 deve montar o e-mail de NF-e, anexar o PDF e usar a infraestrutura SMTP existente do projeto sem gerar duplicidade em retries.

## Template HTML

O template HTML fornecido deve ser inserido em:

```text
src/domain/nfe/templates/nfe-email-template.html
```

O arquivo está incluído neste pacote em:

```text
project-insert/src/domain/nfe/templates/nfe-email-template.html
```

## Variáveis do template

O template usa estes placeholders:

```text
{{nome_cliente}}
{{numero_nf}}
{{valor_total}}
{{nfe_chave}}
```

A activity de renderização deve substituir os placeholders após escapar os valores vindos do ERP.

## Escape obrigatório

Antes de inserir no HTML, escapar:

```text
&  -> &amp;
<  -> &lt;
>  -> &gt;
"  -> &quot;
'  -> &#39;
```

Campos a escapar:

```text
nome_cliente
numero_nf
valor_total
nfe_chave
```

`valor_total` deve ser formatado como moeda brasileira antes da substituição. Como o template já contém `R$ {{valor_total}}`, a string renderizada deve ser apenas o valor numérico formatado, por exemplo:

```text
1.234,56
```

Não renderizar `R$ R$ 1.234,56`.

## Packaging do template no build

O build atual do projeto executa `tsc` e copia apenas migrations do sistema para `dist`.

Como o runtime Docker copia apenas `dist`, o template HTML precisa ser copiado para o `dist` durante o build.

Ajustar o script `build` do `package.json` para copiar também:

```text
src/domain/nfe/templates/*.html
```

para:

```text
dist/domain/nfe/templates/
```

O helper de leitura do template deve preferir resolver o arquivo a partir do módulo compilado, por exemplo por `import.meta.url`, para funcionar em desenvolvimento e produção.

## Busca do PDF na API IXC

A activity `fetchNfePdfFromIxcActivity` deve chamar a API IXC:

```text
POST imprimir_nota
Payload: { "id": <id_venda>, "base64": "S" }
```

Retorno esperado:

```text
text/html contendo o base64 do PDF da NF-e
```

## Normalização do retorno da API IXC

Mesmo com HTTP 200, validar o conteúdo:

1. resposta não vazia;
2. extrair/normalizar o texto base64;
3. remover espaços desnecessários se o retorno vier embrulhado em HTML;
4. validar que o conteúdo parece base64;
5. decodificar para `Buffer`;
6. validar `buffer.length > 0`;
7. validar que `buffer.subarray(0, 4).toString()` é `%PDF`.

Se qualquer validação falhar:

```text
status final do job = FAILED_FINAL
```

## Salvamento temporário

Salvar PDFs em:

```text
/var/tmp/nfe-email-dispatch
```

Config sugerida:

```text
NFE_EMAIL_DISPATCH_PDF_TMP_DIR=/var/tmp/nfe-email-dispatch
```

Nome do arquivo:

```text
job-<nfe_email_dispatch_sale_id>-attempt-<attempt_count>-<random>.pdf
```

Exemplo:

```text
/var/tmp/nfe-email-dispatch/job-98765-attempt-1-a8f31c.pdf
```

A activity deve retornar apenas:

```ts
type FetchNfePdfFromIxcResult = {
  pdfPath: string;
};
```

Não retornar base64 para o workflow.

Não gravar PDF no banco.

Não incluir dados sensíveis no nome do arquivo.

## Atenção operacional: path local entre workers

A activity de PDF deve rodar em `automation-ixc`.

A activity compartilhada `sendSmtpEmailActivity` já está registrada em `automation-control`.

Se os workers estiverem em containers ou hosts diferentes, o path local retornado por `fetchNfePdfFromIxcActivity` só será utilizável pelo SMTP se `/var/tmp/nfe-email-dispatch` for compartilhado entre os workers.

Decisão recomendada na primeira versão:

```text
Adicionar volume compartilhado em docker-compose.yml para worker-control e worker-ixc.
```

Em produção, garantir o mesmo contrato operacional.

## Envio SMTP

Reutilizar:

```text
src/temporal/activities/shared/send-smtp-email.activity.ts
```

Não criar client SMTP paralelo.

A chamada do Workflow 2 deve usar:

```text
maximumAttempts = 1
```

Motivo:

```text
Retry automático de envio de e-mail pode duplicar envio.
```

A idempotência durável da activity compartilhada ajuda, mas não autoriza retry automático amplo no workflow de NF-e.

## Mapeamento do resultado SMTP

Quando `sendSmtpEmailActivity` retornar sucesso:

```text
status final = SENT
```

Quando retornar falha permanente:

```text
status final = FAILED_FINAL
```

Quando retornar falha `pending` ou situação ambígua após uma tentativa de envio:

```text
status final = DELIVERY_UNKNOWN
```

Quando lançar erro transitório antes de confirmação de envio:

```text
status final = FAILED_TRANSIENT
```

Se a tentativa atual já for a tentativa máxima, converter falha transitória para:

```text
FAILED_FINAL
```

## Assunto do e-mail

Usar:

```text
Sua Nota Fiscal - NET3 WIFI
```

## Destinatários

A query do ERP pode retornar múltiplos e-mails em uma string separada por `;`.

Normalizar assim:

```text
split por ;
trim em cada item
remover entradas vazias
```

Se a lista final ficar vazia:

```text
FAILED_FINAL — Cliente sem e-mail válido para envio da NF-e.
```

## Anexo

Enviar o PDF com:

```ts
attachments: [
  {
    filename: `nfe-${numeroNf}.pdf`,
    path: pdfPath,
    contentType: "application/pdf",
    contentDisposition: "attachment",
  }
]
```

`numeroNf` deve ser sanitizado para não inserir caracteres estranhos no nome do arquivo.

## Texto alternativo

Além do HTML, incluir um `text` simples para clientes de e-mail sem HTML, por exemplo:

```text
Olá, <nome_cliente>. Sua nota fiscal <numero_nf> da NET3 WIFI foi emitida e segue em anexo.
```

Escapar/normalizar dados também no texto, evitando quebra inesperada.
