import { env } from "./env.js";
import { temporalTaskQueues } from "./temporal-task-queues.js";

export const csatTriggerScheduleConfig = Object.freeze({
  enabled: env.csatTriggerScheduleEnabled,
  scheduleId: env.csatTriggerScheduleId,
  intervalMinutes: env.csatTriggerScheduleIntervalMinutes,
  taskQueue: env.csatTriggerScheduleTaskQueue,
  workflowId: env.csatTriggerScheduleWorkflowId,
});

export const cobrancasEquipmentRetrievalTriggerScheduleConfig = Object.freeze({
  enabled: env.cobrancasEquipmentRetrievalTriggerScheduleEnabled,
  scheduleId: env.cobrancasEquipmentRetrievalTriggerScheduleId,
  intervalMinutes: env.cobrancasEquipmentRetrievalTriggerScheduleIntervalMinutes,
  taskQueue: env.cobrancasEquipmentRetrievalTriggerScheduleTaskQueue,
  workflowId: env.cobrancasEquipmentRetrievalTriggerScheduleWorkflowId,
  timezone: env.cobrancasEquipmentRetrievalTriggerScheduleTimezone,
  windowStartHour: env.cobrancasEquipmentRetrievalTriggerScheduleWindowStartHour,
  windowStartMinute:
    env.cobrancasEquipmentRetrievalTriggerScheduleWindowStartMinute,
  windowEndHour: env.cobrancasEquipmentRetrievalTriggerScheduleWindowEndHour,
  windowEndMinute: env.cobrancasEquipmentRetrievalTriggerScheduleWindowEndMinute,
  startAt: env.cobrancasEquipmentRetrievalTriggerStartAt,
});

export const nfeEmailDispatchDiscoveryScheduleConfig = Object.freeze({
  enabled: env.nfeEmailDispatchDiscoveryScheduleEnabled,
  scheduleId: env.nfeEmailDispatchDiscoveryScheduleId,
  taskQueue: env.nfeEmailDispatchDiscoveryScheduleTaskQueue,
  workflowId: env.nfeEmailDispatchDiscoveryScheduleWorkflowId,
  timezone: env.nfeEmailDispatchDiscoveryScheduleTimezone,
  hour: env.nfeEmailDispatchDiscoveryScheduleHour,
  minute: env.nfeEmailDispatchDiscoveryScheduleMinute,
});

export const nfeEmailDispatchProcessingScheduleConfig = Object.freeze({
  enabled: env.nfeEmailDispatchProcessingScheduleEnabled,
  scheduleId: env.nfeEmailDispatchProcessingScheduleId,
  taskQueue: env.nfeEmailDispatchProcessingScheduleTaskQueue,
  workflowId: env.nfeEmailDispatchProcessingScheduleWorkflowId,
  timezone: env.nfeEmailDispatchProcessingScheduleTimezone,
  hour: env.nfeEmailDispatchProcessingScheduleHour,
  minute: env.nfeEmailDispatchProcessingScheduleMinute,
});

export const temporalConfig = Object.freeze({
  address: env.temporalAddress,
  namespace: env.temporalNamespace,
  taskQueues: temporalTaskQueues,
  workerConcurrency: Object.freeze({
    control: Object.freeze({
      maxConcurrentWorkflowTaskExecutions:
        env.temporalControlMaxConcurrentWorkflowTaskExecutions,
      maxConcurrentActivityTaskExecutions:
        env.temporalControlMaxConcurrentActivityTaskExecutions,
      maxCachedWorkflows: env.temporalControlMaxCachedWorkflows,
      ...(env.temporalControlMaxConcurrentWorkflowTaskPolls === undefined
        ? {}
        : {
            maxConcurrentWorkflowTaskPolls:
              env.temporalControlMaxConcurrentWorkflowTaskPolls,
          }),
      ...(env.temporalControlMaxConcurrentActivityTaskPolls === undefined
        ? {}
        : {
            maxConcurrentActivityTaskPolls:
              env.temporalControlMaxConcurrentActivityTaskPolls,
          }),
    }),
    erpRead: Object.freeze({
      maxConcurrentActivityTaskExecutions:
        env.temporalErpReadMaxConcurrentActivityTaskExecutions,
      ...(env.temporalErpReadMaxConcurrentActivityTaskPolls === undefined
        ? {}
        : {
            maxConcurrentActivityTaskPolls:
              env.temporalErpReadMaxConcurrentActivityTaskPolls,
          }),
    }),
    opa: Object.freeze({
      maxConcurrentActivityTaskExecutions:
        env.temporalOpaMaxConcurrentActivityTaskExecutions,
      ...(env.temporalOpaMaxConcurrentActivityTaskPolls === undefined
        ? {}
        : {
            maxConcurrentActivityTaskPolls:
              env.temporalOpaMaxConcurrentActivityTaskPolls,
          }),
    }),
    ixc: Object.freeze({
      maxConcurrentActivityTaskExecutions:
        env.temporalIxcMaxConcurrentActivityTaskExecutions,
      ...(env.temporalIxcMaxConcurrentActivityTaskPolls === undefined
        ? {}
        : {
            maxConcurrentActivityTaskPolls:
              env.temporalIxcMaxConcurrentActivityTaskPolls,
          }),
    }),
  }),
  workerRateLimits: Object.freeze({
    control: Object.freeze({}),
    erpRead: Object.freeze({
      maxActivitiesPerSecond: env.temporalErpReadMaxActivitiesPerSecond,
      maxTaskQueueActivitiesPerSecond:
        env.temporalErpReadMaxTaskQueueActivitiesPerSecond,
    }),
    opa: Object.freeze({
      maxActivitiesPerSecond: env.temporalOpaMaxActivitiesPerSecond,
      maxTaskQueueActivitiesPerSecond:
        env.temporalOpaMaxTaskQueueActivitiesPerSecond,
    }),
    ixc: Object.freeze({
      maxActivitiesPerSecond: env.temporalIxcMaxActivitiesPerSecond,
      maxTaskQueueActivitiesPerSecond:
        env.temporalIxcMaxTaskQueueActivitiesPerSecond,
    }),
  }),
  schedules: Object.freeze({
    csatStartSurvey: csatTriggerScheduleConfig,
    cobrancasEquipmentRetrievalVerification:
      cobrancasEquipmentRetrievalTriggerScheduleConfig,
    nfeEmailDispatchDiscovery: nfeEmailDispatchDiscoveryScheduleConfig,
    nfeEmailDispatchProcessing: nfeEmailDispatchProcessingScheduleConfig,
  }),
});
