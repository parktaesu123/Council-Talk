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
import { createDaiSuModelClient } from "../infrastructure/ai/createDaiSuModelClient.js";
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
  const daiSuModelClient = createDaiSuModelClient({
    config,
    logger,
  });
  const service = createCouncilService({
    clock,
    daiSuModelClient,
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
  const isDaiSuThread = (thread) => String(thread?.title || "").trim() === "따이수와 대화";

  eventBus.subscribe(async (events) => {
    for (const event of events) {
      if (event.payload?.thread) {
        sseHub.broadcast("thread", {
          thread: createThreadSummary(event.payload.thread),
        });
      }

      if (event.type === "thread.messageAdded" && event.payload?.thread) {
        sseHub.broadcast("thread-message", {
          message: event.payload.thread.messages.at(-1) || null,
          thread: createThreadSummary(event.payload.thread),
          threadId: event.payload.thread.id,
        });
        typingPresence.clearThread(event.payload.thread.id);

        const latestMessage = event.payload.thread.messages.at(-1) || null;
        if (latestMessage?.author === "student" && isDaiSuThread(event.payload.thread)) {
          const result = await service.generateDaiSuReplyForThread(
            event.payload.thread.id,
            latestMessage.id,
          );
          await eventBus.publish(result.domainEvents || []);
          void durableDispatcher.enqueue(result.domainEvents || []);
        }

        if (latestMessage?.author === "admin" && !latestMessage?.assistant && isDaiSuThread(event.payload.thread)) {
          const learningResult = await service.learnDaiSuLessonFromThread(
            event.payload.thread.id,
            latestMessage.id,
          );
          await eventBus.publish(learningResult.domainEvents || []);
          void durableDispatcher.enqueue(learningResult.domainEvents || []);
        }
      }

      if (event.type === "thread.created" && event.payload?.thread) {
        const initialMessage = event.payload.thread.messages.at(-1) || null;
        if (initialMessage?.author === "student" && isDaiSuThread(event.payload.thread)) {
          const result = await service.generateDaiSuReplyForThread(
            event.payload.thread.id,
            initialMessage.id,
          );
          await eventBus.publish(result.domainEvents || []);
          void durableDispatcher.enqueue(result.domainEvents || []);
        }
      }

      if (event.type === "thread.messageUpdated" && event.payload?.thread && event.payload?.messageId) {
        sseHub.broadcast("thread-message-updated", {
          message:
            event.payload.thread.messages.find((message) => message.id === event.payload.messageId) || null,
          thread: createThreadSummary(event.payload.thread),
          threadId: event.payload.thread.id,
        });
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
