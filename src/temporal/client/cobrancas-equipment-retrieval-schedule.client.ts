import {
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
  type CalendarSpec,
  type Client,
  type ScheduleDescription,
  type ScheduleOptions,
  type ScheduleUpdateOptions,
} from "@temporalio/client";
import type { EquipmentRetrievalVerificationTriggerWorkflowInput } from "../../domain/cobrancas/equipment-retrieval-verification.types.js";
import { temporalConfig } from "../../infra/config/temporal.config.js";
import {
  equipmentRetrievalVerificationWorkflow,
} from "../workflows/cobrancas/equipment-retrieval-verification.workflow.js";
import { createTemporalClient, createTemporalConnection } from "./temporal-client.js";

export interface CobrancasEquipmentRetrievalTriggerScheduleSummary {
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

export async function ensureCobrancasEquipmentRetrievalTriggerSchedule(): Promise<CobrancasEquipmentRetrievalTriggerScheduleSummary> {
  const connection = await createTemporalConnection();

  try {
    const client = createTemporalClient(connection);
    const scheduleConfig = temporalConfig.schedules.cobrancasEquipmentRetrievalVerification;

    try {
      await client.schedule.create(buildCreateScheduleOptions());
    } catch (error) {
      if (!(error instanceof ScheduleAlreadyRunning)) {
        throw error;
      }

      const handle = client.schedule.getHandle(scheduleConfig.scheduleId);

      await handle.update(() => buildUpdateScheduleOptions());
    }

    return await describeCobrancasEquipmentRetrievalTriggerSchedule(client);
  } finally {
    await connection.close();
  }
}

export async function describeCobrancasEquipmentRetrievalTriggerSchedule(
  clientOverride?: Client,
): Promise<CobrancasEquipmentRetrievalTriggerScheduleSummary> {
  const connection = clientOverride === undefined ? await createTemporalConnection() : null;

  try {
    const client =
      clientOverride ?? createTemporalClient(connection as NonNullable<typeof connection>);

    const scheduleDescription = await client.schedule
      .getHandle(temporalConfig.schedules.cobrancasEquipmentRetrievalVerification.scheduleId)
      .describe();

    return summarizeSchedule(scheduleDescription);
  } finally {
    if (connection !== null) {
      await connection.close();
    }
  }
}

export async function findCobrancasEquipmentRetrievalTriggerSchedule(): Promise<CobrancasEquipmentRetrievalTriggerScheduleSummary | null> {
  try {
    return await describeCobrancasEquipmentRetrievalTriggerSchedule();
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) {
      return null;
    }

    throw error;
  }
}

export async function deleteCobrancasEquipmentRetrievalTriggerSchedule(): Promise<{
  scheduleId: string;
  deleted: boolean;
}> {
  const connection = await createTemporalConnection();

  try {
    const client = createTemporalClient(connection);
    const scheduleId =
      temporalConfig.schedules.cobrancasEquipmentRetrievalVerification.scheduleId;

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
  const scheduleConfig = temporalConfig.schedules.cobrancasEquipmentRetrievalVerification;
  const catchupWindow = `${scheduleConfig.intervalMinutes} minutes`;
  const actionArgs: [EquipmentRetrievalVerificationTriggerWorkflowInput] = [
    {
      requestId: "",
      source: "schedule",
      startAt: scheduleConfig.startAt,
    },
  ];

  return {
    scheduleId: scheduleConfig.scheduleId,
    spec: {
      calendars: buildWindowedCalendarSpecs(),
      timezone: scheduleConfig.timezone,
    },
    action: {
      type: "startWorkflow",
      workflowType: equipmentRetrievalVerificationWorkflow,
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
      module: "cobrancas",
      workflow: "equipmentRetrievalVerificationWorkflow",
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
  const scheduleConfig = temporalConfig.schedules.cobrancasEquipmentRetrievalVerification;

  if (scheduleConfig.enabled) {
    return {
      paused: false,
      note: "Cobrancas equipment retrieval trigger schedule is enabled by project configuration",
    };
  }

  return {
    paused: true,
    note: "Cobrancas equipment retrieval trigger schedule is disabled by project configuration",
  };
}

function summarizeSchedule(
  scheduleDescription: ScheduleDescription,
): CobrancasEquipmentRetrievalTriggerScheduleSummary {
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

  return temporalConfig.schedules.cobrancasEquipmentRetrievalVerification.intervalMinutes;
}

function buildWindowedCalendarSpecs(): CalendarSpec[] {
  const scheduleConfig = temporalConfig.schedules.cobrancasEquipmentRetrievalVerification;
  const windowStartInMinutes =
    scheduleConfig.windowStartHour * 60 + scheduleConfig.windowStartMinute;
  const windowEndInMinutes =
    scheduleConfig.windowEndHour * 60 + scheduleConfig.windowEndMinute;

  if (windowStartInMinutes > windowEndInMinutes) {
    throw new Error(
      "Cobrancas equipment retrieval schedule window must start before or at the end time",
    );
  }

  const minutesByHour = new Map<number, number[]>();

  for (
    let currentMinuteOfDay = windowStartInMinutes;
    currentMinuteOfDay <= windowEndInMinutes;
    currentMinuteOfDay += scheduleConfig.intervalMinutes
  ) {
    const hour = Math.floor(currentMinuteOfDay / 60);
    const minute = currentMinuteOfDay % 60;
    const minutes = minutesByHour.get(hour);

    if (minutes === undefined) {
      minutesByHour.set(hour, [minute]);

      continue;
    }

    minutes.push(minute);
  }

  return Array.from(minutesByHour.entries(), ([hour, minute]) => ({
    hour,
    minute,
    second: 0,
    comment: `Run every ${scheduleConfig.intervalMinutes} minutes within the configured daily window`,
  }));
}
