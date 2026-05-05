import { ApplicationFailure, TemporalFailure } from "@temporalio/workflow";

export function findRootWorkflowFailure(error: unknown): unknown {
  if (error instanceof TemporalFailure && error.cause !== undefined) {
    return findRootWorkflowFailure(error.cause);
  }

  return error;
}

export function findRootApplicationFailure(
  error: unknown,
): ApplicationFailure | null {
  const rootFailure = findRootWorkflowFailure(error);

  if (rootFailure instanceof ApplicationFailure) {
    return rootFailure;
  }

  if (error instanceof ApplicationFailure) {
    return error;
  }

  return null;
}

export function readWorkflowFailureMessage(
  error: unknown,
  fallback = "Unknown workflow error",
): string {
  const rootFailure = findRootWorkflowFailure(error);

  if (rootFailure instanceof Error) {
    return rootFailure.message;
  }

  if (typeof rootFailure === "string") {
    const normalizedMessage = rootFailure.trim();

    if (normalizedMessage.length > 0) {
      return normalizedMessage;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
