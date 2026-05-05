import type { IntegrationErrorKind } from "./integration-error.types.js";

export interface StepSuccessResult<TData> {
  status: "success";
  data: TData;
}

export interface BusinessFailureResult<TCode extends string, TDetails = unknown> {
  status: "business-failure";
  code: TCode;
  message: string;
  details?: TDetails;
}

export interface StepErrorResult<TCode extends string = string, TDetails = unknown> {
  status: "error";
  errorKind: IntegrationErrorKind;
  code: TCode;
  message: string;
  details?: TDetails;
}

export type StepResult<TData, TBusinessCode extends string, TBusinessDetails = unknown> =
  | StepSuccessResult<TData>
  | BusinessFailureResult<TBusinessCode, TBusinessDetails>;

export function stepSuccess<TData>(data: TData): StepSuccessResult<TData> {
  return {
    status: "success",
    data,
  };
}

export function businessFailure<TCode extends string, TDetails = unknown>(
  code: TCode,
  message: string,
  details?: TDetails,
): BusinessFailureResult<TCode, TDetails> {
  return {
    status: "business-failure",
    code,
    message,
    ...(details === undefined ? {} : { details }),
  };
}

export function stepError<TCode extends string = string, TDetails = unknown>(
  errorKind: IntegrationErrorKind,
  code: TCode,
  message: string,
  details?: TDetails,
): StepErrorResult<TCode, TDetails> {
  return {
    status: "error",
    errorKind,
    code,
    message,
    ...(details === undefined ? {} : { details }),
  };
}
