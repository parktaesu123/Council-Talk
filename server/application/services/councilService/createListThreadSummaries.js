import {
  createThreadSummaries,
  sortThreadsByActivity,
} from "../../../domain/council/state.js";

export const createListThreadSummaries = ({ stateStore }) => async () => {
  const state = await stateStore.read();
  return {
    threads: createThreadSummaries(sortThreadsByActivity(state.threads)),
  };
};
