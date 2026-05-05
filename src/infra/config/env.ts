function readStringEnv(name: string, fallback?: string): string {
  const value = process.env[name]?.trim();

  if (value) {
    return value;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Missing required environment variable: ${name}`);
}

function readStringEnvWithAliases(
  names: readonly string[],
  fallback?: string,
): string {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

function readOptionalStringEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value && value.length > 0 ? value : undefined;
}

function readOptionalStringEnvWithAliases(
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name]?.trim();

  if (!value) {
    return fallback;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }

  return parsedValue;
}

function readOptionalNumberEnv(name: string): number | undefined {
  const value = process.env[name]?.trim();

  if (!value) {
    return undefined;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }

  return parsedValue;
}

function readPositiveNumberEnv(name: string, fallback: number): number {
  const value = process.env[name]?.trim();

  if (!value) {
    return fallback;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number`);
  }

  return parsedValue;
}

function readIntegerRangeEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = process.env[name]?.trim();

  if (!value) {
    return fallback;
  }

  const parsedValue = Number(value);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < minimum ||
    parsedValue > maximum
  ) {
    throw new Error(
      `Environment variable ${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }

  return parsedValue;
}

function readNumberEnvWithAliases(
  names: readonly string[],
  fallback: number,
): number {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (!value) {
      continue;
    }

    const parsedValue = Number(value);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      throw new Error(
        `Environment variable ${name} must be a positive integer`,
      );
    }

    return parsedValue;
  }

  return fallback;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new Error(`Environment variable ${name} must be true/false or 1/0`);
}

function readMetricsExposureEnv(
  name: string,
  fallback: "protected" | "public",
): "protected" | "public" {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  if (value === "protected" || value === "public") {
    return value;
  }

  throw new Error(`Environment variable ${name} must be protected or public`);
}

function readIxcBasicAuthCredentialEnv(): string {
  const preferredValue = process.env.IXC_BASIC_AUTH_CREDENTIAL?.trim();

  if (preferredValue) {
    return preferredValue;
  }

  const legacyValue = process.env.IXC_API_TOKEN?.trim();

  if (legacyValue) {
    return legacyValue;
  }

  return "change-me:change-me";
}

const temporalErpReadMaxConcurrentActivityTaskExecutions = readNumberEnv(
  "TEMPORAL_ERP_READ_MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS",
  5,
);
const temporalOpaMaxConcurrentActivityTaskExecutions = readNumberEnv(
  "TEMPORAL_OPA_MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS",
  10,
);
const temporalIxcMaxConcurrentActivityTaskExecutions = readNumberEnv(
  "TEMPORAL_IXC_MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS",
  5,
);
const temporalErpReadMaxActivitiesPerSecond = readPositiveNumberEnv(
  "TEMPORAL_ERP_READ_MAX_ACTIVITIES_PER_SECOND",
  temporalErpReadMaxConcurrentActivityTaskExecutions,
);
const temporalErpReadMaxTaskQueueActivitiesPerSecond = readPositiveNumberEnv(
  "TEMPORAL_ERP_READ_MAX_TASK_QUEUE_ACTIVITIES_PER_SECOND",
  temporalErpReadMaxActivitiesPerSecond,
);
const temporalOpaMaxActivitiesPerSecond = readPositiveNumberEnv(
  "TEMPORAL_OPA_MAX_ACTIVITIES_PER_SECOND",
  temporalOpaMaxConcurrentActivityTaskExecutions,
);
const temporalOpaMaxTaskQueueActivitiesPerSecond = readPositiveNumberEnv(
  "TEMPORAL_OPA_MAX_TASK_QUEUE_ACTIVITIES_PER_SECOND",
  temporalOpaMaxActivitiesPerSecond,
);
const temporalIxcMaxActivitiesPerSecond = readPositiveNumberEnv(
  "TEMPORAL_IXC_MAX_ACTIVITIES_PER_SECOND",
  temporalIxcMaxConcurrentActivityTaskExecutions,
);
const temporalIxcMaxTaskQueueActivitiesPerSecond = readPositiveNumberEnv(
  "TEMPORAL_IXC_MAX_TASK_QUEUE_ACTIVITIES_PER_SECOND",
  temporalIxcMaxActivitiesPerSecond,
);

export const env = Object.freeze({
  nodeEnv: readStringEnv("NODE_ENV", "development"),
  appHost: readStringEnv("APP_HOST", "0.0.0.0"),
  appPort: readNumberEnv("APP_PORT", 3000),
  appLogLevel: readStringEnv("APP_LOG_LEVEL", "info"),
  metricsEnabled: readBooleanEnv("METRICS_ENABLED", true),
  metricsExposure: readMetricsExposureEnv("METRICS_EXPOSURE", "protected"),
  workerHealthHost: readStringEnv("WORKER_HEALTH_HOST", "0.0.0.0"),
  workerHealthPort: readNumberEnv("WORKER_HEALTH_PORT", 3001),
  healthCacheTtlMs: readNumberEnv("HEALTH_CACHE_TTL_MS", 10000),
  healthReadinessCacheTtlMs: readNumberEnvWithAliases(
    ["HEALTH_READINESS_CACHE_TTL_MS", "HEALTH_CACHE_TTL_MS"],
    10000,
  ),
  healthDetailsCacheTtlMs: readNumberEnvWithAliases(
    ["HEALTH_DETAILS_CACHE_TTL_MS", "HEALTH_CACHE_TTL_MS"],
    10000,
  ),
  healthCheckTimeoutMs: readNumberEnv("HEALTH_CHECK_TIMEOUT_MS", 3000),
  basicAuthEnabled: readBooleanEnv("BASIC_AUTH_ENABLED", false),
  basicAuthUsername: readStringEnv("BASIC_AUTH_USERNAME", "admin"),
  basicAuthPassword: readStringEnv("BASIC_AUTH_PASSWORD", "change-me"),
  temporalAddress: readStringEnv("TEMPORAL_ADDRESS", "localhost:7233"),
  temporalNamespace: readStringEnv("TEMPORAL_NAMESPACE", "default"),
  temporalControlMaxConcurrentWorkflowTaskExecutions: readNumberEnv(
    "TEMPORAL_CONTROL_MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS",
    40,
  ),
  temporalControlMaxConcurrentActivityTaskExecutions: readNumberEnv(
    "TEMPORAL_CONTROL_MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS",
    10,
  ),
  temporalControlMaxCachedWorkflows: readNumberEnv(
    "TEMPORAL_CONTROL_MAX_CACHED_WORKFLOWS",
    40,
  ),
  temporalErpReadMaxConcurrentActivityTaskExecutions,
  temporalOpaMaxConcurrentActivityTaskExecutions,
  temporalIxcMaxConcurrentActivityTaskExecutions,
  temporalControlMaxConcurrentWorkflowTaskPolls: readOptionalNumberEnv(
    "TEMPORAL_CONTROL_MAX_CONCURRENT_WORKFLOW_TASK_POLLS",
  ),
  temporalControlMaxConcurrentActivityTaskPolls: readOptionalNumberEnv(
    "TEMPORAL_CONTROL_MAX_CONCURRENT_ACTIVITY_TASK_POLLS",
  ),
  temporalErpReadMaxConcurrentActivityTaskPolls: readOptionalNumberEnv(
    "TEMPORAL_ERP_READ_MAX_CONCURRENT_ACTIVITY_TASK_POLLS",
  ),
  temporalOpaMaxConcurrentActivityTaskPolls: readOptionalNumberEnv(
    "TEMPORAL_OPA_MAX_CONCURRENT_ACTIVITY_TASK_POLLS",
  ),
  temporalIxcMaxConcurrentActivityTaskPolls: readOptionalNumberEnv(
    "TEMPORAL_IXC_MAX_CONCURRENT_ACTIVITY_TASK_POLLS",
  ),
  temporalErpReadMaxActivitiesPerSecond,
  temporalErpReadMaxTaskQueueActivitiesPerSecond,
  temporalOpaMaxActivitiesPerSecond,
  temporalOpaMaxTaskQueueActivitiesPerSecond,
  temporalIxcMaxActivitiesPerSecond,
  temporalIxcMaxTaskQueueActivitiesPerSecond,
  systemDbHost: readStringEnv("SYSTEM_DB_HOST", "localhost"),
  systemDbPort: readNumberEnv("SYSTEM_DB_PORT", 3306),
  systemDbDatabase: readStringEnv("SYSTEM_DB_DATABASE", "automation_server"),
  systemDbUsername: readStringEnv("SYSTEM_DB_USERNAME", "automation"),
  systemDbPassword: readStringEnv("SYSTEM_DB_PASSWORD", "change-me"),
  systemDbConnectTimeoutMs: readNumberEnv("SYSTEM_DB_CONNECT_TIMEOUT_MS", 10000),
  systemDbConnectionLimit: readNumberEnv("SYSTEM_DB_CONNECTION_LIMIT", 5),
  csatTriggerScheduleEnabled: readBooleanEnv("CSAT_TRIGGER_SCHEDULE_ENABLED", false),
  csatTriggerScheduleId: readStringEnv(
    "CSAT_TRIGGER_SCHEDULE_ID",
    "csat-start-survey-hourly",
  ),
  csatTriggerScheduleIntervalMinutes: readNumberEnv(
    "CSAT_TRIGGER_SCHEDULE_INTERVAL_MINUTES",
    60,
  ),
  csatTriggerScheduleTaskQueue: readStringEnv(
    "CSAT_TRIGGER_SCHEDULE_TASK_QUEUE",
    "automation-control",
  ),
  csatTriggerScheduleWorkflowId: readStringEnv(
    "CSAT_TRIGGER_SCHEDULE_WORKFLOW_ID",
    "csat-start-survey/schedule",
  ),
  cobrancasEquipmentRetrievalTriggerScheduleEnabled: readBooleanEnv(
    "COBRANCAS_EQUIPMENT_RETRIEVAL_TRIGGER_SCHEDULE_ENABLED",
    false,
  ),
  cobrancasEquipmentRetrievalTriggerScheduleId: readStringEnv(
    "COBRANCAS_EQUIPMENT_RETRIEVAL_TRIGGER_SCHEDULE_ID",
    "cobrancas-equipment-retrieval-verification-every-30-minutes",
  ),
  cobrancasEquipmentRetrievalTriggerScheduleIntervalMinutes: readNumberEnv(
    "COBRANCAS_EQUIPMENT_RETRIEVAL_TRIGGER_SCHEDULE_INTERVAL_MINUTES",
    30,
  ),
  cobrancasEquipmentRetrievalTriggerScheduleTaskQueue: readStringEnv(
    "COBRANCAS_EQUIPMENT_RETRIEVAL_TRIGGER_SCHEDULE_TASK_QUEUE",
    "automation-control",
  ),
  cobrancasEquipmentRetrievalTriggerScheduleWorkflowId: readStringEnv(
    "COBRANCAS_EQUIPMENT_RETRIEVAL_TRIGGER_SCHEDULE_WORKFLOW_ID",
    "cobrancas-equipment-retrieval-verification/schedule",
  ),
  cobrancasEquipmentRetrievalTriggerStartAt: readStringEnv(
    "COBRANCAS_EQUIPMENT_RETRIEVAL_TRIGGER_START_AT",
    "2026-01-01 00:00:00",
  ),
  nfeEmailDispatchDiscoveryScheduleEnabled: readBooleanEnv(
    "NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_ENABLED",
    false,
  ),
  nfeEmailDispatchDiscoveryScheduleId: readStringEnv(
    "NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_ID",
    "nfe-email-dispatch-discovery-daily-0300",
  ),
  nfeEmailDispatchDiscoveryScheduleTaskQueue: readStringEnv(
    "NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_TASK_QUEUE",
    "automation-control",
  ),
  nfeEmailDispatchDiscoveryScheduleWorkflowId: readStringEnv(
    "NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_WORKFLOW_ID",
    "nfe-email-dispatch/discovery/schedule",
  ),
  nfeEmailDispatchDiscoveryScheduleTimezone: readStringEnv(
    "NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_TIMEZONE",
    "America/Campo_Grande",
  ),
  nfeEmailDispatchDiscoveryScheduleHour: readIntegerRangeEnv(
    "NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_HOUR",
    3,
    0,
    23,
  ),
  nfeEmailDispatchDiscoveryScheduleMinute: readIntegerRangeEnv(
    "NFE_EMAIL_DISPATCH_DISCOVERY_SCHEDULE_MINUTE",
    0,
    0,
    59,
  ),
  nfeEmailDispatchProcessingScheduleEnabled: readBooleanEnv(
    "NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_ENABLED",
    false,
  ),
  nfeEmailDispatchProcessingScheduleId: readStringEnv(
    "NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_ID",
    "nfe-email-dispatch-processing-daily-0800",
  ),
  nfeEmailDispatchProcessingScheduleTaskQueue: readStringEnv(
    "NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_TASK_QUEUE",
    "automation-control",
  ),
  nfeEmailDispatchProcessingScheduleWorkflowId: readStringEnv(
    "NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_WORKFLOW_ID",
    "nfe-email-dispatch/processing/schedule",
  ),
  nfeEmailDispatchProcessingScheduleTimezone: readStringEnv(
    "NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_TIMEZONE",
    "America/Campo_Grande",
  ),
  nfeEmailDispatchProcessingScheduleHour: readIntegerRangeEnv(
    "NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_HOUR",
    8,
    0,
    23,
  ),
  nfeEmailDispatchProcessingScheduleMinute: readIntegerRangeEnv(
    "NFE_EMAIL_DISPATCH_PROCESSING_SCHEDULE_MINUTE",
    0,
    0,
    59,
  ),
  nfeEmailDispatchDiscoveryWindowDays: readNumberEnv(
    "NFE_EMAIL_DISPATCH_DISCOVERY_WINDOW_DAYS",
    15,
  ),
  nfeEmailDispatchMaxConcurrentChildren: readNumberEnv(
    "NFE_EMAIL_DISPATCH_MAX_CONCURRENT_CHILDREN",
    5,
  ),
  nfeEmailDispatchMaxSendAttempts: readNumberEnv(
    "NFE_EMAIL_DISPATCH_MAX_SEND_ATTEMPTS",
    3,
  ),
  nfeEmailDispatchPdfTmpDir: readStringEnv(
    "NFE_EMAIL_DISPATCH_PDF_TMP_DIR",
    "/var/tmp/nfe-email-dispatch",
  ),
  erpDbHost: readStringEnv("ERP_DB_HOST", "localhost"),
  erpDbPort: readNumberEnv("ERP_DB_PORT", 3306),
  erpDbDatabase: readStringEnvWithAliases(["ERP_DB_DATABASE", "ERP_DB_NAME"], "erp"),
  erpDbUsername: readStringEnvWithAliases(["ERP_DB_USERNAME", "ERP_DB_USER"], "readonly"),
  erpDbPassword: readStringEnv("ERP_DB_PASSWORD", ""),
  erpDbConnectTimeoutMs: readNumberEnv("ERP_DB_CONNECT_TIMEOUT_MS", 10000),
  erpDbConnectionLimit: readNumberEnv("ERP_DB_CONNECTION_LIMIT", 5),
  opaBaseUrl: readStringEnv("OPA_BASE_URL", "https://opa.local"),
  opaApiToken: readStringEnv("OPA_API_TOKEN", "change-me"),
  opaApiTimeoutMs: readNumberEnv("OPA_API_TIMEOUT_MS", 10000),
  ixcBaseUrl: readStringEnv("IXC_BASE_URL", "https://ixc.local"),
  ixcBasicAuthCredential: readIxcBasicAuthCredentialEnv(),
  ixcApiTimeoutMs: readNumberEnv("IXC_API_TIMEOUT_MS", 10000),
  smtpHost: readStringEnv("SMTP_HOST", "smtp.local"),
  smtpPort: readNumberEnv("SMTP_PORT", 587),
  smtpSecure: readBooleanEnv("SMTP_SECURE", false),
  smtpConnectionTimeoutMs: readNumberEnv("SMTP_CONNECTION_TIMEOUT_MS", 120000),
  smtpGreetingTimeoutMs: readNumberEnv("SMTP_GREETING_TIMEOUT_MS", 30000),
  smtpSocketTimeoutMs: readNumberEnv("SMTP_SOCKET_TIMEOUT_MS", 600000),
  smtpDnsTimeoutMs: readNumberEnv("SMTP_DNS_TIMEOUT_MS", 30000),
  smtpRequireTls: readBooleanEnv("SMTP_REQUIRE_TLS", false),
  smtpTlsServername: readOptionalStringEnv("SMTP_TLS_SERVERNAME"),
  smtpUsername: readStringEnvWithAliases(
    ["SMTP_USERNAME", "NFE_SMTP_USERNAME"],
    "change-me",
  ),
  smtpPassword: readStringEnvWithAliases(
    ["SMTP_PASSWORD", "NFE_SMTP_PASSWORD"],
    "change-me",
  ),
  smtpDefaultFrom: readStringEnvWithAliases(
    ["SMTP_DEFAULT_FROM", "SMTP_FROM", "SMTP_USERNAME", "NFE_SMTP_USERNAME"],
    "change-me",
  ),
  smtpDefaultReplyTo: readOptionalStringEnvWithAliases([
    "SMTP_DEFAULT_REPLY_TO",
    "SMTP_REPLY_TO",
  ]),
});
