import type { FastifyInstance } from "fastify";
import {
  NFE_EMAIL_DISPATCH_SALE_STATUSES,
  type NfeEmailDispatchSaleStatus,
} from "../../domain/nfe/nfe-email-dispatch.types.js";
import {
  AutomationRuntimePolicyValidationError,
  normalizeAutomationRuntimeScope,
} from "../../domain/shared/automation-runtime-policy.js";
import {
  countNfeEmailDispatchSalesByStatusApi,
  createNfeEmailDispatchCustomerApi,
  deleteNfeEmailDispatchCustomerApi,
  listNfeEmailDispatchCustomersApi,
  listNfeEmailDispatchSalesApi,
  type CountNfeEmailDispatchSalesByStatusApiInput,
  type CreateNfeEmailDispatchCustomerApiInput,
  type DeleteNfeEmailDispatchCustomerApiInput,
  type ListNfeEmailDispatchCustomersApiInput,
  type ListNfeEmailDispatchSalesApiInput,
} from "../nfe/nfe-email-dispatch-api.service.js";
import { executeManualNfeEmailDispatchSaleWorkflow } from "../../temporal/client/nfe-email-dispatch-single-sale.client.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const SALE_STATUS_SET = new Set<string>(NFE_EMAIL_DISPATCH_SALE_STATUSES);

type QueryRecord = Record<string, unknown>;
interface ProcessSingleSaleRouteBody {
  nfeEmailDispatchSaleId: number;
  erpSaleId: number;
}

export async function nfeEmailDispatchRoute(
  server: FastifyInstance,
): Promise<void> {
  server.register(
    async (nfeServer) => {
      nfeServer.post<{ Body: unknown }>(
        "/customers",
        {
          preHandler: nfeServer.requireBasicAuth,
        },
        async (request, reply) => {
          const input = normalizeCreateCustomerBody(request.body);
          const result = await createNfeEmailDispatchCustomerApi(input);

          return reply.status(result.created ? 201 : 200).send({
            ok: true,
            data: {
              customer: result.customer,
              created: result.created,
            },
          });
        },
      );

      nfeServer.get<{ Querystring: unknown }>(
        "/customers",
        {
          preHandler: nfeServer.requireBasicAuth,
        },
        async (request, reply) => {
          const input = normalizeListCustomersQuery(request.query);
          const result = await listNfeEmailDispatchCustomersApi(input);

          return reply.status(200).send({
            ok: true,
            data: result,
          });
        },
      );

      nfeServer.delete<{ Querystring: unknown }>(
        "/customers",
        {
          preHandler: nfeServer.requireBasicAuth,
        },
        async (request, reply) => {
          const input = normalizeDeleteCustomerQuery(request.query);
          const result = await deleteNfeEmailDispatchCustomerApi(input);

          return reply.status(200).send({
            ok: true,
            data: result,
          });
        },
      );

      nfeServer.get<{ Querystring: unknown }>(
        "/sales",
        {
          preHandler: nfeServer.requireBasicAuth,
        },
        async (request, reply) => {
          const input = normalizeListSalesQuery(request.query);
          const result = await listNfeEmailDispatchSalesApi(input);

          return reply.status(200).send({
            ok: true,
            data: result,
          });
        },
      );

      nfeServer.get<{ Querystring: unknown }>(
        "/sales/status-counts",
        {
          preHandler: nfeServer.requireBasicAuth,
        },
        async (request, reply) => {
          const input = normalizeSalesStatusCountsQuery(request.query);
          const result = await countNfeEmailDispatchSalesByStatusApi(input);

          return reply.status(200).send({
            ok: true,
            data: result,
          });
        },
      );

      nfeServer.post<{ Body: unknown }>(
        "/sales/process-single",
        {
          preHandler: nfeServer.requireBasicAuth,
        },
        async (request, reply) => {
          const input = normalizeProcessSingleSaleBody(request.body);
          const execution = await executeManualNfeEmailDispatchSaleWorkflow({
            requestId: request.id,
            ...input,
          });

          request.log.info(
            {
              workflowId: execution.workflowId,
              runId: execution.runId,
              nfeEmailDispatchSaleId: input.nfeEmailDispatchSaleId,
              erpSaleId: input.erpSaleId,
              finalStatus: execution.result.status,
              attemptCount: execution.result.attemptCount,
            },
            "Completed manual single NF-e email dispatch workflow",
          );

          return reply.status(200).send({
            ok: true,
            workflowId: execution.workflowId,
            runId: execution.runId,
            result: execution.result,
          });
        },
      );
    },
    {
      prefix: "/api/nfe/email-dispatch",
    },
  );
}

