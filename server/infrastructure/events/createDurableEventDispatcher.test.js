import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";

import { createAppendOnlyEventStore } from "../persistence/appendOnlyEventStore.js";
import { createDurableEventDispatcher } from "./createDurableEventDispatcher.js";

test("durable dispatcher resumes from stored cursor", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "council-talk-dispatcher-"));
  const eventStore = createAppendOnlyEventStore({
    filePath: path.join(tempDir, "events.jsonl"),
  });
  const handled = [];

  await eventStore.append([
    { type: "test.one", payload: { value: 1 } },
    { type: "test.one", payload: { value: 2 } },
  ]);

  const dispatcher = createDurableEventDispatcher({
    cursorFilePath: path.join(tempDir, "cursor.json"),
    eventStore,
    handlers: {
      "test.one": [
        async (event) => {
          handled.push(event.payload.value);
        },
      ],
    },
    logger: {
      error: () => {},
    },
  });

  await dispatcher.replayPending();
  await dispatcher.replayPending();

  assert.deepEqual(handled, [1, 2]);
});
