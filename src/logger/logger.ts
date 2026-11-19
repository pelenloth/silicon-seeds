import {
  configure,
  getConsoleSink,
  type Logger as LoggerType,
} from "@logtape/logtape";
import { getLogger } from "@logtape/logtape";
import { prettyFormatter } from "@logtape/pretty";

const LOG_LEVELS = ["debug", "info", "warning", "error"] as const;
type ConfiguredLogLevel = (typeof LOG_LEVELS)[number];

function parse_log_level(): ConfiguredLogLevel {
  const level = Bun.env.LOG_LEVEL?.trim().toLowerCase();
  if (!level) return "info";

  if (level === "warn") return "warning";
  if (LOG_LEVELS.includes(level as ConfiguredLogLevel)) {
    return level as ConfiguredLogLevel;
  }

  return "info";
}

export namespace Logger {
  let logger: LoggerType;

  export async function init() {
    const lowestLevel = parse_log_level();

    await configure({
      sinks: { console: getConsoleSink({ formatter: prettyFormatter }) },
      loggers: [
        { category: ["logtape", "meta"], sinks: [] },
        { category: "app", lowestLevel, sinks: ["console"] },
      ],
    });
    logger = getLogger("app");
  }

  type LogLevel = "info" | "warn" | "error" | "debug";

  function log_handler(level: LogLevel, message: string, value?: unknown) {
    if (!logger) return;
    if (value !== undefined) {
      logger[level](`${message}\n\n{value}\n`, { value });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    logger[level]`${message}`;
  }

  export function info(message: string, value?: unknown) {
    log_handler("info", message, value);
  }

  export function warn(message: string, value?: unknown) {
    log_handler("warn", message, value);
  }

  export function error(message: string, value?: unknown) {
    log_handler("error", message, value);
  }

  export function debug(message: string, value?: unknown) {
    log_handler("debug", message, value);
  }
}
