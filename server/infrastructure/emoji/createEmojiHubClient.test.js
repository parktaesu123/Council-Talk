import test from "node:test";
import assert from "node:assert/strict";

import { createEmojiHubClient } from "./createEmojiHubClient.js";

const samplePayload = [
  {
    category: "smileys and people",
    group: "face-smiling",
    name: "grinning face",
    unicode: ["U+1F600"],
  },
  {
    category: "animals and nature",
    group: "animal-mammal",
    name: "dog face",
    unicode: ["U+1F436"],
  },
];

test("emoji hub client caches results and defaults to smileys", async () => {
  let fetchCalls = 0;
  const client = createEmojiHubClient({
    async fetchImpl() {
      fetchCalls += 1;
      return {
        ok: true,
        async json() {
          return samplePayload;
        },
      };
    },
  });

  const first = await client.search();
  const second = await client.search({ query: "dog" });

  assert.equal(fetchCalls, 1);
  assert.equal(first.length, 1);
  assert.equal(first[0].emoji, "😀");
  assert.equal(second.length, 1);
  assert.equal(second[0].emoji, "🐶");
});

test("emoji hub client respects the requested limit", async () => {
  const client = createEmojiHubClient({
    async fetchImpl() {
      return {
        ok: true,
        async json() {
          return samplePayload;
        },
      };
    },
  });

  const results = await client.search({ limit: 1, query: "face" });
  assert.equal(results.length, 1);
});
