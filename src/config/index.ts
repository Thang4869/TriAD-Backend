import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const configSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.string().default("5000").transform(Number),
    API_URL: z.string().url().optional(),

    DATABASE_URL: z.string().url().min(1, "DATABASE_URL is required"),

    REDIS_URL: z.string().url().default("redis://localhost:6379"),

    JWT_ACCESS_SECRET: z
      .string()
      .min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
    JWT_ACCESS_EXPIRY: z.string().default("15m"),
    JWT_REFRESH_EXPIRY: z.string().default("7d"),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALLBACK_URL: z.string().url().optional(),
    FACEBOOK_APP_ID: z.string().optional(),
    FACEBOOK_APP_SECRET: z.string().optional(),
    FACEBOOK_CALLBACK_URL: z.string().url().optional(),

    FRONTEND_URL: z.string().url().default("http://localhost:3000"),

    CORS_ORIGIN: z
      .string()
      .optional()
      .transform((v) => v?.split(",") || []),

    RATE_LIMIT_WINDOW_MS: z.string().default("60000").transform(Number),
    RATE_LIMIT_MAX: z.string().default("100").transform(Number),

    TOTP_ISSUER: z.string().default("TriAD"),

    IDEMPOTENCY_TTL: z.string().default("86400").transform(Number),

    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    LOG_FILE_PATH: z.string().default("./logs"),

    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().optional().transform(Number),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().email().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      const smtpVars = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
      for (const v of smtpVars) {
        if (!data[v as keyof typeof data]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [v],
            message: `${v} is required in production`,
          });
        }
      }
      if (!data.DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DATABASE_URL"],
          message: "DATABASE_URL is required",
        });
      }
      if (!data.REDIS_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["REDIS_URL"],
          message: "REDIS_URL is required",
        });
      }
    }
  });

export type Config = z.infer<typeof configSchema>;

const parseResult = configSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error("Invalid environment configuration:");
  parseResult.error.errors.forEach((err) => {
    console.error(`  - ${err.path.join(".")}: ${err.message}`);
  });
  process.exit(1);
}

const rawConfig = parseResult.data;

export const config = {
  ...rawConfig,
  isProduction: rawConfig.NODE_ENV === "production",
  isDevelopment: rawConfig.NODE_ENV === "development",
  isTest: rawConfig.NODE_ENV === "test",
} as const;

export default config;
