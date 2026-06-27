import { readFile } from "node:fs/promises";

import { appendLinesWithFsync } from "./atomicFile.js";

const normalizePersistedEvent = (event, sequence) => ({
  sequence,
  type: event.type,
  payload: event.payload,
  occurredAt: event.occurredAt || new Date().toISOString(),
  recordedAt: new Date().toISOString(),
});

export const createAppendOnlyEventStore = ({ filePath }) => ({
  async readAll() {
    try {
      const raw = await readFile(filePath, "utf8");
      return raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .sort((a, b) => a.sequence - b.sequence);
    } catch {
      return [];
    }
  },

  async append(events, lastSequence = 0) {
    const persistedEvents = events.map((event, index) =>
      normalizePersistedEvent(event, lastSequence + index + 1),
    );

    if (persistedEvents.length === 0) {
      return [];
    }

    await appendLinesWithFsync(
      filePath,
      persistedEvents.map((event) => `${JSON.stringify(event)}\n`),
    );

    return persistedEvents;
  },
});
