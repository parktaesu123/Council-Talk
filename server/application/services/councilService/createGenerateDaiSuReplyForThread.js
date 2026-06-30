import { createDomainEvent } from "../../../domain/shared/domainEvent.js";
import { createThreadSummaries } from "../../../domain/council/state.js";

export const createGenerateDaiSuReplyForThread = ({
  clock,
  idGenerator,
  responder,
  stateStore,
}) => async (threadId, studentMessageId) => {
  const outcome = await stateStore.transact(async (state) => {
    const assistant = state.daisuAssistant;

    if (!assistant?.autoReplyEnabled) {
      return { result: { skipped: "disabled" } };
    }

    const thread = state.threads.find((item) => item.id === threadId);

    if (!thread) {
      return { result: { skipped: "thread-not-found" } };
    }

    if (
      Array.isArray(assistant.autoReplyTags) &&
      assistant.autoReplyTags.length > 0 &&
      !assistant.autoReplyTags.includes(thread.tagId) &&
      !assistant.autoReplyTags.includes(thread.tagName)
    ) {
      return { result: { skipped: "tag-filtered" } };
    }

    const studentMessage = thread.messages.find((message) => message.id === studentMessageId);

    if (!studentMessage || studentMessage.author !== "student") {
      return { result: { skipped: "message-not-eligible" } };
    }

    if ((state.daisuAnswerLogs || []).some((log) => log.studentMessageId === studentMessageId)) {
      return { result: { skipped: "already-answered" } };
    }

    const { matchedDocuments, replyText, score, usedFallback } = responder.buildReply({
      assistant,
      state,
      studentMessage,
      thread,
    });

    const now = clock.now();
    const assistantMessage = {
      id: idGenerator(),
      author: "admin",
      authorLabel: assistant.name || "따이수",
      createdAt: now,
      time: clock.timeLabel(),
      text: replyText,
      replyTo: {
        id: studentMessage.id,
        authorLabel: studentMessage.authorLabel,
        text: studentMessage.text,
      },
      assistant: {
        confidence: score,
        matchedDocumentIds: matchedDocuments.map((document) => document.id),
        mode: usedFallback ? "fallback" : "retrieval-template",
      },
    };

    const nextThread = {
      ...thread,
      status: "진행중",
      updatedAt: now,
      messages: [...thread.messages, assistantMessage],
    };

    const log = {
      id: idGenerator(),
      threadId: thread.id,
      studentMessageId: studentMessage.id,
      assistantMessageId: assistantMessage.id,
      matchedDocumentIds: matchedDocuments.map((document) => document.id),
      score,
      mode: usedFallback ? "auto-fallback" : "auto",
      createdAt: now,
    };

    return {
      events: [
        createDomainEvent({
          type: "thread.messageAdded",
          payload: { thread: nextThread },
        }),
        createDomainEvent({
          type: "daisu.answerLogged",
          payload: { log },
        }),
      ],
      result: {
        assistantMessage,
        log,
        thread: nextThread,
      },
    };
  });

  return {
    assistantMessage: outcome.result?.assistantMessage || null,
    log: outcome.result?.log || null,
    skipped: outcome.result?.skipped || "",
    thread: outcome.result?.thread || null,
    threads: createThreadSummaries(outcome.state?.threads || []),
    domainEvents: outcome.events,
  };
};
