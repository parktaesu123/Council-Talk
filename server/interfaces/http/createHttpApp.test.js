import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";

import { createHttpApp } from "./createHttpApp.js";

const createTestRuntime = (overrides = {}) => ({
  adminToken: "test-admin-token",
  config: {
    adminPassword: "test-password",
    staticDir: path.resolve(process.cwd(), "dist"),
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
  ...overrides,
});

const withTestServer = async (runtime, callback) => {
  const app = createHttpApp({
    runtime,
  });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

test("http app serves healthz", async () => {
  await withTestServer(createTestRuntime(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(body, "ok\n");
  });
});
