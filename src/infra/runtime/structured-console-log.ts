import { getErrorLogDetails } from "../observability/error-details.js";

export type StructuredConsoleLogLevel = "info" | "warn" | "error";

export function writeStructuredConsoleLog(
  level: StructuredConsoleLogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: unknown,
): void {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ?? {}),
    ...(error === undefined ? {} : { err: getErrorLogDetails(error) }),
  };
  const serializedPayload = JSON.stringify(payload);

  switch (level) {
    case "info":
      console.info(serializedPayload);
      return;
    case "warn":
      console.warn(serializedPayload);
      return;
    case "error":
      console.error(serializedPayload);
      return;
  }
}
