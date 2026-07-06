import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createHttpApp } from "./createHttpApp.js";

test("http app serves healthz", async () => {
  const app = createHttpApp({
    runtime: {
      config: {
        smtp: { from: "", host: "", pass: "", user: "" },
      },
      emojiHubClient: { search: async () => [] },
      handleCommittedEvents: async () => {},
      service: {
        listNotificationEmails: async () => ({ emails: [] }),
        listTags: async () => ({ tags: [] }),
      },
      sseHub: { handleConnection: async () => {} },
      typingPresence: { update: () => true },
    },
  });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(body, "ok\n");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
