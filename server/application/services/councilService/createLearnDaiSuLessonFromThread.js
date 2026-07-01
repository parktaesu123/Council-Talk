import { notFound } from "../../errors.js";
import { createDomainEvent } from "../../../domain/shared/domainEvent.js";
import { normalizeDaiSuLesson } from "../../../domain/council/state.js";

export const createLearnDaiSuLessonFromThread = ({
  clock,
  idGenerator,
  stateStore,
}) => async (threadId, adminMessageId) => {
  const outcome = await stateStore.transact(async (state) => {
    const thread = state.threads.find((item) => item.id === threadId);

    if (!thread) {
      throw notFound("Thread not found");
    }

    if (String(thread.title || "").trim() !== "따이수와 대화") {
      return { result: { skipped: "not-daisu-thread" } };
    }

    const adminMessageIndex = thread.messages.findIndex((message) => message.id === adminMessageId);
    const adminMessage = adminMessageIndex >= 0 ? thread.messages[adminMessageIndex] : null;

    if (!adminMessage || adminMessage.author !== "admin" || adminMessage.assistant) {
      return { result: { skipped: "message-not-eligible" } };
    }

    const question = [...thread.messages.slice(0, adminMessageIndex)]
      .reverse()
      .find((message) => message.author === "student");

    if (!question) {
      return { result: { skipped: "question-not-found" } };
    }

    if (
      (state.daisuLessons || []).some(
        (lesson) => lesson.threadId === threadId && lesson.question === question.text && lesson.answer === adminMessage.text,
      )
    ) {
      return { result: { skipped: "already-learned" } };
    }

    const lesson = normalizeDaiSuLesson({
      id: idGenerator(),
      question: question.text,
      answer: adminMessage.text,
      threadId,
      source: "human-admin",
      createdAt: clock.now(),
    });

    return {
      events: [
        createDomainEvent({
          type: "daisu.lessonLearned",
          payload: { lesson },
        }),
      ],
      result: { lesson },
    };
  });

  return {
    lesson: outcome.result?.lesson || null,
    skipped: outcome.result?.skipped || "",
    domainEvents: outcome.events,
  };
};
