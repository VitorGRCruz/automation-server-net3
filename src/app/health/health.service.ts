import { Connection } from "@temporalio/client";
import { appConfig } from "../../infra/config/app.config.js";
import { erpDbConfig } from "../../infra/config/erp-db.config.js";
import { systemDbConfig } from "../../infra/config/system-db.config.js";
import { temporalConfig } from "../../infra/config/temporal.config.js";
import { withSystemDbClient } from "../../infra/system-db/system-db.client.js";
import { createErpDbClient } from "../../integrations/erp-db/erp-db.client.js";
import { createIxcClient } from "../../integrations/ixc/ixc.client.js";
import { createOpaClient } from "../../integrations/opa/opa.client.js";
import {
  API_HEALTH_DEPENDENCY_NAMES,
  CORE_HEALTH_DEPENDENCY_NAMES,
  createMissingHealthReport,
  getHealthCacheTtlMs,
  resolveDeepHealthStatus,
  resolveReadinessOk,
  runHealthCheck,
} from "./health.runtime.js";
import type {
  ApiDependencyChecks,
  CoreDependencyChecks,
  HealthCheckCacheKey,
  HealthDependencyName,
  HealthDetailsResponse,
  HealthLivenessResponse,
  HealthReadinessResponse,
} from "./health.types.js";

type CachedHealthValue = HealthReadinessResponse | HealthDetailsResponse;

interface CacheEntry<TValue> {
  expiresAt: number;
  value: TValue;
}

export class HealthService {
  private readonly cache = new Map<HealthCheckCacheKey, CacheEntry<CachedHealthValue>>();

  private readonly inFlight = new Map<HealthCheckCacheKey, Promise<CachedHealthValue>>();

  getLiveness(): HealthLivenessResponse {
    return {
      ok: true,
      service: "api",
      status: "alive",
      checkedAt: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<HealthReadinessResponse> {
    return this.getCached("readyz", async () => {
      const checks = await this.runCoreChecks();
      const checkedAt = new Date().toISOString();
      const ok = resolveReadinessOk(checks);

      return {
        ok,
        service: "api",
        status: ok ? "ready" : "not-ready",
        checkedAt,
        cacheTtlMs: getHealthCacheTtlMs("readyz"),
        checks,
      };
    });
  }

  async getDetails(): Promise<HealthDetailsResponse> {
    return this.getCached("healthz", async () => {
      const checks = await this.runDeepChecks();
      const checkedAt = new Date().toISOString();
      const status = resolveDeepHealthStatus(checks);

      return {
        ok: status !== "fail",
        service: "api",
        status,
        checkedAt,
        cacheTtlMs: getHealthCacheTtlMs("healthz"),
        checks,
      };
    });
  }

  private async runCoreChecks(): Promise<CoreDependencyChecks> {
    const [temporal, systemDb] = await Promise.all([
      this.checkTemporal(),
      this.checkSystemDb(),
    ]);

    return {
      temporal: temporal.report,
      systemDb: systemDb.report,
    };
  }

  private async runDeepChecks(): Promise<ApiDependencyChecks> {
    const results = await Promise.allSettled([
      this.checkTemporal(),
      this.checkSystemDb(),
      this.checkErpDb(),
      this.checkOpa(),
      this.checkIxc(),
    ]);

    const checks = {} as ApiDependencyChecks;

    for (const dependencyName of API_HEALTH_DEPENDENCY_NAMES) {
      checks[dependencyName] = createMissingHealthReport(
        dependencyName,
        isRequiredDependency(dependencyName),
        "check did not complete",
      );
    }

    for (const result of results) {
      if (result.status === "fulfilled") {
        checks[result.value.key] = result.value.report;
      }
    }

    return checks;
  }

  private async checkTemporal() {
    return runHealthCheck("temporal", true, async () => {
      const connection = Connection.lazy({
        address: temporalConfig.address,
      });

      try {
        await connection.withDeadline(
          Date.now() + appConfig.health.checkTimeoutMs,
          () => connection.ensureConnected(),
        );
      } finally {
        await connection.close();
      }
    });
  }

  private async checkSystemDb() {
    return runHealthCheck("systemDb", true, async () => {
      await withSystemDbClient(
        async (client) => {
          await client.select("SELECT 1 AS ok");
        },
        {
          ...systemDbConfig,
          connectionLimit: 1,
          connectTimeoutMs: Math.min(
            systemDbConfig.connectTimeoutMs,
            appConfig.health.checkTimeoutMs,
          ),
        },
      );
    });
  }

  private async checkErpDb() {
    return runHealthCheck("erpDb", false, async () => {
      const client = createErpDbClient({
        ...erpDbConfig,
        connectionLimit: 1,
        connectTimeoutMs: Math.min(
          erpDbConfig.connectTimeoutMs,
          appConfig.health.checkTimeoutMs,
        ),
      });

      try {
        await client.ping();
      } finally {
        await client.close();
      }
    });
  }

  private async checkOpa() {
    return runHealthCheck("opa", false, async () => {
      const client = createOpaClient();
      await client.probe();
    });
  }

  private async checkIxc() {
    return runHealthCheck("ixc", false, async () => {
      const client = createIxcClient();
      await client.probe();
    });
  }

  private async getCached<TValue extends CachedHealthValue>(
    key: HealthCheckCacheKey,
    load: () => Promise<TValue>,
  ): Promise<TValue> {
    const cachedEntry = this.cache.get(key);

    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      return cachedEntry.value as TValue;
    }

    const currentRequest = this.inFlight.get(key);

    if (currentRequest) {
      return currentRequest as Promise<TValue>;
    }

    const cacheTtlMs = getHealthCacheTtlMs(key);
    const pendingRequest = load()
      .then((value) => {
        this.cache.set(key, {
          value,
          expiresAt: Date.now() + cacheTtlMs,
        });

        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, pendingRequest);

    return pendingRequest as Promise<TValue>;
  }
}

function isRequiredDependency(name: HealthDependencyName): boolean {
  return (CORE_HEALTH_DEPENDENCY_NAMES as readonly string[]).includes(name);
}

export const healthService = new HealthService();
