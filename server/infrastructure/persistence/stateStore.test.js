import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";

import { createAppendOnlyEventStore } from "./appendOnlyEventStore.js";
import { createStateStore } from "./stateStore.js";

const evolve = (state, event) => {
  if (event.type === "counter.incremented") {
    return {
      ...state,
      count: state.count + event.payload.amount,
    };
  }

  return state;
};

test("state store rebuilds state from append-only events", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "council-talk-store-"));
  const eventStore = createAppendOnlyEventStore({
    filePath: path.join(tempDir, "events.jsonl"),
  });

  const stateStore = createStateStore({
    eventStore,
    evolve,
    initialState: { count: 0 },
    snapshotFilePath: path.join(tempDir, "snapshot.json"),
  });

  const first = await stateStore.transact(async () => ({
    events: [{ type: "counter.incremented", payload: { amount: 2 } }],
    result: "ok",
  }));

  assert.equal(first.result, "ok");
  assert.equal(first.state.count, 2);

  const reloadedStore = createStateStore({
    eventStore,
    evolve,
    initialState: { count: 0 },
    snapshotFilePath: path.join(tempDir, "snapshot.json"),
  });

  assert.deepEqual(await reloadedStore.read(), { count: 2 });
});

test("state store serializes concurrent transactions", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "council-talk-store-"));
  const eventStore = createAppendOnlyEventStore({
    filePath: path.join(tempDir, "events.jsonl"),
  });

  const stateStore = createStateStore({
    eventStore,
    evolve,
    initialState: { count: 0 },
    snapshotFilePath: path.join(tempDir, "snapshot.json"),
  });

  await Promise.all([
    stateStore.transact(async () => ({
      events: [{ type: "counter.incremented", payload: { amount: 1 } }],
    })),
    stateStore.transact(async () => ({
      events: [{ type: "counter.incremented", payload: { amount: 3 } }],
    })),
  ]);

  assert.deepEqual(await stateStore.read(), { count: 4 });
});
