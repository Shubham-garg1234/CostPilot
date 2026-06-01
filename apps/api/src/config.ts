import { z } from "zod";

const dependencyModeSchema = z.enum(["required", "optional"]);
const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}, z.string().min(1).optional());

const optionalEmail = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}, z.string().email().optional());

const optionalPositiveInteger = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}, z.coerce.number().int().positive().optional());

const envBoolean = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }
  return value;
}, z.boolean());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AUTH_MODE: z.literal("clerk").default("clerk"),
  POSTGRES_MODE: dependencyModeSchema.default("required"),
  REDIS_MODE: dependencyModeSchema.default("optional"),
  CLICKHOUSE_MODE: dependencyModeSchema.default("optional"),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/costpilot"),
  DIRECT_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  CLICKHOUSE_URL: z.string().url().default("http://localhost:8123"),
  CLICKHOUSE_USERNAME: z.string().min(1).default("default"),
  CLICKHOUSE_PASSWORD: z.string().default(""),
  CLICKHOUSE_DATABASE: z.string().min(1).default("costpilot"),
  CLICKHOUSE_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(30_000),
  STRIPE_SECRET_KEY: z.string().min(1).default("sk_test_placeholder"),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).default("whsec_placeholder"),
  CLERK_SECRET_KEY: z.string().min(1).default("sk_test_placeholder"),
  CLERK_JWT_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_AUTHORIZED_PARTIES: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  PROMPT_ENHANCEMENT_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  LLM_PROVIDER_API_KEY: z.string().min(1).default("provider_placeholder"),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  EMPLOYEE_AUTH_SECRET: z.string().min(1).default("employee_auth_dev_secret"),
  SMTP_HOST: z.string().optional(),
  NODEMAILER_SERVICE: z.string().optional(),
  SMTP_PORT: optionalPositiveInteger,
  SMTP_SECURE: envBoolean.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_TIMEOUT_MS: z.coerce.number().int().min(3000).max(120_000).default(15_000),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  EMAIL_FROM: z.string().email().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  COSTPILOT_EMPLOYEE_EMAIL: optionalEmail,
  COSTPILOT_EMPLOYEE_PASSWORD: optionalNonEmptyString,
  COSTPILOT_API_URL: z.string().url().optional()
});

export const parsedEnvSchema = envSchema.superRefine((env, ctx) => {
  const hasMcpEmployeeCreds =
    Boolean(env.COSTPILOT_EMPLOYEE_EMAIL) ||
    Boolean(env.COSTPILOT_EMPLOYEE_PASSWORD);
  if (hasMcpEmployeeCreds && (!env.COSTPILOT_EMPLOYEE_EMAIL || !env.COSTPILOT_EMPLOYEE_PASSWORD)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "COSTPILOT_EMPLOYEE_EMAIL and COSTPILOT_EMPLOYEE_PASSWORD must be set together."
    });
  }

  if (env.NODE_ENV !== "production") {
    return;
  }

  const disallowedPlaceholders = [
    ["STRIPE_SECRET_KEY", env.STRIPE_SECRET_KEY, "sk_test_placeholder"],
    ["STRIPE_WEBHOOK_SECRET", env.STRIPE_WEBHOOK_SECRET, "whsec_placeholder"],
    ["CLERK_SECRET_KEY", env.CLERK_SECRET_KEY, "sk_test_placeholder"],
    ["EMPLOYEE_AUTH_SECRET", env.EMPLOYEE_AUTH_SECRET, "employee_auth_dev_secret"],
    ["LLM_PROVIDER_API_KEY", env.LLM_PROVIDER_API_KEY, "provider_placeholder"]
  ] as const;

  for (const [key, value, placeholder] of disallowedPlaceholders) {
    if (value === placeholder) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${key} cannot use the placeholder value in production.`
      });
    }
  }

  if (!env.NEXT_PUBLIC_APP_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "NEXT_PUBLIC_APP_URL is required in production."
    });
  }

  if (!env.NEXT_PUBLIC_API_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "NEXT_PUBLIC_API_URL is required in production."
    });
  }

  const hasUpstash = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
  const hasRedisUrl = Boolean(env.REDIS_URL && env.REDIS_URL !== "redis://localhost:6379");
  if (!hasUpstash && !hasRedisUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Configure Redis using either UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN or a hosted REDIS_URL in production."
    });
  }

  if (!env.CLICKHOUSE_URL || env.CLICKHOUSE_URL === "http://localhost:8123") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "CLICKHOUSE_URL must be configured with the hosted ClickHouse endpoint in production."
    });
  }

  if (!env.CLICKHOUSE_USERNAME) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "CLICKHOUSE_USERNAME is required in production."
    });
  }

  if (!env.CLERK_JWT_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "CLERK_JWT_KEY is required in production."
    });
  }

  if (!env.CLERK_PUBLISHABLE_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "CLERK_PUBLISHABLE_KEY is required in production."
    });
  }


});

let cachedEnv: z.infer<typeof parsedEnvSchema> | null = null;

export function getEnvConfig() {
  cachedEnv ??= parsedEnvSchema.parse(process.env);
  return cachedEnv;
}

export const modelCatalog: Record<
  string,
  { inputPer1k: number; outputPer1k: number; tier: "cheap" | "standard" | "premium" }
> = {
  "gpt-4o-mini": { inputPer1k: 0.00015, outputPer1k: 0.0006, tier: "cheap" },
  "gpt-4.1-mini": { inputPer1k: 0.0004, outputPer1k: 0.0016, tier: "standard" },
  "gpt-4.1": { inputPer1k: 0.002, outputPer1k: 0.008, tier: "premium" }
};
