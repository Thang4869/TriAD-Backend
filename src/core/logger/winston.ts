import winston from "winston";
import "winston-daily-rotate-file";

const logDir = process.env.LOG_FILE_PATH || "./logs";

const dailyRotateFile = new winston.transports.DailyRotateFile({
  dirname: logDir,
  filename: "triad-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxSize: "20m",
  maxFiles: "14d",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
});

const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length
        ? ` ${JSON.stringify(meta)}`
        : "";
      return `[${timestamp}] ${level}: ${message}${metaStr}`;
    }),
  ),
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports: [consoleTransport, dailyRotateFile],
  exceptionHandlers: [consoleTransport, dailyRotateFile],
  rejectionHandlers: [consoleTransport, dailyRotateFile],
});

export default logger;
