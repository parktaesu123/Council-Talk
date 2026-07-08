import test from "node:test";
import assert from "node:assert/strict";

import { createEventBus } from "./createEventBus.js";

test("event bus publishes events to subscribed listeners", async () => {
  const bus = createEventBus();
  const handled = [];

  bus.subscribe(async (events) => {
    handled.push(...events.map((event) => event.type));
  });

  await bus.publish([{ type: "thread.created" }, { type: "thread.messageAdded" }]);

  assert.deepEqual(handled, ["thread.created", "thread.messageAdded"]);
});

test("event bus unsubscribe removes the listener", async () => {
  const bus = createEventBus();
  let count = 0;
  const unsubscribe = bus.subscribe(async () => {
    count += 1;
  });

  unsubscribe();
  await bus.publish([{ type: "thread.created" }]);

  assert.equal(count, 0);
});
