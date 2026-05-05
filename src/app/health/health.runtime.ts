import { isIntegrationError } from "../../domain/shared/integration-error.types.js";
import { env } from "../../infra/config/env.js";
import type {
  CoreDependencyChecks,
  HealthCheckCacheKey,
  HealthCheckResult,
  HealthDependencyName,
  HealthDependencyReport,
  HealthDetailStatus,
} from "./health.types.js";

export const CORE_HEALTH_DEPENDENCY_NAMES = [
  "temporal",
  "systemDb",
] as const satisfies readonly HealthDependencyName[];

export const API_HEALTH_DEPENDENCY_NAMES = [
  "temporal",
  "systemDb",
  "erpDb",
  "opa",
  "ixc",
] as const satisfies readonly HealthDependencyName[];

export async function runHealthCheck<TName extends HealthDependencyName>(
  key: TName,
  required: boolean,
  operation: () => Promise<void>,
): Promise<HealthCheckResult<TName>> {
  const startedAt = Date.now();

  try {
    await operation();

    return {
      key,
      report: {
        name: key,
        required,
        status: "up",
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      key,
      report: {
        name: key,
        required,
        status: "down",
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: resolveHealthMessage(error),
      },
    };
  }
}

export function getHealthCacheTtlMs(key: HealthCheckCacheKey): number {
  return key === "readyz" ? env.healthReadinessCacheTtlMs : env.healthDetailsCacheTtlMs;
}

export function resolveReadinessOk(checks: CoreDependencyChecks): boolean {
  return Object.values(checks).every((check) => check.status === "up");
}

export function resolveDeepHealthStatus(
  checks: Record<string, HealthDependencyReport>,
): HealthDetailStatus {
  const requiredChecks = Object.values(checks).filter((check) => check.required);

  if (requiredChecks.some((check) => check.status !== "up")) {
    return "fail";
  }

  if (Object.values(checks).some((check) => check.status !== "up")) {
    return "degraded";
  }

  return "ok";
}

export function createMissingHealthReport<TName extends HealthDependencyName>(
  name: TName,
  required: boolean,
  message: string,
): HealthDependencyReport {
  return {
    name,
    required,
    status: "down",
    latencyMs: 0,
    checkedAt: new Date().toISOString(),
    message,
  };
}

export function resolveHealthMessage(error: unknown): string {
  if (isIntegrationError(error)) {
    const normalizedCode = error.code.toLowerCase();
    const normalizedMessage = error.message.toLowerCase();

    if (normalizedCode.includes("timeout") || normalizedMessage.includes("timeout")) {
      return "timeout";
    }

    if (normalizedCode.includes("access_denied") || normalizedCode.includes("credentials")) {
      return "access denied";
    }

    if (normalizedCode.includes("invalid_json")) {
      return "invalid json";
    }

    if (normalizedCode.includes("invalid_content_type")) {
      return "invalid response";
    }

    if (normalizedCode.includes("database_not_found")) {
      return "invalid database";
    }

    if (normalizedCode.includes("request_rejected")) {
      return "request rejected";
    }

    if (
      normalizedCode.includes("unavailable") ||
      normalizedCode.includes("query_failed") ||
      normalizedCode.includes("unknown_failure")
    ) {
      return "unavailable";
    }

    return error.kind === "permanent" ? "request rejected" : "unavailable";
  }

  if (error instanceof Error) {
    const normalizedMessage = error.message.toLowerCase();

    if (normalizedMessage.includes("timeout") || normalizedMessage.includes("timed out")) {
      return "timeout";
    }

    if (
      normalizedMessage.includes("access denied") ||
      normalizedMessage.includes("credentials")
    ) {
      return "access denied";
    }

    if (
      normalizedMessage.includes("invalid json") ||
      normalizedMessage.includes("unsupported content type") ||
      normalizedMessage.includes("html")
    ) {
      return "invalid response";
    }

    if (
      normalizedMessage.includes("connect") ||
      normalizedMessage.includes("econn") ||
      normalizedMessage.includes("enotfound") ||
      normalizedMessage.includes("unavailable")
    ) {
      return "unavailable";
    }
  }

  return "check failed";
}
