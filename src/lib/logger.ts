import pino from "pino";
import { randomUUID } from "crypto";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  name: "doctorassist-outreach",
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        },
      }
    : {
        formatters: {
          level(label: string) {
            return { level: label };
          },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
});

export function createCorrelationId(): string {
  return randomUUID();
}

export function withCorrelationId(correlationId: string) {
  return logger.child({ correlationId });
}

export type Logger = pino.Logger;
