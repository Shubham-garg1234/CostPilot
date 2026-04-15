import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AUTH_MODE: z.enum(["demo", "clerk"]).default("demo"),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/costpilot"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  CLICKHOUSE_URL: z.string().url().default("http://localhost:8123"),
  CLICKHOUSE_USERNAME: z.string().min(1).default("default"),
  CLICKHOUSE_PASSWORD: z.string().default(""),
  CLICKHOUSE_DATABASE: z.string().min(1).default("costpilot"),
  STRIPE_SECRET_KEY: z.string().min(1).default("sk_test_placeholder"),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).default("whsec_placeholder"),
  CLERK_SECRET_KEY: z.string().min(1).default("sk_test_placeholder"),
  CLERK_JWT_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_AUTHORIZED_PARTIES: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LLM_PROVIDER_API_KEY: z.string().min(1).default("provider_placeholder"),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  EMAIL_FROM: z.string().email().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_API_URL: z.string().url().optional()
});

export const parsedEnvSchema = envSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") {
    return;
  }

  if (env.AUTH_MODE !== "clerk") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "AUTH_MODE must be set to 'clerk' in production."
    });
  }

  const disallowedPlaceholders = [
    ["STRIPE_SECRET_KEY", env.STRIPE_SECRET_KEY, "sk_test_placeholder"],
    ["STRIPE_WEBHOOK_SECRET", env.STRIPE_WEBHOOK_SECRET, "whsec_placeholder"],
    ["CLERK_SECRET_KEY", env.CLERK_SECRET_KEY, "sk_test_placeholder"],
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
