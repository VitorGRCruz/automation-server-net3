interface WorkerHealthSnapshotState {
  processStartedAt: string;
  bootstrapStarted: boolean;
  bootstrapStartedAt?: string;
  bootstrapCompleted: boolean;
  bootstrapCompletedAt?: string;
  bootstrapFailed: boolean;
  bootstrapFailedAt?: string;
  runLoopStarted: boolean;
  runLoopStartedAt?: string;
  runLoopActive: boolean;
  runLoopStoppedAt?: string;
  fatalError?: string;
  fatalErrorAt?: string;
}

export type WorkerHealthSnapshot = WorkerHealthSnapshotState;

export class WorkerHealthState {
  private state: WorkerHealthSnapshotState = {
    processStartedAt: new Date().toISOString(),
    bootstrapStarted: false,
    bootstrapCompleted: false,
    bootstrapFailed: false,
    runLoopStarted: false,
    runLoopActive: false,
  };

  markBootstrapStarted(): void {
    const now = new Date().toISOString();
    const {
      bootstrapCompletedAt: _bootstrapCompletedAt,
      bootstrapFailedAt: _bootstrapFailedAt,
      ...rest
    } = this.state;

    this.state = {
      ...rest,
      bootstrapStarted: true,
      bootstrapStartedAt: this.state.bootstrapStartedAt ?? now,
      bootstrapCompleted: false,
      bootstrapFailed: false,
    };
  }

  markBootstrapCompleted(): void {
    const { bootstrapFailedAt: _bootstrapFailedAt, ...rest } = this.state;

    this.state = {
      ...rest,
      bootstrapStarted: true,
      bootstrapCompleted: true,
      bootstrapCompletedAt: new Date().toISOString(),
      bootstrapFailed: false,
    };
  }

  markBootstrapFailed(error: unknown): void {
    const now = new Date().toISOString();

    this.state = {
      ...this.state,
      bootstrapStarted: true,
      bootstrapCompleted: false,
      bootstrapFailed: true,
      bootstrapFailedAt: now,
      fatalError: resolveWorkerHealthErrorMessage(error),
      fatalErrorAt: now,
    };
  }

  markRunLoopStarted(): void {
    const { runLoopStoppedAt: _runLoopStoppedAt, ...rest } = this.state;

    this.state = {
      ...rest,
      runLoopStarted: true,
      runLoopStartedAt: this.state.runLoopStartedAt ?? new Date().toISOString(),
      runLoopActive: true,
    };
  }

  markRunLoopStopped(): void {
    if (!this.state.runLoopStarted && !this.state.runLoopActive) {
      return;
    }

    this.state = {
      ...this.state,
      runLoopActive: false,
      runLoopStoppedAt: new Date().toISOString(),
    };
  }

  markFatalError(error: unknown): void {
    this.state = {
      ...this.state,
      fatalError: resolveWorkerHealthErrorMessage(error),
      fatalErrorAt: new Date().toISOString(),
      runLoopActive: false,
    };
  }

  getSnapshot(): WorkerHealthSnapshot {
    return { ...this.state };
  }
}

function resolveWorkerHealthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown worker error";
}
