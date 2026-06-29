import { notFound } from "../../errors.js";
import { paginateThreadMessages } from "../../../domain/council/state.js";

export const createGetThreadMessages = ({ stateStore }) => async (threadId, options = {}) => {
  const state = await stateStore.read();
  const thread = state.threads.find((item) => item.id === threadId);

  if (!thread) {
    throw notFound("Thread not found");
  }

  const page = paginateThreadMessages(thread, options);

  return {
    hasMore: page.hasMore,
    limit: page.limit,
    messages: page.messages,
    nextCursor: page.nextCursor,
    thread: {
      id: thread.id,
      messageCount: page.totalCount,
      updatedAt: thread.updatedAt,
    },
  };
};
