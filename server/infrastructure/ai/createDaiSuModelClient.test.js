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
