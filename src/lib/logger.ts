/**
 * Structured logging utility.
 *
 * Emits JSON-structured logs with: timestamp, level, request_id, endpoint,
 * duration, status, and any extra fields. In production, logs are JSON for
 * machine parsing; in development, they're human-readable.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  request_id?: string;
  endpoint?: string;
  method?: string;
  duration_ms?: number;
  status?: number;
  user_id?: string;
  [key: string]: unknown;
}

function formatLog(entry: LogEntry): string {
  if (process.env.NODE_ENV === "production") {
    return JSON.stringify(entry);
  }
  // Human-readable in development
  const parts = [
    `[${entry.timestamp}]`,
    entry.level.toUpperCase().padEnd(5),
    entry.message,
  ];
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (k !== "timestamp" && k !== "level" && k !== "message") {
      extras[k] = v;
    }
  }
  if (Object.keys(extras).length > 0) {
    parts.push(JSON.stringify(extras));
  }
  return parts.join(" ");
}

export function log(
  level: LogLevel,
  message: string,
  fields?: Omit<LogEntry, "timestamp" | "level" | "message">,
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields,
  };
  const formatted = formatLog(entry);
  if (level === "error") {
    console.error(formatted);
  } else if (level === "warn") {
    console.warn(formatted);
  } else if (level === "debug" && process.env.NODE_ENV !== "production") {
    console.debug(formatted);
  } else {
    console.log(formatted);
  }
}

export function logInfo(message: string, fields?: Record<string, unknown>) {
  log("info", message, fields);
}

export function logWarn(message: string, fields?: Record<string, unknown>) {
  log("warn", message, fields);
}

export function logError(message: string, fields?: Record<string, unknown>) {
  log("error", message, fields);
}

/**
 * Generate a short request ID (for correlation across logs).
 */
export function requestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
