import { notFound } from "../../errors.js";
import { normalizeThreadForClient } from "../../../domain/council/state.js";

export const createGetThread = ({ stateStore }) => async (threadId) => {
  const state = await stateStore.read();
  const thread = state.threads.find((item) => item.id === threadId);

  if (!thread) {
    throw notFound("Thread not found");
  }

  return { thread: normalizeThreadForClient(thread) };
};