function normalizeProcessSingleSaleBody(
  body: unknown,
): ProcessSingleSaleRouteBody {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw buildBadRequestError("Request body must be a JSON object");
  }

  const bodyRecord = body as Record<string, unknown>;
  rejectUnsupportedLegacyField(bodyRecord, "emailContext");
  rejectUnsupportedLegacyField(bodyRecord, "runtimePolicy");

  return {
    nfeEmailDispatchSaleId: readRequiredPositiveIntegerBody(
      bodyRecord,
      "nfeEmailDispatchSaleId",
    ),
    erpSaleId: readRequiredPositiveIntegerBody(bodyRecord, "erpSaleId"),
  };
}

function rejectUnsupportedLegacyField(
  body: Record<string, unknown>,
  fieldName: "emailContext" | "runtimePolicy",
): void {
  if (Object.hasOwn(body, fieldName)) {
    throw buildBadRequestError(
      `Field ${fieldName} is no longer supported for manual single-sale processing`,
    );
  }
}

function normalizeCreateCustomerBody(
  body: unknown,
): CreateNfeEmailDispatchCustomerApiInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw buildBadRequestError("Request body must be a JSON object");
  }

  const bodyRecord = body as { erpCustomerId?: unknown };
  const erpCustomerId = bodyRecord.erpCustomerId;

  if (typeof erpCustomerId !== "number") {
    throw buildBadRequestError(
      "Field erpCustomerId must be a positive integer",
    );
  }

  if (!Number.isSafeInteger(erpCustomerId) || erpCustomerId <= 0) {
    throw buildBadRequestError(
      "Field erpCustomerId must be a positive integer",
    );
  }

  return {
    erpCustomerId,
  };
}

function normalizeListCustomersQuery(
  query: unknown,
): ListNfeEmailDispatchCustomersApiInput {
  const record = normalizeQueryRecord(query);
  const input: ListNfeEmailDispatchCustomersApiInput = {
    limit: readLimitQuery(record),
    offset: readOffsetQuery(record),
  };

  assignIfDefined(input, "id", readOptionalPositiveIntegerQuery(record, "id"));
  assignIfDefined(
    input,
    "erpCustomerId",
    readOptionalPositiveIntegerQuery(record, "erpCustomerId"),
  );
  assignIfDefined(
    input,
    "erpCustomerIds",
    readOptionalPositiveIntegerListQuery(record, "erpCustomerIds"),
  );
  assignIfDefined(
    input,
    "createdFrom",
    readOptionalDateTimeQuery(record, "createdFrom"),
  );
  assignIfDefined(
    input,
    "createdTo",
    readOptionalDateTimeQuery(record, "createdTo"),
  );

  return input;
}

