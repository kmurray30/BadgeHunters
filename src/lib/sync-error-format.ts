export function formatSyncError(error: unknown): string {
  if (error instanceof Error) {
    if (error instanceof AggregateError && error.errors.length > 0) {
      return error.errors.map(formatSyncError).join("; ");
    }
    const message = error.message?.trim();
    if (message) return message;
    if (error.name) return error.name;
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;

    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }

    if (record.message && typeof record.message === "object") {
      return formatSyncError(record.message);
    }

    if (typeof record.error === "string" && record.error.trim()) {
      return record.error;
    }

    if (record.error && typeof record.error === "object") {
      return formatSyncError(record.error);
    }

    const name = typeof record.name === "string" ? record.name : null;
    const code = typeof record.code === "string" ? record.code : null;
    if (name && code) return `${name}: ${code}`;
    if (name) return name;
    if (code) return code;

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") {
        return serialized;
      }
    } catch {
      // Fall through.
    }
  }

  if (error == null) {
    return "Unknown error";
  }

  return String(error);
}
