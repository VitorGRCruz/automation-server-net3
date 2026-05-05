import type {
  NfeEmailDispatchCustomer,
  NfeEmailDispatchSaleRecord,
  NfeEmailDispatchSaleStatusCount,
} from "../../domain/nfe/nfe-email-dispatch.types.js";
import { isTransientIntegrationError } from "../../domain/shared/integration-error.types.js";
import { getSharedSystemDbClient } from "../../infra/system-db/system-db.client.js";
import {
  countNfeEmailDispatchSalesByStatus,
  deleteNfeEmailDispatchCustomer,
  searchNfeEmailDispatchCustomers,
  searchNfeEmailDispatchSales,
  upsertNfeEmailDispatchCustomer,
  type CountNfeEmailDispatchSalesByStatusInput,
  type DeleteNfeEmailDispatchCustomerInput,
  type SearchNfeEmailDispatchCustomersInput,
  type SearchNfeEmailDispatchSalesInput,
} from "../../infra/system-db/nfe-email-dispatch.repository.js";

export interface CreateNfeEmailDispatchCustomerApiInput {
  erpCustomerId: number;
}

export interface CreateNfeEmailDispatchCustomerApiResult {
  customer: NfeEmailDispatchCustomer;
  created: boolean;
}

export type DeleteNfeEmailDispatchCustomerApiInput =
  DeleteNfeEmailDispatchCustomerInput;

export interface DeleteNfeEmailDispatchCustomerApiResult {
  customer: NfeEmailDispatchCustomer;
  deleted: true;
}

export type ListNfeEmailDispatchCustomersApiInput =
  SearchNfeEmailDispatchCustomersInput;

export interface ListNfeEmailDispatchCustomersApiResult {
  items: NfeEmailDispatchCustomer[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export type ListNfeEmailDispatchSalesApiInput = SearchNfeEmailDispatchSalesInput;

export interface ListNfeEmailDispatchSalesApiResult {
  items: NfeEmailDispatchSaleRecord[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export type CountNfeEmailDispatchSalesByStatusApiInput =
  CountNfeEmailDispatchSalesByStatusInput;

export interface CountNfeEmailDispatchSalesByStatusApiResult {
  items: NfeEmailDispatchSaleStatusCount[];
  total: number;
}

export async function createNfeEmailDispatchCustomerApi(
  input: CreateNfeEmailDispatchCustomerApiInput,
): Promise<CreateNfeEmailDispatchCustomerApiResult> {
  const systemDbClient = getSharedSystemDbClient();

  try {
    return await upsertNfeEmailDispatchCustomer(systemDbClient, input);
  } catch (error) {
    throw normalizeNfeEmailDispatchApiError(error);
  }
}

export async function listNfeEmailDispatchCustomersApi(
  input: ListNfeEmailDispatchCustomersApiInput,
): Promise<ListNfeEmailDispatchCustomersApiResult> {
  const systemDbClient = getSharedSystemDbClient();

  try {
    const result = await searchNfeEmailDispatchCustomers(systemDbClient, input);

    return {
      items: result.items,
      pagination: {
        limit: input.limit,
        offset: input.offset,
        total: result.total,
      },
    };
  } catch (error) {
    throw normalizeNfeEmailDispatchApiError(error);
  }
}

export async function listNfeEmailDispatchSalesApi(
  input: ListNfeEmailDispatchSalesApiInput,
): Promise<ListNfeEmailDispatchSalesApiResult> {
  const systemDbClient = getSharedSystemDbClient();

  try {
    const result = await searchNfeEmailDispatchSales(systemDbClient, input);

    return {
      items: result.items,
      pagination: {
        limit: input.limit,
        offset: input.offset,
        total: result.total,
      },
    };
  } catch (error) {
    throw normalizeNfeEmailDispatchApiError(error);
  }
}

export async function deleteNfeEmailDispatchCustomerApi(
  input: DeleteNfeEmailDispatchCustomerApiInput,
): Promise<DeleteNfeEmailDispatchCustomerApiResult> {
  const systemDbClient = getSharedSystemDbClient();

  try {
    const result = await deleteNfeEmailDispatchCustomer(systemDbClient, input);

    if (result.status === "not-found") {
      throw buildHttpError(404, "NF-e email dispatch customer not found");
    }

    return {
      customer: result.customer,
      deleted: true,
    };
  } catch (error) {
    throw normalizeNfeEmailDispatchApiError(error);
  }
}

export async function countNfeEmailDispatchSalesByStatusApi(
  input: CountNfeEmailDispatchSalesByStatusApiInput,
): Promise<CountNfeEmailDispatchSalesByStatusApiResult> {
  const systemDbClient = getSharedSystemDbClient();

  try {
    return await countNfeEmailDispatchSalesByStatus(systemDbClient, input);
  } catch (error) {
    throw normalizeNfeEmailDispatchApiError(error);
  }
}

function normalizeNfeEmailDispatchApiError(error: unknown): Error {
  if (isTransientIntegrationError(error)) {
    return buildHttpError(503, error.message);
  }

  return error instanceof Error ? error : new Error("Internal server error");
}

function buildHttpError(
  statusCode: number,
  message: string,
): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;

  return error;
}
