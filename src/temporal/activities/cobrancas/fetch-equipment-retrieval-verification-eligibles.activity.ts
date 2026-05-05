import type {
  EquipmentRetrievalVerificationEligibleRecord,
  EquipmentRetrievalVerificationFetchEligiblesActivityData,
  EquipmentRetrievalVerificationFetchEligiblesActivityInput,
  EquipmentRetrievalVerificationFetchEligiblesActivityResult,
  EquipmentRetrievalVerificationInvalidRecord,
} from "../../../domain/cobrancas/equipment-retrieval-verification.types.js";
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  isIntegrationError,
} from "../../../domain/shared/integration-error.types.js";
import { stepSuccess } from "../../../domain/shared/step-result.types.js";
import { getSharedErpDbClient } from "../../../integrations/erp-db/erp-db.client.js";
import { erpDbQueries } from "../../../integrations/erp-db/erp-db.queries.js";
import type { ErpDbEquipmentRetrievalVerificationEligibleRow } from "../../../integrations/erp-db/erp-db.types.js";

type ParsedEligibleRow =
  | EquipmentRetrievalVerificationEligibleRecord
  | EquipmentRetrievalVerificationInvalidRecord;

export async function fetchEquipmentRetrievalVerificationEligiblesActivity(
  input: EquipmentRetrievalVerificationFetchEligiblesActivityInput,
): Promise<EquipmentRetrievalVerificationFetchEligiblesActivityResult> {
  const validatedInput = validateFetchInput(input);
  const erpDbClient = getSharedErpDbClient();

  try {
    const rows = await erpDbClient.select<ErpDbEquipmentRetrievalVerificationEligibleRow>(
      erpDbQueries.fetchEquipmentRetrievalVerificationEligibleRecords,
      [validatedInput.startAt],
    );
    const parsedRows = rows.reduce<EquipmentRetrievalVerificationFetchEligiblesActivityData>(
      (accumulator, row, index) => {
        const parsedRow = mapEligibleRow(row, index);

        if (isInvalidEligibleRow(parsedRow)) {
          accumulator.invalidRecords.push(parsedRow);
        } else {
          accumulator.validRecords.push(parsedRow);
        }

        return accumulator;
      },
      {
        validRecords: [],
        invalidRecords: [],
      },
    );

    if (
      parsedRows.validRecords.length === 0 &&
      parsedRows.invalidRecords.length === 0
    ) {
      return {
        status: "empty",
        data: parsedRows,
      };
    }

    return stepSuccess(parsedRows);
  } catch (error) {
    throw normalizeFetchEligiblesError(error);
  }
}

function validateFetchInput(
  input: EquipmentRetrievalVerificationFetchEligiblesActivityInput,
): EquipmentRetrievalVerificationFetchEligiblesActivityInput {
  const requestId = input.requestId.trim();
  const startAt = input.startAt.trim();

  if (requestId.length === 0) {
    throw new PermanentIntegrationError({
      code: "COBRANCAS_FETCH_ELIGIBLES_INVALID_REQUEST_ID",
      message: "Equipment retrieval verification fetch requires a non-empty requestId",
    });
  }

  if (startAt.length === 0) {
    throw new PermanentIntegrationError({
      code: "COBRANCAS_FETCH_ELIGIBLES_INVALID_START_AT",
      message: "Equipment retrieval verification fetch requires a non-empty startAt",
    });
  }

  return {
    requestId,
    startAt,
  };
}

function mapEligibleRow(
  row: ErpDbEquipmentRetrievalVerificationEligibleRow,
  index: number,
): ParsedEligibleRow {
  const record = {
    idCobranca: readPositiveIntegerField(row.id_cobranca, "id_cobranca", index),
    idOsRetirada: readPositiveIntegerField(row.id_os_retirada, "id_os_retirada", index),
    idReceber: readPositiveIntegerField(row.id_receber, "id_receber", index),
    idCidade: readOptionalPositiveIntegerField(row.id_cidade),
    idCliente: readPositiveIntegerField(row.id_cliente, "id_cliente", index),
    idContratoKit: readOptionalPositiveIntegerField(row.id_contrato_kit),
    idFilial: readOptionalPositiveIntegerField(row.id_filial),
  };
  const missingFields = readMissingFields(record);

  if (missingFields.length === 0) {
    return {
      idCobranca: record.idCobranca,
      idOsRetirada: record.idOsRetirada,
      idReceber: record.idReceber,
      idCidade: record.idCidade as number,
      idCliente: record.idCliente,
      idContratoKit: record.idContratoKit as number,
      idFilial: record.idFilial as number,
    };
  }

  return {
    idCobranca: record.idCobranca,
    idOsRetirada: record.idOsRetirada,
    idReceber: record.idReceber,
    idCliente: record.idCliente,
    idCidade: record.idCidade,
    idContratoKit: record.idContratoKit,
    idFilial: record.idFilial,
    missingFields,
  } satisfies EquipmentRetrievalVerificationInvalidRecord;
}

function isInvalidEligibleRow(value: ParsedEligibleRow): value is EquipmentRetrievalVerificationInvalidRecord {
  return "missingFields" in value;
}

function readPositiveIntegerField(value: unknown, fieldName: string, index: number): number {
  const parsedValue = parsePositiveInteger(value);

  if (parsedValue !== null) {
    return parsedValue;
  }

  throw new PermanentIntegrationError({
    code: "COBRANCAS_FETCH_ELIGIBLES_INVALID_ROW",
    message: `ERP returned an invalid equipment retrieval row at index ${index} for field ${fieldName}`,
  });
}

function readOptionalPositiveIntegerField(value: unknown): number | null {
  if (value === null) {
    return null;
  }

  return parsePositiveInteger(value);
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsedValue = Number(value);

    if (Number.isSafeInteger(parsedValue) && parsedValue > 0) {
      return parsedValue;
    }
  }

  return null;
}

function readMissingFields(record: {
  idCidade: number | null;
  idContratoKit: number | null;
  idFilial: number | null;
}): Array<"idCidade" | "idContratoKit" | "idFilial"> {
  return [
    ...(record.idCidade === null ? ["idCidade" as const] : []),
    ...(record.idContratoKit === null ? ["idContratoKit" as const] : []),
    ...(record.idFilial === null ? ["idFilial" as const] : []),
  ];
}

function normalizeFetchEligiblesError(error: unknown): Error {
  if (isIntegrationError(error)) {
    return error;
  }

  return new TransientIntegrationError({
    code: "COBRANCAS_FETCH_ELIGIBLES_UNKNOWN_FAILURE",
    message:
      "Equipment retrieval verification fetch failed with an unknown transient condition",
    cause: error,
  });
}
