import test from "node:test";
import assert from "node:assert/strict";

import { createDaiSuModelClient } from "./createDaiSuModelClient.js";

test("daisu model client normalizes generated replies", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        choices: [
          {
            message: {
              content: "## 안내\n\n**첫 줄**\n\n```txt\n숨김\n```\n둘째 줄\n셋째 줄",
            },
          },
        ],
      };
    },
  });

  const client = createDaiSuModelClient({
    config: {
      daisuAi: {
        apiKey: "test-key",
        apiUrl: "https://example.com",
        enabled: true,
        model: "test-model",
        timeoutMs: 1000,
      },
    },
    logger: { error() {} },
  });

  const result = await client.generateReply({
    assistant: { name: "따이수", tone: "친절" },
    contextText: "학생회 참고 내용",
    conversation: [{ role: "user", content: "안내해줘" }],
  });

  global.fetch = originalFetch;

  assert.equal(result.skipped, "");
  assert.equal(result.text.includes("##"), false);
  assert.equal(result.text.includes("```"), false);
  assert.match(result.text, /첫 줄/);
});

test("daisu model client supports anthropic messages api", async () => {
  const originalFetch = global.fetch;
  let capturedRequest = null;

  global.fetch = async (url, options) => {
    capturedRequest = {
      body: JSON.parse(options.body),
      headers: options.headers,
      url,
    };

    return {
      ok: true,
      async json() {
        return {
          content: [
            {
              type: "text",
              text: "클로드 응답입니다.",
            },
          ],
        };
      },
    };
  };

  const client = createDaiSuModelClient({
    config: {
      daisuAi: {
        apiKey: "test-key",
        apiUrl: "https://api.anthropic.com/v1/messages",
        enabled: true,
        model: "claude-sonnet-4-20250514",
        provider: "anthropic",
        timeoutMs: 1000,
      },
    },
    logger: { error() {} },
  });

  const result = await client.generateReply({
    assistant: { name: "따이수", tone: "친절" },
    contextText: "학생회 참고 내용",
    conversation: [{ role: "user", content: "안내해줘" }],
  });

  global.fetch = originalFetch;

  assert.equal(result.skipped, "");
  assert.equal(result.text, "클로드 응답입니다.");
  assert.equal(capturedRequest.url, "https://api.anthropic.com/v1/messages");
  assert.equal(capturedRequest.headers["x-api-key"], "test-key");
  assert.equal(capturedRequest.headers["anthropic-version"], "2023-06-01");
  assert.equal(capturedRequest.body.model, "claude-sonnet-4-20250514");
  assert.equal(Array.isArray(capturedRequest.body.messages), true);
});

test("daisu model client skips when provider is disabled", async () => {
  const client = createDaiSuModelClient({
    config: {
      daisuAi: {
        apiKey: "test-key",
        apiUrl: "https://example.com",
        enabled: false,
        model: "test-model",
        timeoutMs: 1000,
      },
    },
    logger: { error() {} },
  });

  const result = await client.generateReply({
    assistant: { name: "따이수" },
    contextText: "학생회 참고 내용",
    conversation: [{ role: "user", content: "안내해줘" }],
  });

  assert.equal(result.text, "");
  assert.equal(result.skipped, "provider-disabled");
});

test("daisu model client reports empty provider responses", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        choices: [
          {
            message: {
              content: "   ",
            },
          },
        ],
      };
    },
  });

  const client = createDaiSuModelClient({
    config: {
      daisuAi: {
        apiKey: "test-key",
        apiUrl: "https://example.com",
        enabled: true,
        model: "test-model",
        timeoutMs: 1000,
      },
    },
    logger: { error() {} },
  });

  const result = await client.generateReply({
    assistant: { name: "따이수" },
    contextText: "학생회 참고 내용",
    conversation: [{ role: "user", content: "안내해줘" }],
  });

  global.fetch = originalFetch;

  assert.equal(result.text, "");
  assert.equal(result.skipped, "empty-provider-response");
});
