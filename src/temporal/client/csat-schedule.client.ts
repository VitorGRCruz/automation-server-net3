import {
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
  type Client,
  type ScheduleOptions,
  type ScheduleDescription,
  type ScheduleUpdateOptions,
} from "@temporalio/client";
import type { CsatStartSurveyWorkflowInput } from "../../domain/csat/csat-start-survey.types.js";
import { temporalConfig } from "../../infra/config/temporal.config.js";
import { csatStartSurveyWorkflow } from "../workflows/csat/csat-start-survey.workflow.js";
import { createTemporalClient, createTemporalConnection } from "./temporal-client.js";

export interface CsatTriggerScheduleSummary {
  scheduleId: string;
  workflowType: string;
  workflowId: string | undefined;
  taskQueue: string;
  enabled: boolean;
  paused: boolean;
  note: string | undefined;
  intervalMinutes: number;
  nextActionTimes: string[];
  recentWorkflowIds: string[];
  actionInput: unknown;
}

export async function ensureCsatTriggerSchedule(): Promise<CsatTriggerScheduleSummary> {
  const connection = await createTemporalConnection();

  try {
    const client = createTemporalClient(connection);
    const scheduleConfig = temporalConfig.schedules.csatStartSurvey;

    try {
      await client.schedule.create(buildCreateScheduleOptions());
    } catch (error) {
      if (!(error instanceof ScheduleAlreadyRunning)) {
        throw error;
      }

      const handle = client.schedule.getHandle(scheduleConfig.scheduleId);

      await handle.update(() => buildUpdateScheduleOptions());
    }

    return await describeCsatTriggerSchedule(client);
  } finally {
    await connection.close();
  }
}

export async function describeCsatTriggerSchedule(
  clientOverride?: Client,
): Promise<CsatTriggerScheduleSummary> {
  const connection = clientOverride === undefined ? await createTemporalConnection() : null;

  try {
    const client =
      clientOverride ?? createTemporalClient(connection as NonNullable<typeof connection>);

    const scheduleDescription = await client.schedule
      .getHandle(temporalConfig.schedules.csatStartSurvey.scheduleId)
      .describe();

    return summarizeCsatTriggerSchedule(scheduleDescription);
  } finally {
    if (connection !== null) {
      await connection.close();
    }
  }
}

export async function findCsatTriggerSchedule(): Promise<CsatTriggerScheduleSummary | null> {
  try {
    return await describeCsatTriggerSchedule();
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) {
      return null;
    }

    throw error;
  }
}

export async function deleteCsatTriggerSchedule(): Promise<{
  scheduleId: string;
  deleted: boolean;
}> {
  const connection = await createTemporalConnection();

  try {
    const client = createTemporalClient(connection);
    const scheduleId = temporalConfig.schedules.csatStartSurvey.scheduleId;

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

function buildCreateScheduleOptions() {
  const scheduleConfig = temporalConfig.schedules.csatStartSurvey;
  const catchupWindow = `${scheduleConfig.intervalMinutes} minutes`;
  const actionArgs: [CsatStartSurveyWorkflowInput] = [
    {
      requestId: "",
      source: "schedule",
    },
  ];

  return {
    scheduleId: scheduleConfig.scheduleId,
    spec: {
      intervals: [
        {
          every: `${scheduleConfig.intervalMinutes} minutes`,
        },
      ],
    },
    action: {
      type: "startWorkflow" as const,
      workflowType: csatStartSurveyWorkflow,
      taskQueue: scheduleConfig.taskQueue,
      workflowId: scheduleConfig.workflowId,
      args: actionArgs,
    },
    policies: {
      overlap: ScheduleOverlapPolicy.SKIP,
      // Limit catch-up to a single missed interval to avoid burst replays after recovery.
      catchupWindow,
      pauseOnFailure: false,
    },
    state: buildScheduleState(),
    memo: {
      owner: "automation-server-net3",
      module: "csat",
      workflow: "csatStartSurveyWorkflow",
    },
  } satisfies ScheduleOptions;
}

function buildUpdateScheduleOptions(): ScheduleUpdateOptions {
  const createOptions = buildCreateScheduleOptions();

  return {
    spec: createOptions.spec,
    action: createOptions.action,
    policies: createOptions.policies,
    state: buildScheduleState(),
  };
}

function buildScheduleState() {
  const scheduleConfig = temporalConfig.schedules.csatStartSurvey;

  if (scheduleConfig.enabled) {
    return {
      paused: false,
      note: "CSAT trigger schedule is enabled by project configuration",
    };
  }

  return {
    paused: true,
    note: "CSAT trigger schedule is disabled by project configuration",
  };
}

function summarizeCsatTriggerSchedule(
  scheduleDescription: ScheduleDescription,
): CsatTriggerScheduleSummary {
  const intervalMinutes = readScheduleIntervalMinutes(scheduleDescription);
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
    intervalMinutes,
    nextActionTimes: scheduleDescription.info.nextActionTimes.map((value) =>
      value.toISOString(),
    ),
    recentWorkflowIds,
    actionInput: scheduleDescription.action.args?.[0],
  };
}

function readScheduleIntervalMinutes(scheduleDescription: ScheduleDescription): number {
  const interval = scheduleDescription.spec.intervals?.[0];

  if (interval !== undefined) {
    return Math.round(interval.every / 60000);
  }

  return temporalConfig.schedules.csatStartSurvey.intervalMinutes;
}
