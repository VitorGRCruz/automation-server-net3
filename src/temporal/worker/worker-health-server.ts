import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { Connection } from "@temporalio/client";
import { appConfig } from "../../infra/config/app.config.js";
import { systemDbConfig } from "../../infra/config/system-db.config.js";
import { temporalConfig } from "../../infra/config/temporal.config.js";
import { withSystemDbClient } from "../../infra/system-db/system-db.client.js";
import {
  createMissingHealthReport,
  getHealthCacheTtlMs,
  resolveDeepHealthStatus,
  resolveHealthMessage,
  resolveReadinessOk,
  runHealthCheck,
} from "../../app/health/health.runtime.js";
import {
  buildBasicAuthChallengeHeader,
  hasValidBasicAuth,
} from "../../app/auth/basic-auth.js";
import { renderMetrics } from "../../infra/observability/metrics.js";
import type {
  CoreDependencyChecks,
  HealthCheckCacheKey,
  HealthDetailStatus,
} from "../../app/health/health.types.js";
import type { WorkerHealthSnapshot, WorkerHealthState } from "./worker-health-state.js";

interface WorkerHealthLivenessResponse {
  ok: true;
  service: "worker";
  status: "alive";
  checkedAt: string;
}

interface WorkerHealthReadinessResponse {
  ok: boolean;
  service: "worker";
  status: "ready" | "not-ready";
  checkedAt: string;
  cacheTtlMs: number;
  worker: WorkerHealthSnapshot;
  checks: CoreDependencyChecks;
}

interface WorkerHealthDetailsResponse {
  ok: boolean;
  service: "worker";
  status: HealthDetailStatus;
  checkedAt: string;
  cacheTtlMs: number;
  worker: WorkerHealthSnapshot;
  checks: CoreDependencyChecks;
}

interface WorkerHealthErrorResponse {
  ok: false;
  service: "worker";
  status: "error" | "not-found";
  checkedAt: string;
  message: string;
}

interface CacheEntry<TValue> {
  expiresAt: number;
  value: TValue;
}

type CachedWorkerHealthValue =
  | WorkerHealthReadinessResponse
  | WorkerHealthDetailsResponse;

export class WorkerHealthServer {
  private readonly state: WorkerHealthState;

  private readonly server: Server;

  private readonly cache = new Map<
    HealthCheckCacheKey,
    CacheEntry<CachedWorkerHealthValue>
  >();

  private readonly inFlight = new Map<
    HealthCheckCacheKey,
    Promise<CachedWorkerHealthValue>
  >();

