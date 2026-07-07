import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const SUPPORTED_DAISU_PROVIDERS = ["openai", "anthropic"];
const DEFAULT_DAISU_MODEL = "gpt-4.1-mini";
const DEFAULT_DAISU_API_URL = "https://api.openai.com/v1/chat/completions";

export const createConfig = (env = process.env) => {
  const adminPassword = env.ADMIN_PASSWORD || "counciltalk";

  return {
    env,
    projectRoot,
    port: Number(env.PORT || 3000),
    adminPassword,
    adminToken: env.ADMIN_TOKEN || "",
    publicBaseUrl: env.PUBLIC_BASE_URL || "",
    dataDir: env.DATA_DIR || path.join(projectRoot, "data"),
    staticDir: path.join(projectRoot, "dist"),
    smtp: {
      host: env.SMTP_HOST || "",
      port: Number(env.SMTP_PORT || 587),
      secure: env.SMTP_SECURE === "true",
      user: env.SMTP_USER || "",
      pass: env.SMTP_PASS || "",
      from: env.SMTP_FROM || env.SMTP_USER || "",
    },
    discordWebhookUrl: env.DISCORD_WEBHOOK_URL || "",
    daisuAi: {
      provider: SUPPORTED_DAISU_PROVIDERS.includes(String(env.DAISU_AI_PROVIDER || "").trim())
        ? String(env.DAISU_AI_PROVIDER || "").trim()
        : "openai",
      apiKey: env.DAISU_AI_API_KEY || "",
      apiUrl: env.DAISU_AI_API_URL || DEFAULT_DAISU_API_URL,
      model: env.DAISU_AI_MODEL || DEFAULT_DAISU_MODEL,
      enabled: env.DAISU_AI_ENABLED !== "false",
      timeoutMs: Math.max(1000, Math.min(Number(env.DAISU_AI_TIMEOUT_MS) || 10000, 30000)),
    },
  };
};
