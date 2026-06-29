import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import { createCouncilService } from "../application/services/createCouncilService.js";
import {
  createThreadSummary,
  createThreadSummaries,
  initialCouncilState,
  sortThreadsByActivity,
} from "../domain/council/state.js";
import { applyCouncilEvent } from "../domain/council/reducer.js";
import { createDurableEventDispatcher } from "../infrastructure/events/createDurableEventDispatcher.js";
import { createEmojiHubClient } from "../infrastructure/emoji/createEmojiHubClient.js";
import { createEventBus } from "../infrastructure/events/createEventBus.js";
import { consoleLogger } from "../infrastructure/logging/consoleLogger.js";
import { createNotificationHandlers } from "../infrastructure/notifications/createNotificationHandlers.js";
import { createAppendOnlyEventStore } from "../infrastructure/persistence/appendOnlyEventStore.js";
import { loadLegacyCouncilState } from "../infrastructure/persistence/loadLegacyCouncilState.js";
import { createStateStore } from "../infrastructure/persistence/stateStore.js";
import { createSseHub } from "../infrastructure/sse/createSseHub.js";
import { createTypingPresenceService } from "../infrastructure/typing/createTypingPresenceService.js";
import { createClock } from "../shared/clock.js";
import { hashPin } from "../shared/crypto.js";

export const createServerRuntime = async ({ config }) => {
  const logger = consoleLogger;
  const initialState = await loadLegacyCouncilState(config.dataDir);
  const eventStore = createAppendOnlyEventStore({
    filePath: path.join(config.dataDir, "events", "council-events.jsonl"),
  });
  const stateStore = createStateStore({
    eventStore,
    evolve: applyCouncilEvent,
    initialState: initialState || initialCouncilState,
    snapshotFilePath: path.join(config.dataDir, "snapshots", "council-state.json"),
  });

  const eventBus = createEventBus();
  const clock = createClock();
  const service = createCouncilService({
    clock,
    hashPin,
    idGenerator: randomUUID,
    stateStore,
  });
  let typingPresence;
  const sseHub = createSseHub({
    snapshotProvider: async () => {
      const state = await service.getState();
      return [
        {
          event: "sync",
          payload: {
            threads: createThreadSummaries(sortThreadsByActivity(state.threads)),
          },
        },
        {
          event: "typing",
          payload: typingPresence?.snapshot() || { typing: [] },
        },
      ];
    },
  });
  typingPresence = createTypingPresenceService({
    sseHub,
  });
  const notificationHandlers = createNotificationHandlers({
    config,
    logger,
    queryState: () => service.getState(),
  });
  const emojiHubClient = createEmojiHubClient();
  const durableDispatcher = createDurableEventDispatcher({
    cursorFilePath: path.join(config.dataDir, "events", "notification-cursor.json"),
    eventStore,
    handlers: notificationHandlers,
    logger,
  });

  eventBus.subscribe(async (events) => {
    for (const event of events) {
      if (event.payload?.thread) {
        sseHub.broadcast("thread", {
          thread: createThreadSummary(event.payload.thread),
        });
      }

      if (event.type === "thread.messageAdded" && event.payload?.thread) {
        typingPresence.clearThread(event.payload.thread.id);
      }
    }
  });

  await durableDispatcher.replayPending();

  return {
    adminToken:
      config.adminToken ||
      createHash("sha256")
        .update(`council-talk:${config.adminPassword}`)
        .digest("hex")
        .slice(0, 32),
    config,
    durableDispatcher,
    emojiHubClient,
    eventBus,
    logger,
    service,
    sseHub,
    typingPresence,
    async handleCommittedEvents(events) {
      if (!Array.isArray(events) || events.length === 0) {
        return;
      }

      await eventBus.publish(events);
      void durableDispatcher.enqueue(events);
    },
  };
};
