import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

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
      apiKey: env.DAISU_AI_API_KEY || "",
      apiUrl: env.DAISU_AI_API_URL || "https://api.openai.com/v1/chat/completions",
      model: env.DAISU_AI_MODEL || "gpt-4.1-mini",
      enabled: env.DAISU_AI_ENABLED !== "false",
    },
  };
};
