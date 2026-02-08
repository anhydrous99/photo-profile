type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getCurrentLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL as LogLevel | undefined;
  if (envLevel && envLevel in LOG_LEVELS) return envLevel;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

interface LogEntry {
  level: LogLevel;
  msg: string;
  timestamp: string;
  [key: string]: unknown;
}

function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
  if (LOG_LEVELS[level] < LOG_LEVELS[getCurrentLevel()]) return;

  const entry: LogEntry = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...data,
  };

  if (data) {
    for (const [key, value] of Object.entries(data)) {
      if (value instanceof Error) {
        entry[key] = { message: value.message, stack: value.stack };
      }
    }
  }

  const method =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;

  if (process.env.NODE_ENV === "production") {
    method(JSON.stringify(entry));
  } else {
    const prefix = `[${level.toUpperCase()}]`;
    method(prefix, msg, data ? data : "");
  }
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) =>
    log("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) =>
    log("error", msg, data),
};
