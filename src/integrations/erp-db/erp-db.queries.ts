export const erpDbQueries = Object.freeze({
  pingConnection: "SELECT 1 AS ok",
  fetchCsatEligibleRecords: `
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
  `,
  fetchCustomerNfeSalesCandidates: `
    SELECT
      vd.id AS id_venda,
      vd.nfe_chave,
      rnf.data_recebimento AS data_emissao_nfe
    FROM vd_saida vd
    JOIN cliente c ON c.id = vd.id_cliente
    JOIN nfe_xml_pdf nf ON nf.id_saida = vd.id
    JOIN retorno_envio_nfe rnf ON rnf.id_saida = vd.id
    WHERE vd.modelo_nf = 62
      AND vd.status = 'F'
      AND vd.id_cliente = ?
      AND rnf.data_recebimento >= ?
    ORDER BY rnf.data_recebimento ASC, vd.id ASC;
  `,
  fetchNfeSaleEmailContext: `
    SELECT
      CASE
       WHEN TRIM(c.email) REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}([[:space:]]*;[[:space:]]*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})*$'
         THEN TRIM(c.email)
       ELSE NULL
      END AS email,
      c.razao AS nome_cliente,
      vd.id AS id_venda,
      vd.valor_total,
      vd.numero_nf,
      vd.nfe_chave
    FROM vd_saida vd
    JOIN cliente c ON c.id = vd.id_cliente
    JOIN nfe_xml_pdf nf ON nf.id_saida = vd.id
    JOIN retorno_envio_nfe rnf ON rnf.id_saida = vd.id
    WHERE vd.id = ?
      AND vd.modelo_nf = 62
      AND vd.status = 'F'
    LIMIT 1;
  `,
    fetchEquipmentRetrievalVerificationEligibleRecords: `
      SELECT
        os.id_cobranca,
        os.id AS id_os_retirada,
        os.id_receber,
        os.id_cidade,
        os.id_cliente,
        os.id_contrato_kit,
        os.id_filial
      FROM su_oss_chamado os
      WHERE os.data_fechamento >= ?
        AND os.id_assunto = 10
        AND os.id_su_diagnostico <> 0
        AND os.status = 'F'
        AND os.id_receber IS NOT NULL
        AND os.id_receber <> 0
        AND os.id_cobranca IS NOT NULL
        AND os.id_cobranca <> 0
        AND NOT EXISTS (
          SELECT 1
          FROM su_oss_chamado os2
          WHERE os2.id_receber = os.id_receber
            AND os2.id_assunto = 104
        )
      ORDER BY os.id_receber ASC, os.id ASC;
    `,
  });

