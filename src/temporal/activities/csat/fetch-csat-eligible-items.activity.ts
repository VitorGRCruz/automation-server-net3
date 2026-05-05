import type {
  CsatEligibleRecord,
  FetchCsatEligibleItemsActivityInput,
  FetchCsatEligibleItemsActivityResult,
} from "../../../domain/csat/csat-start-survey.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import { stepSuccess } from "../../../domain/shared/step-result.types.js";
import { getSharedErpDbClient } from "../../../integrations/erp-db/erp-db.client.js";
import { erpDbQueries } from "../../../integrations/erp-db/erp-db.queries.js";
import type { ErpDbCsatEligibleRow } from "../../../integrations/erp-db/erp-db.types.js";

/**
 * Loads the current CSAT-eligible records from the ERP in read-only mode.
 */
export async function fetchCsatEligibleItemsActivity(
  _input: FetchCsatEligibleItemsActivityInput,
): Promise<FetchCsatEligibleItemsActivityResult> {
  const erpDbClient = getSharedErpDbClient();

  try {
    const rows = await erpDbClient.select<ErpDbCsatEligibleRow>(
      erpDbQueries.fetchCsatEligibleRecords,
    );
    const records = rows.map(mapEligibleRow);

    if (records.length === 0) {
      return {
        status: "empty",
        data: {
          records,
        },
      };
    }

    return stepSuccess({
      records,
    });
  } catch (error) {
    throw normalizeFetchCsatEligibleItemsError(error);
  }
}

function mapEligibleRow(row: ErpDbCsatEligibleRow, index: number): CsatEligibleRecord {
  return {
    idCliente: readIntegerField(row.id_cliente, "id_cliente", index),
    idContrato: readIntegerField(row.id_contrato, "id_contrato", index),
    idOs: readIntegerField(row.id_os, "id_os", index),
    nomeCliente: readStringField(row.nome_cliente, "nome_cliente", index),
    idTicket: readNullableIntegerField(row.id_ticket, "id_ticket", index),
    idFilial: readIntegerField(row.id_filial, "id_filial", index),
  };
}

function readIntegerField(value: unknown, fieldName: string, index: number): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsedValue = Number(value);

    if (Number.isSafeInteger(parsedValue)) {
      return parsedValue;
    }
  }

  throw new PermanentIntegrationError({
    code: "CSAT_ELIGIBLE_ITEMS_INVALID_ROW",
    message: buildInvalidRowMessage(fieldName, index),
  });
}

function readNullableIntegerField(
  value: unknown,
  fieldName: string,
  index: number,
): number | null {
  if (value === null) {
    return null;
  }

  return readIntegerField(value, fieldName, index);
}

function readStringField(value: unknown, fieldName: string, index: number): string {
  if (typeof value === "string") {
    return value;
  }

  throw new PermanentIntegrationError({
    code: "CSAT_ELIGIBLE_ITEMS_INVALID_ROW",
    message: buildInvalidRowMessage(fieldName, index),
  });
}

function buildInvalidRowMessage(fieldName: string, index: number): string {
  return `ERP returned an invalid CSAT eligible row at index ${index} for field ${fieldName}`;
}

function normalizeFetchCsatEligibleItemsError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "CSAT_FETCH_ELIGIBLE_ITEMS_FAILED",
    message: "CSAT eligible-items query failed with an unknown transient error",
    cause: error,
  });
}
