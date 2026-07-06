import test from "node:test";
import assert from "node:assert/strict";

import { createTypingPresenceService } from "./createTypingPresenceService.js";

test("typing presence tracks updates and clears a thread", async () => {
  const broadcasts = [];
  const service = createTypingPresenceService({
    heartbeatTtlMs: 50,
    sseHub: {
      broadcast(event, payload) {
        broadcasts.push({ event, payload });
      },
    },
  });

  assert.equal(
    service.update("thread-1", {
      active: true,
      authorLabel: "학생회",
      clientId: "admin-client",
    }),
    true,
  );
  assert.equal(service.snapshot().typing.length, 1);

  service.clearThread("thread-1");
  assert.equal(service.snapshot().typing.length, 0);
  assert.equal(broadcasts.some((entry) => entry.event === "typing"), true);
});

test("typing presence ignores updates without client id", () => {
  const service = createTypingPresenceService({
    sseHub: {
      broadcast() {},
    },
  });

  assert.equal(service.update("thread-1", { active: true, authorLabel: "학생회", clientId: "" }), false);
});
