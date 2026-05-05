interface ShutdownLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error: unknown, context?: Record<string, unknown>): void;
}

export interface ShutdownStep {
  name: string;
  run: () => Promise<void> | void;
}

interface RegisterGracefulShutdownInput {
  component: string;
  logger: ShutdownLogger;
  onSignal: (signal: NodeJS.Signals) => Promise<void>;
}

interface GracefulShutdownHandle {
  remove(): void;
  getSignal(): NodeJS.Signals | null;
  waitForShutdown(): Promise<void> | null;
}

const PROCESS_SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

export function registerGracefulShutdown(
  input: RegisterGracefulShutdownInput,
): GracefulShutdownHandle {
  let activeSignal: NodeJS.Signals | null = null;
  let shutdownPromise: Promise<void> | null = null;

  const handleSignal = (signal: NodeJS.Signals) => {
    if (activeSignal !== null) {
      input.logger.warn("Repeated shutdown signal ignored while shutdown is already in progress", {
        component: input.component,
        currentSignal: activeSignal,
        ignoredSignal: signal,
      });
      return;
    }

    activeSignal = signal;
    process.exitCode = 0;

    input.logger.info("Shutdown signal received", {
      component: input.component,
      signal,
    });

    shutdownPromise = input.onSignal(signal).catch((error) => {
      process.exitCode = 1;
      input.logger.error("Shutdown signal handling failed", error, {
        component: input.component,
        signal,
      });
    });
  };

  for (const signal of PROCESS_SHUTDOWN_SIGNALS) {
    process.on(signal, handleSignal);
  }

  return {
    remove() {
      for (const signal of PROCESS_SHUTDOWN_SIGNALS) {
        process.off(signal, handleSignal);
      }
    },
    getSignal() {
      return activeSignal;
    },
    waitForShutdown() {
      return shutdownPromise;
    },
  };
}

export async function runShutdownSteps(
  logger: ShutdownLogger,
  context: {
    component: string;
    signal?: NodeJS.Signals | null;
  },
  steps: readonly ShutdownStep[],
): Promise<void> {
  const failures: unknown[] = [];

  for (const step of steps) {
    logger.info("Shutdown step started", {
      component: context.component,
      signal: context.signal ?? undefined,
      step: step.name,
    });

    try {
      await step.run();
      logger.info("Shutdown step completed", {
        component: context.component,
        signal: context.signal ?? undefined,
        step: step.name,
      });
    } catch (error) {
      failures.push(error);
      logger.error("Shutdown step failed", error, {
        component: context.component,
        signal: context.signal ?? undefined,
        step: step.name,
      });
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, `${context.component} shutdown failed`);
  }
}
