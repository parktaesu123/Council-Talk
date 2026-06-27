import { readJsonFile, writeJsonFileAtomic } from "../persistence/atomicFile.js";

export const createDurableEventDispatcher = ({
  cursorFilePath,
  eventStore,
  handlers,
  logger,
}) => {
  let queue = Promise.resolve();

  const readCursor = async () => {
    const value = await readJsonFile(cursorFilePath, { lastSequence: 0 });
    return Number(value.lastSequence || 0);
  };

  const writeCursor = async (lastSequence) => {
    await writeJsonFileAtomic(cursorFilePath, {
      lastSequence,
      updatedAt: new Date().toISOString(),
    });
  };

  const dispatchSequentially = async (events) => {
    let lastHandledSequence = await readCursor();

    for (const event of events) {
      if (event.sequence <= lastHandledSequence) {
        continue;
      }

      const listeners = handlers[event.type] || [];

      for (const listener of listeners) {
        await listener(event);
      }

      lastHandledSequence = event.sequence;
      await writeCursor(lastHandledSequence);
    }
  };

  const enqueue = (events) => {
    queue = queue
      .then(() => dispatchSequentially(events))
      .catch((error) => {
        logger.error("[event-dispatch failed]", error);
      });

    return queue;
  };

  return {
    enqueue,

    async replayPending() {
      const allEvents = await eventStore.readAll();
      await enqueue(allEvents);
    },
  };
};
