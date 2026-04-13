export const summaryCards = [
  { label: "Monthly Spend", value: "$12,842", delta: "+7.2%" },
  { label: "Tokens Routed", value: "44.8M", delta: "+19.4%" },
  { label: "Policy Blocks", value: "186", delta: "+34 today" },
  { label: "Savings Suggested", value: "$3,920", delta: "31% cheaper" }
];

export const teamBreakdown = [
  { team: "Platform", cost: "$4,280", tokens: "11.2M", role: "SDE2-heavy" },
  { team: "Support Ops", cost: "$2,120", tokens: "8.6M", role: "Manager-led" },
  { team: "Growth", cost: "$3,960", tokens: "15.4M", role: "Mixed" },
  { team: "Research", cost: "$2,482", tokens: "9.6M", role: "Senior-only GPT-4.1" }
];

export const policyRows = [
  {
    role: "Intern",
    category: "code_generation",
    feature: "copilot",
    models: "gpt-4o-mini only",
    action: "Block",
    limit: "0 tokens/day"
  },
  {
    role: "SDE1",
    category: "email_generation",
    feature: "auto_reply",
    models: "mini tiers",
    action: "Warn",
    limit: "10k tokens/day"
  },
  {
    role: "Manager",
    category: "chat",
    feature: "assistant",
    models: "gpt-4.1 enabled",
    action: "Throttle",
    limit: "250 req/hr"
  }
];

export const alerts = [
  {
    title: "Platform team crossed 80% of GPT-4.1 budget",
    detail: "Daily trend suggests budget exhaustion in 3.2 days unless routing shifts to mini tier.",
    severity: "warning"
  },
  {
    title: "Intern attempted blocked code generation",
    detail: "Policy enforcement stopped 12 copilot requests within a 10 minute window.",
    severity: "critical"
  },
  {
    title: "Email auto-reply prompt waste detected",
    detail: "Prompt template includes 1.8k redundant context tokens. Estimated savings: $610/month.",
    severity: "info"
  }
];
