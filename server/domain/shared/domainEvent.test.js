import test from "node:test";
import assert from "node:assert/strict";

import { createDomainEvent } from "./domainEvent.js";

test("createDomainEvent preserves type, payload, and explicit timestamp", () => {
  const event = createDomainEvent({
    type: "thread.created",
    payload: { threadId: "thread-1" },
    occurredAt: "2026-07-09T00:00:00.000Z",
  });

  assert.deepEqual(event, {
    type: "thread.created",
    payload: { threadId: "thread-1" },
    occurredAt: "2026-07-09T00:00:00.000Z",
  });
});
