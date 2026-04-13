import { z } from "zod";

export const envSchema = z.object({
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
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  LLM_PROVIDER_API_KEY: z.string().min(1).default("provider_placeholder"),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  EMAIL_FROM: z.string().email().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_API_URL: z.string().url().optional()
});

export const modelCatalog: Record<
  string,
  { inputPer1k: number; outputPer1k: number; tier: "cheap" | "standard" | "premium" }
> = {
  "gpt-4o-mini": { inputPer1k: 0.00015, outputPer1k: 0.0006, tier: "cheap" },
  "gpt-4.1-mini": { inputPer1k: 0.0004, outputPer1k: 0.0016, tier: "standard" },
  "gpt-4.1": { inputPer1k: 0.002, outputPer1k: 0.008, tier: "premium" }
};