  constructor(state: WorkerHealthState) {
    this.state = state;
    this.server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off("error", onError);
        resolve();
      };

      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(appConfig.workerHealth.port, appConfig.workerHealth.host);
    });
  }

  async close(): Promise<void> {
    if (!this.server.listening) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      if (request.method !== "GET") {
        this.sendJson(response, 404, createNotFoundResponse());
        return;
      }

      const url = new URL(request.url ?? "/", "http://worker.local");

      if (url.pathname === "/livez") {
        this.sendJson(response, 200, this.getLiveness());
        return;
      }

      if (url.pathname === "/readyz") {
        const readiness = await this.getReadiness();
        this.sendJson(response, readiness.ok ? 200 : 503, readiness);
        return;
      }

      if (url.pathname === "/healthz") {
        const details = await this.getDetails();
        this.sendJson(response, details.ok ? 200 : 503, details);
        return;
      }

      if (url.pathname === "/metrics" && appConfig.metrics.enabled) {
        if (!this.isMetricsRequestAuthorized(request)) {
          this.sendMetricsUnauthorized(response, request.headers.authorization);
          return;
        }

        const metrics = await renderMetrics();
        response.writeHead(200, {
          "content-type": metrics.contentType,
        });
        response.end(metrics.body);
        return;
      }

      this.sendJson(response, 404, createNotFoundResponse());
    } catch (error) {
      this.sendJson(response, 500, createErrorResponse(error));
    }
  }

  private getLiveness(): WorkerHealthLivenessResponse {
    return {
      ok: true,
      service: "worker",
      status: "alive",
      checkedAt: new Date().toISOString(),
    };
  }

  private async getReadiness(): Promise<WorkerHealthReadinessResponse> {
    return this.getCached("readyz", async () => {
      const checks = await this.runCoreChecks();
      const worker = this.state.getSnapshot();
      const checkedAt = new Date().toISOString();
      const ok = isWorkerRuntimeHealthy(worker) && resolveReadinessOk(checks);

      return {
        ok,
        service: "worker",
        status: ok ? "ready" : "not-ready",
        checkedAt,
        cacheTtlMs: getHealthCacheTtlMs("readyz"),
        worker,
        checks,
      };
    });
  }

  private async getDetails(): Promise<WorkerHealthDetailsResponse> {
    return this.getCached("healthz", async () => {
      const checks = await this.runDeepChecks();
      const worker = this.state.getSnapshot();
      const checkedAt = new Date().toISOString();
      const checksStatus = resolveDeepHealthStatus(checks);
      const status = !isWorkerRuntimeHealthy(worker)
        ? "fail"
        : checksStatus;

      return {
        ok: status !== "fail",
        service: "worker",
        status,
        checkedAt,
        cacheTtlMs: getHealthCacheTtlMs("healthz"),
        worker,
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

  private async runDeepChecks(): Promise<CoreDependencyChecks> {
    const results = await Promise.allSettled([
      this.checkTemporal(),
      this.checkSystemDb(),
    ]);

    const checks = createMissingCoreDependencyChecks();

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

  private async getCached<TValue extends CachedWorkerHealthValue>(
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

  private sendJson(
    response: ServerResponse,
    statusCode: number,
    payload:
      | WorkerHealthLivenessResponse
      | WorkerHealthReadinessResponse
      | WorkerHealthDetailsResponse
      | WorkerHealthErrorResponse,
  ): void {
    response.writeHead(statusCode, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(payload));
  }

  private isMetricsRequestAuthorized(request: IncomingMessage): boolean {
    if (appConfig.metrics.exposure === "public") {
      return true;
    }

    return hasValidBasicAuth(
      request.headers.authorization,
      appConfig.basicAuth.username,
      appConfig.basicAuth.password,
    );
  }

  private sendMetricsUnauthorized(
    response: ServerResponse,
    authorizationHeader: string | undefined,
  ): void {
    response.writeHead(401, {
      "content-type": "application/json; charset=utf-8",
      "www-authenticate": buildBasicAuthChallengeHeader(),
    });
    response.end(
      JSON.stringify({
        ok: false,
        service: "worker",
        status: "error",
        checkedAt: new Date().toISOString(),
        message:
          authorizationHeader === undefined
            ? "Missing Authorization header"
            : "Invalid basic authentication credentials",
      } satisfies WorkerHealthErrorResponse),
    );
  }
}

function createMissingCoreDependencyChecks(): CoreDependencyChecks {
  return {
    temporal: createMissingHealthReport("temporal", true, "check did not complete"),
    systemDb: createMissingHealthReport("systemDb", true, "check did not complete"),
  };
}

function isWorkerRuntimeHealthy(worker: WorkerHealthSnapshot): boolean {
  return (
    worker.bootstrapCompleted &&
    worker.runLoopActive &&
    worker.fatalError === undefined
  );
}

function createNotFoundResponse(): WorkerHealthErrorResponse {
  return {
    ok: false,
    service: "worker",
    status: "not-found",
    checkedAt: new Date().toISOString(),
    message: "worker health route not found",
  };
}

function createErrorResponse(error: unknown): WorkerHealthErrorResponse {
  return {
    ok: false,
    service: "worker",
    status: "error",
    checkedAt: new Date().toISOString(),
    message: resolveHealthMessage(error),
  };
}
