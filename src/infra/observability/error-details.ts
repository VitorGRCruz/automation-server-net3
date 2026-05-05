function serializeUnknownCause(
  value: unknown,
  depth: number,
): unknown {
  if (depth >= 2) {
    return "[truncated]";
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: serializeUnknownCause(value.cause, depth + 1),
    };
  }

  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeUnknownCause(item, depth + 1));
  }

  if (typeof value === "object") {
    const serializedEntries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      serializeUnknownCause(item, depth + 1),
    ]);

    return Object.fromEntries(serializedEntries);
  }

  return value;
}

export function getErrorLogDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: serializeUnknownCause(error.cause, 0),
    };
  }

  return {
    name: "NonErrorThrown",
    message: "Internal server error",
    cause: serializeUnknownCause(error, 0),
  };
}