function normalizeListSalesQuery(
  query: unknown,
): ListNfeEmailDispatchSalesApiInput {
  const record = normalizeQueryRecord(query);
  const input: ListNfeEmailDispatchSalesApiInput = {
    limit: readLimitQuery(record),
    offset: readOffsetQuery(record),
  };

  assignIfDefined(input, "id", readOptionalPositiveIntegerQuery(record, "id"));
  assignIfDefined(
    input,
    "nfeEmailDispatchCustomerId",
    readOptionalPositiveIntegerQuery(record, "nfeEmailDispatchCustomerId"),
  );
  assignIfDefined(
    input,
    "erpCustomerId",
    readOptionalPositiveIntegerQuery(record, "erpCustomerId"),
  );
  assignIfDefined(
    input,
    "erpSaleId",
    readOptionalPositiveIntegerQuery(record, "erpSaleId"),
  );
  assignIfDefined(
    input,
    "erpInvoiceKey",
    readOptionalTrimmedTextQuery(record, "erpInvoiceKey"),
  );
  assignIfDefined(
    input,
    "statuses",
    readOptionalStatusesQuery(record, "statuses"),
  );
  assignIfDefined(
    input,
    "runtimeScope",
    readRuntimeScopeQuery(record, "runtimeScope"),
  );
  assignIfDefined(
    input,
    "invoiceEmittedFrom",
    readOptionalDateTimeQuery(record, "invoiceEmittedFrom"),
  );
  assignIfDefined(
    input,
    "invoiceEmittedTo",
    readOptionalDateTimeQuery(record, "invoiceEmittedTo"),
  );
  assignIfDefined(
    input,
    "lastAttemptFrom",
    readOptionalDateTimeQuery(record, "lastAttemptFrom"),
  );
  assignIfDefined(
    input,
    "lastAttemptTo",
    readOptionalDateTimeQuery(record, "lastAttemptTo"),
  );
  assignIfDefined(
    input,
    "sentFrom",
    readOptionalDateTimeQuery(record, "sentFrom"),
  );
  assignIfDefined(
    input,
    "sentTo",
    readOptionalDateTimeQuery(record, "sentTo"),
  );
  assignIfDefined(
    input,
    "createdFrom",
    readOptionalDateTimeQuery(record, "createdFrom"),
  );
  assignIfDefined(
    input,
    "createdTo",
    readOptionalDateTimeQuery(record, "createdTo"),
  );

  return input;
}

function normalizeDeleteCustomerQuery(
  query: unknown,
): DeleteNfeEmailDispatchCustomerApiInput {
  const record = normalizeQueryRecord(query);
  const input: DeleteNfeEmailDispatchCustomerApiInput = {};
  const id = readOptionalPositiveIntegerQuery(record, "id");
  const erpCustomerId = readOptionalPositiveIntegerQuery(record, "erpCustomerId");

  assignIfDefined(input, "id", id);
  assignIfDefined(input, "erpCustomerId", erpCustomerId);

  if (id === undefined && erpCustomerId === undefined) {
    throw buildBadRequestError(
      "Querystring must include id or erpCustomerId for customer deletion",
    );
  }

  if (id !== undefined && erpCustomerId !== undefined) {
    throw buildBadRequestError(
      "Querystring must not include both id and erpCustomerId for customer deletion",
    );
  }

  return input;
}

function normalizeSalesStatusCountsQuery(
  query: unknown,
): CountNfeEmailDispatchSalesByStatusApiInput {
  const record = normalizeQueryRecord(query);
  const input: CountNfeEmailDispatchSalesByStatusApiInput = {};

  assignIfDefined(
    input,
    "runtimeScope",
    readRuntimeScopeQuery(record, "runtimeScope"),
  );
  assignIfDefined(
    input,
    "lastAttemptFrom",
    readOptionalDateTimeQuery(record, "lastAttemptFrom"),
  );
  assignIfDefined(
    input,
    "lastAttemptTo",
    readOptionalDateTimeQuery(record, "lastAttemptTo"),
  );
  assignIfDefined(
    input,
    "sentFrom",
    readOptionalDateTimeQuery(record, "sentFrom"),
  );
  assignIfDefined(
    input,
    "sentTo",
    readOptionalDateTimeQuery(record, "sentTo"),
  );
  assignIfDefined(
    input,
    "createdFrom",
    readOptionalDateTimeQuery(record, "createdFrom"),
  );
  assignIfDefined(
    input,
    "createdTo",
    readOptionalDateTimeQuery(record, "createdTo"),
  );

  return input;
}

