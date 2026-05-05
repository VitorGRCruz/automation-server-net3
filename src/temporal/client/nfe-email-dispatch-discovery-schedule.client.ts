import {
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
  type Client,
  type ScheduleDescription,
  type ScheduleOptions,
  type ScheduleUpdateOptions,
} from "@temporalio/client";
import type { FetchCustomerNfeSalesCandidatesWorkflowInput } from "../../domain/nfe/nfe-email-dispatch.types.js";
import { temporalConfig } from "../../infra/config/temporal.config.js";
import { fetchCustomerNfeSalesCandidatesWorkflow } from "../workflows/nfe/fetch-customer-nfe-sales-candidates.workflow.js";
import { createTemporalClient, createTemporalConnection } from "./temporal-client.js";

export interface NfeEmailDispatchDiscoveryScheduleSummary {
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

export async function ensureNfeEmailDispatchDiscoverySchedule(): Promise<NfeEmailDispatchDiscoveryScheduleSummary> {
  const connection = await createTemporalConnection();

  try {
    const client = createTemporalClient(connection);
    const scheduleConfig = temporalConfig.schedules.nfeEmailDispatchDiscovery;

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

    return await describeNfeEmailDispatchDiscoverySchedule(client);
  } finally {
    await connection.close();
  }
}

export async function describeNfeEmailDispatchDiscoverySchedule(
  clientOverride?: Client,
): Promise<NfeEmailDispatchDiscoveryScheduleSummary> {
  const connection = clientOverride === undefined ? await createTemporalConnection() : null;

  try {
    const client =
      clientOverride ?? createTemporalClient(connection as NonNullable<typeof connection>);
    const scheduleDescription = await client.schedule
      .getHandle(temporalConfig.schedules.nfeEmailDispatchDiscovery.scheduleId)
      .describe();

    return summarizeSchedule(scheduleDescription);
  } finally {
    if (connection !== null) {
      await connection.close();
    }
  }
}

export async function findNfeEmailDispatchDiscoverySchedule(): Promise<NfeEmailDispatchDiscoveryScheduleSummary | null> {
  try {
    return await describeNfeEmailDispatchDiscoverySchedule();
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) {
      return null;
    }

    throw error;
  }
}

export async function deleteNfeEmailDispatchDiscoverySchedule(): Promise<{
  scheduleId: string;
  deleted: boolean;
}> {
  const connection = await createTemporalConnection();

  try {
    const client = createTemporalClient(connection);
    const scheduleId = temporalConfig.schedules.nfeEmailDispatchDiscovery.scheduleId;

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
  const scheduleConfig = temporalConfig.schedules.nfeEmailDispatchDiscovery;
  const actionArgs: [FetchCustomerNfeSalesCandidatesWorkflowInput] = [
    {
      requestId: "",
      source: "schedule",
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
          comment: "Run once daily at the configured discovery time",
        },
      ],
      timezone: scheduleConfig.timezone,
    },
    action: {
      type: "startWorkflow",
      workflowType: fetchCustomerNfeSalesCandidatesWorkflow,
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
      workflow: "fetchCustomerNfeSalesCandidatesWorkflow",
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
  const scheduleConfig = temporalConfig.schedules.nfeEmailDispatchDiscovery;

  if (scheduleConfig.enabled) {
    return {
      paused: false,
      note: "NF-e discovery schedule is enabled by project configuration",
    };
  }

  return {
    paused: true,
    note: "NF-e discovery schedule is disabled by project configuration",
  };
}

function summarizeSchedule(
  scheduleDescription: ScheduleDescription,
): NfeEmailDispatchDiscoveryScheduleSummary {
  const scheduleConfig = temporalConfig.schedules.nfeEmailDispatchDiscovery;
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
