import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { createSseHub } from "./createSseHub.js";

const createMockResponse = () => {
  const chunks = [];

  return {
    chunks,
    flushHeaders() {},
    setHeader() {},
    write(chunk) {
      chunks.push(String(chunk));
    },
  };
};

test("sse hub writes connected and snapshot events on new connection", async () => {
  const hub = createSseHub({
    heartbeatMs: 1000,
    snapshotProvider: async () => [
      { event: "sync", payload: { ok: true } },
      { event: "typing", payload: { typing: [] } },
    ],
  });
  const request = new EventEmitter();
  const response = createMockResponse();

  await hub.handleConnection(request, response);

  const body = response.chunks.join("");
  assert.match(body, /retry: 2000/);
  assert.match(body, /event: connected/);
  assert.match(body, /event: sync/);
  assert.match(body, /event: typing/);

  request.emit("close");
});
