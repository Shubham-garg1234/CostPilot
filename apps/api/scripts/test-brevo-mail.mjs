import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });

const apiKey = process.env.BREVO_API_KEY?.trim();
const from = process.env.EMAIL_FROM?.trim();
const to = process.argv[2] ?? "test@example.com";

if (!apiKey || !from) {
  console.error("Set BREVO_API_KEY and EMAIL_FROM in apps/api/.env");
  process.exit(1);
}

const response = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: {
    accept: "application/json",
    "content-type": "application/json",
    "api-key": apiKey
  },
  body: JSON.stringify({
    sender: { name: process.env.EMAIL_FROM_NAME?.trim() || "CostPilot", email: from },
    to: [{ email: to }],
    subject: "CostPilot Brevo test",
    textContent: "If you receive this, Brevo API is working."
  })
});

const body = await response.text();
console.log("status:", response.status);
console.log("body:", body.slice(0, 500));
process.exit(response.ok ? 0 : 1);
