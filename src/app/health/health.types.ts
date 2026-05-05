export type CoreHealthDependencyName = "temporal" | "systemDb";
export type OptionalHealthDependencyName = "erpDb" | "opa" | "ixc";
export type HealthDependencyName =
  | CoreHealthDependencyName
  | OptionalHealthDependencyName;

export type HealthDependencyStatus = "up" | "down";
export type HealthCheckCacheKey = "readyz" | "healthz";
export type HealthDetailStatus = "ok" | "degraded" | "fail";
export type HealthServiceName = "api" | "worker";

export interface HealthDependencyReport {
  name: HealthDependencyName;
  required: boolean;
  status: HealthDependencyStatus;
  latencyMs: number;
  checkedAt: string;
  message?: string;
}

export interface HealthCheckResult<TName extends HealthDependencyName> {
  key: TName;
  report: HealthDependencyReport;
}

export type CoreDependencyChecks = Record<
  CoreHealthDependencyName,
  HealthDependencyReport
>;

export type ApiDependencyChecks = Record<HealthDependencyName, HealthDependencyReport>;

export interface HealthLivenessResponse {
  ok: true;
  service: "api";
  status: "alive";
  checkedAt: string;
}

export interface HealthReadinessResponse {
  ok: boolean;
  service: "api";
  status: "ready" | "not-ready";
  checkedAt: string;
  cacheTtlMs: number;
  checks: CoreDependencyChecks;
}

export interface HealthDetailsResponse {
  ok: boolean;
  service: "api";
  status: HealthDetailStatus;
  checkedAt: string;
  cacheTtlMs: number;
  checks: ApiDependencyChecks;
}
