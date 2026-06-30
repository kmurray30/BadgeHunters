export interface SyncErrorSnapshot {
  message: string;
  name?: string;
  stack?: string;
  cause?: string;
  url?: string;
  at?: string;
}

export function formatSyncError(error: unknown): string {
  return buildSyncErrorSnapshot(error).message;
}

export function buildSyncErrorSnapshot(
  error: unknown,
  options?: { url?: string; at?: Date },
): SyncErrorSnapshot {
  const at = (options?.at ?? new Date()).toISOString();
  const url = options?.url;

  if (error instanceof Error) {
    if (error instanceof AggregateError && error.errors.length > 0) {
      return {
        message: error.errors.map(formatSyncError).join("; "),
        name: error.name !== "Error" ? error.name : undefined,
        stack: error.stack,
        cause: error.cause != null ? formatSyncError(error.cause) : undefined,
        url,
        at,
      };
    }

    const message = error.message?.trim();
    return {
      message: message || error.name || "Unknown error",
      name: error.name !== "Error" ? error.name : undefined,
      stack: error.stack,
      cause: error.cause != null ? formatSyncError(error.cause) : undefined,
      url,
      at,
    };
  }

  if (typeof error === "string") {
    return { message: error, url, at };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const stack =
      typeof record.stack === "string" && record.stack.trim()
        ? record.stack
        : undefined;

    if (typeof record.message === "string" && record.message.trim()) {
      return {
        message: record.message,
        name: typeof record.name === "string" ? record.name : undefined,
        stack,
        url,
        at,
      };
    }

    if (record.message && typeof record.message === "object") {
      const nested = buildSyncErrorSnapshot(record.message, options);
      return { ...nested, url: url ?? nested.url, at: nested.at ?? at };
    }

    if (typeof record.error === "string" && record.error.trim()) {
      return {
        message: record.error,
        name: typeof record.name === "string" ? record.name : undefined,
        stack,
        url,
        at,
      };
    }

    if (record.error && typeof record.error === "object") {
      const nested = buildSyncErrorSnapshot(record.error, options);
      return { ...nested, url: url ?? nested.url, at: nested.at ?? at };
    }

    const name = typeof record.name === "string" ? record.name : null;
    const code = typeof record.code === "string" ? record.code : null;
    if (name && code) {
      return { message: `${name}: ${code}`, name, stack, url, at };
    }
    if (name) {
      return { message: name, name, stack, url, at };
    }
    if (code) {
      return { message: code, stack, url, at };
    }

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") {
        return { message: serialized, url, at };
      }
    } catch {
      // Fall through.
    }
  }

  if (error == null) {
    return { message: "Unknown error", url, at };
  }

  return { message: String(error), url, at };
}