function normalizeQueryRecord(query: unknown): QueryRecord {
  if (query === undefined) {
    return {};
  }

  if (typeof query !== "object" || query === null || Array.isArray(query)) {
    throw buildBadRequestError("Querystring must be an object");
  }

  return query as QueryRecord;
}

function readOptionalPositiveIntegerQuery(
  query: QueryRecord,
  fieldName: string,
): number | undefined {
  const value = readOptionalSingleQueryValue(query, fieldName);

  if (value === undefined) {
    return undefined;
  }

  const parsedValue = parseIntegerText(value, fieldName);

  if (parsedValue <= 0) {
    throw buildBadRequestError(`Query parameter ${fieldName} must be positive`);
  }

  return parsedValue;
}

function readLimitQuery(query: QueryRecord): number {
  const value = readOptionalSingleQueryValue(query, "limit");

  if (value === undefined) {
    return DEFAULT_LIMIT;
  }

  const parsedValue = parseIntegerText(value, "limit");

  if (parsedValue < 1 || parsedValue > MAX_LIMIT) {
    throw buildBadRequestError(
      `Query parameter limit must be between 1 and ${MAX_LIMIT}`,
    );
  }

  return parsedValue;
}

function readOptionalPositiveIntegerListQuery(
  query: QueryRecord,
  fieldName: string,
): number[] | undefined {
  const value = readOptionalSingleQueryValue(query, fieldName);

  if (value === undefined) {
    return undefined;
  }

  const parts = value.split(",");

  if (parts.length === 0) {
    throw buildBadRequestError(
      `Query parameter ${fieldName} must contain at least one integer`,
    );
  }

  const normalizedValues: number[] = [];
  const seenValues = new Set<number>();

  for (const part of parts) {
    const trimmedPart = part.trim();

    if (trimmedPart.length === 0) {
      throw buildBadRequestError(
        `Query parameter ${fieldName} must not contain empty values`,
      );
    }

    const parsedValue = parseIntegerText(trimmedPart, fieldName);

    if (parsedValue <= 0) {
      throw buildBadRequestError(`Query parameter ${fieldName} must be positive`);
    }

    if (seenValues.has(parsedValue)) {
      continue;
    }

    seenValues.add(parsedValue);
    normalizedValues.push(parsedValue);
  }

  return normalizedValues;
}

function readOffsetQuery(query: QueryRecord): number {
  const value = readOptionalSingleQueryValue(query, "offset");

  if (value === undefined) {
    return 0;
  }

  const parsedValue = parseIntegerText(value, "offset");

  if (parsedValue < 0) {
    throw buildBadRequestError(
      "Query parameter offset must be zero or positive",
    );
  }

  return parsedValue;
}

function readOptionalStatusesQuery(
  query: QueryRecord,
  fieldName: string,
): NfeEmailDispatchSaleStatus[] | undefined {
  const value = readOptionalSingleQueryValue(query, fieldName);

  if (value === undefined) {
    return undefined;
  }

  const parts = value.split(",");

  if (parts.length === 0) {
    throw buildBadRequestError(
      `Query parameter ${fieldName} must contain at least one status`,
    );
  }

  const statuses: NfeEmailDispatchSaleStatus[] = [];
  const seenStatuses = new Set<string>();

  for (const part of parts) {
    const normalizedPart = part.trim();

    if (normalizedPart.length === 0) {
      throw buildBadRequestError(
        `Query parameter ${fieldName} must not contain empty status values`,
      );
    }

    if (!SALE_STATUS_SET.has(normalizedPart)) {
      throw buildBadRequestError(
        `Query parameter ${fieldName} contains an unsupported status: ${normalizedPart}`,
      );
    }

    if (seenStatuses.has(normalizedPart)) {
      throw buildBadRequestError(
        `Query parameter ${fieldName} must not contain duplicate statuses`,
      );
    }

    seenStatuses.add(normalizedPart);
    statuses.push(normalizedPart as NfeEmailDispatchSaleStatus);
  }

  return statuses;
}

