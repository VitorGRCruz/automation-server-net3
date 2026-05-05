import { env } from "./env.js";

export const appConfig = Object.freeze({
  environment: env.nodeEnv,
  host: env.appHost,
  port: env.appPort,
  logLevel: env.appLogLevel,
  metrics: {
    enabled: env.metricsEnabled,
    exposure: env.metricsExposure,
  },
  workerHealth: {
    host: env.workerHealthHost,
    port: env.workerHealthPort,
  },
  health: {
    cacheTtlMs: env.healthCacheTtlMs,
    checkTimeoutMs: env.healthCheckTimeoutMs,
  },
  basicAuth: {
    enabled: env.basicAuthEnabled,
    username: env.basicAuthUsername,
    password: env.basicAuthPassword,
  },
});
