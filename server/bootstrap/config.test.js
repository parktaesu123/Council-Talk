import test from "node:test";
import assert from "node:assert/strict";

import { createConfig } from "./config.js";

test("createConfig uses sane defaults", () => {
  const config = createConfig({});

  assert.equal(config.port, 3000);
  assert.equal(config.smtp.port, 587);
  assert.equal(config.daisuAi.provider, "openai");
  assert.equal(config.daisuAi.model, "gpt-4.1-mini");
  assert.equal(config.daisuAi.timeoutMs, 10000);
  assert.equal(config.daisuAi.enabled, true);
});

test("createConfig normalizes anthropic provider and timeout bounds", () => {
  const config = createConfig({
    DAISU_AI_PROVIDER: "anthropic",
    DAISU_AI_TIMEOUT_MS: "999999",
    SMTP_SECURE: "true",
    SMTP_PORT: "465",
  });

  assert.equal(config.daisuAi.provider, "anthropic");
  assert.equal(config.daisuAi.timeoutMs, 30000);
  assert.equal(config.smtp.secure, true);
  assert.equal(config.smtp.port, 465);
});