function readRuntimeScopeQuery(
  query: QueryRecord,
  fieldName: string,
): string | undefined {
  const value = readOptionalSingleQueryValue(query, fieldName);

  if (value === undefined) {
    return undefined;
  }

  try {
    return normalizeAutomationRuntimeScope(value);
  } catch (error) {
    if (error instanceof AutomationRuntimePolicyValidationError) {
      throw buildBadRequestError(
        `Query parameter ${fieldName} is invalid: ${error.message}`,
      );
    }

    throw error;
  }
}

function readOptionalDateTimeQuery(
  query: QueryRecord,
  fieldName: string,
): string | undefined {
  const value = readOptionalSingleQueryValue(query, fieldName);

  if (value === undefined) {
    return undefined;
  }

  return normalizeDateTime3(value, fieldName);
}

function readOptionalTrimmedTextQuery(
  query: QueryRecord,
  fieldName: string,
): string | undefined {
  const value = readOptionalSingleQueryValue(query, fieldName);

  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw buildBadRequestError(
      `Query parameter ${fieldName} must not be empty`,
    );
  }

  return normalizedValue;
}

function readOptionalSingleQueryValue(
  query: QueryRecord,
  fieldName: string,
): string | undefined {
  const value = query[fieldName];

  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    throw buildBadRequestError(
      `Query parameter ${fieldName} must not be provided multiple times`,
    );
  }

  if (typeof value !== "string") {
    throw buildBadRequestError(
      `Query parameter ${fieldName} must be a string value`,
    );
  }

  const normalizedValue = value.trim();

  return normalizedValue.length === 0 ? undefined : normalizedValue;
}

function parseIntegerText(value: string, fieldName: string): number {
  if (!/^-?\d+$/.test(value)) {
    throw buildBadRequestError(
      `Query parameter ${fieldName} must be an integer`,
    );
  }

  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsedValue)) {
    throw buildBadRequestError(
      `Query parameter ${fieldName} must be a safe integer`,
    );
  }

  return parsedValue;
}

function readRequiredPositiveIntegerBody(
  body: Record<string, unknown>,
  fieldName: string,
): number {
  const value = body[fieldName];

  if (typeof value !== "number") {
    throw buildBadRequestError(
      `Field ${fieldName} must be a positive integer`,
    );
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw buildBadRequestError(
      `Field ${fieldName} must be a positive integer`,
    );
  }

  return value;
}

function normalizeDateTime3(value: string, fieldName: string): string {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    throw buildBadRequestError(
      `Query parameter ${fieldName} must not be empty`,
    );
  }

  const simpleDateTimeMatch = trimmedValue.match(
    /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?$/,
  );

  if (simpleDateTimeMatch !== null) {
    const milliseconds = (simpleDateTimeMatch[2] ?? "").padEnd(3, "0");

    return `${simpleDateTimeMatch[1]}.${milliseconds}`;
  }

  const parsedDate = new Date(trimmedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    throw buildBadRequestError(
      `Query parameter ${fieldName} must be a valid datetime`,
    );
  }

  return formatDateTime3(parsedDate);
}

function formatDateTime3(value: Date): string {
  const year = value.getUTCFullYear();
  const month = padNumber(value.getUTCMonth() + 1, 2);
  const day = padNumber(value.getUTCDate(), 2);
  const hour = padNumber(value.getUTCHours(), 2);
  const minute = padNumber(value.getUTCMinutes(), 2);
  const second = padNumber(value.getUTCSeconds(), 2);
  const millisecond = padNumber(value.getUTCMilliseconds(), 3);

  return `${year}-${month}-${day} ${hour}:${minute}:${second}.${millisecond}`;
}

function padNumber(value: number, width: number): string {
  return value.toString().padStart(width, "0");
}

function assignIfDefined<
  TObject extends object,
  TKey extends keyof TObject,
>(target: TObject, key: TKey, value: TObject[TKey] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function buildBadRequestError(message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 400;

  return error;
}
