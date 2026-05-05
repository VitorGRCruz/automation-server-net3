import {
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
  type Client,
  type ScheduleDescription,
  type ScheduleOptions,
  type ScheduleUpdateOptions,
} from "@temporalio/client";
import type { ProcessNfeEmailDispatchSalesWorkflowInput } from "../../domain/nfe/nfe-email-dispatch.types.js";
import { temporalConfig } from "../../infra/config/temporal.config.js";
import { processNfeEmailDispatchSalesWorkflow } from "../workflows/nfe/process-nfe-email-dispatch-sales.workflow.js";
import { createTemporalClient, createTemporalConnection } from "./temporal-client.js";

export interface NfeEmailDispatchProcessingScheduleSummary {
  scheduleId: string;
  workflowType: string;
  workflowId: string | undefined;
  taskQueue: string;
  enabled: boolean;
  paused: boolean;
  note: string | undefined;
  timezone: string;
  hour: number;
  minute: number;
  nextActionTimes: string[];
  recentWorkflowIds: string[];
  actionInput: unknown;
}

export async function ensureNfeEmailDispatchProcessingSchedule(): Promise<NfeEmailDispatchProcessingScheduleSummary> {
  const connection = await createTemporalConnection();

  try {
    const client = createTemporalClient(connection);
    const scheduleConfig = temporalConfig.schedules.nfeEmailDispatchProcessing;

    try {
      await client.schedule.create(buildCreateScheduleOptions());
    } catch (error) {
      if (!(error instanceof ScheduleAlreadyRunning)) {
        throw error;
      }

      await client.schedule
        .getHandle(scheduleConfig.scheduleId)
        .update(() => buildUpdateScheduleOptions());
    }

    return await describeNfeEmailDispatchProcessingSchedule(client);
  } finally {
    await connection.close();
  }
}

export async function describeNfeEmailDispatchProcessingSchedule(
  clientOverride?: Client,
): Promise<NfeEmailDispatchProcessingScheduleSummary> {
  const connection = clientOverride === undefined ? await createTemporalConnection() : null;

  try {
    const client =
      clientOverride ?? createTemporalClient(connection as NonNullable<typeof connection>);
    const scheduleDescription = await client.schedule
      .getHandle(temporalConfig.schedules.nfeEmailDispatchProcessing.scheduleId)
      .describe();

    return summarizeSchedule(scheduleDescription);
  } finally {
    if (connection !== null) {
      await connection.close();
    }
  }
}

export async function findNfeEmailDispatchProcessingSchedule(): Promise<NfeEmailDispatchProcessingScheduleSummary | null> {
  try {
    return await describeNfeEmailDispatchProcessingSchedule();
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) {
      return null;
    }

    throw error;
  }
}

export async function deleteNfeEmailDispatchProcessingSchedule(): Promise<{
  scheduleId: string;
  deleted: boolean;
}> {
  const connection = await createTemporalConnection();

  try {
    const client = createTemporalClient(connection);
    const scheduleId = temporalConfig.schedules.nfeEmailDispatchProcessing.scheduleId;

    try {
      await client.schedule.getHandle(scheduleId).delete();

      return {
        scheduleId,
        deleted: true,
      };
    } catch (error) {
      if (!(error instanceof ScheduleNotFoundError)) {
        throw error;
      }

      return {
        scheduleId,
        deleted: false,
      };
    }
  } finally {
    await connection.close();
  }
}

function buildCreateScheduleOptions(): ScheduleOptions {
  const scheduleConfig = temporalConfig.schedules.nfeEmailDispatchProcessing;
  const actionArgs: [ProcessNfeEmailDispatchSalesWorkflowInput] = [
    {
      requestId: "",
      source: "schedule",
      discoveryWorkflowId: temporalConfig.schedules.nfeEmailDispatchDiscovery.workflowId,
    },
  ];

  return {
    scheduleId: scheduleConfig.scheduleId,
    spec: {
      calendars: [
        {
          hour: scheduleConfig.hour,
          minute: scheduleConfig.minute,
          second: 0,
          comment: "Run once daily at the configured processing time",
        },
      ],
      timezone: scheduleConfig.timezone,
    },
    action: {
      type: "startWorkflow",
      workflowType: processNfeEmailDispatchSalesWorkflow,
      taskQueue: scheduleConfig.taskQueue,
      workflowId: scheduleConfig.workflowId,
      args: actionArgs,
    },
    policies: {
      overlap: ScheduleOverlapPolicy.SKIP,
      catchupWindow: "1 day",
      pauseOnFailure: false,
    },
    state: buildScheduleState(),
    memo: {
      owner: "automation-server-net3",
      module: "nfe",
      workflow: "processNfeEmailDispatchSalesWorkflow",
    },
  };
}

function buildUpdateScheduleOptions(): ScheduleUpdateOptions {
  const createOptions = buildCreateScheduleOptions();

  return {
    spec: createOptions.spec,
    action: createOptions.action,
    state: buildScheduleState(),
    ...(createOptions.policies === undefined
      ? {}
      : { policies: createOptions.policies }),
  };
}

function buildScheduleState() {
  const scheduleConfig = temporalConfig.schedules.nfeEmailDispatchProcessing;

  if (scheduleConfig.enabled) {
    return {
      paused: false,
      note: "NF-e processing schedule is enabled by project configuration",
    };
  }

  return {
    paused: true,
    note: "NF-e processing schedule is disabled by project configuration",
  };
}

function summarizeSchedule(
  scheduleDescription: ScheduleDescription,
): NfeEmailDispatchProcessingScheduleSummary {
  const scheduleConfig = temporalConfig.schedules.nfeEmailDispatchProcessing;
  const recentWorkflowIds = scheduleDescription.info.recentActions
    .filter((action) => action.action.type === "startWorkflow")
    .map((action) => action.action.workflow.workflowId);

  return {
    scheduleId: scheduleDescription.scheduleId,
    workflowType: scheduleDescription.action.workflowType,
    workflowId: scheduleDescription.action.workflowId,
    taskQueue: scheduleDescription.action.taskQueue,
    enabled: !scheduleDescription.state.paused,
    paused: scheduleDescription.state.paused,
    note: scheduleDescription.state.note,
    timezone: scheduleDescription.spec.timezone ?? scheduleConfig.timezone,
    hour: scheduleConfig.hour,
    minute: scheduleConfig.minute,
    nextActionTimes: scheduleDescription.info.nextActionTimes.map((value) =>
      value.toISOString(),
    ),
    recentWorkflowIds,
    actionInput: scheduleDescription.action.args?.[0],
  };
}
