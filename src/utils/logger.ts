// Logger that ALWAYS writes to stderr.
//
// This is critical for stdio MCP transports: stdout is reserved for
// JSON-RPC messages. ANYTHING written to stdout that isn't a valid
// JSON-RPC frame corrupts the protocol and silently breaks the client.
// Writing through console.log here would brick Claude Desktop sessions.

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let currentLevel: number = LEVELS.info;

export function setLogLevel(level: LogLevel): void {
  currentLevel = LEVELS[level];
}

function emit(level: LogLevel, message: string, extra?: unknown): void {
  if (LEVELS[level] < currentLevel) return;
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  // process.stderr.write keeps us safely off stdout.
  if (extra !== undefined) {
    process.stderr.write(`${prefix} ${message} ${formatExtra(extra)}\n`);
  } else {
    process.stderr.write(`${prefix} ${message}\n`);
  }
}

function formatExtra(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ""}`;
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const logger = {
  debug: (message: string, extra?: unknown) => emit("debug", message, extra),
  info: (message: string, extra?: unknown) => emit("info", message, extra),
  warn: (message: string, extra?: unknown) => emit("warn", message, extra),
  error: (message: string, extra?: unknown) => emit("error", message, extra),
};
