import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";

import { createAppendOnlyEventStore } from "./appendOnlyEventStore.js";

test("append only event store appends sequence numbers and reads sorted events", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "council-talk-event-store-"));
  const store = createAppendOnlyEventStore({
    filePath: path.join(tempDir, "events.jsonl"),
  });

  const first = await store.append([{ type: "first", payload: { ok: true } }], 0);
  const second = await store.append([{ type: "second", payload: { ok: true } }], first.at(-1).sequence);
  const events = await store.readAll();

  assert.equal(first[0].sequence, 1);
  assert.equal(second[0].sequence, 2);
  assert.deepEqual(events.map((event) => event.type), ["first", "second"]);
});
