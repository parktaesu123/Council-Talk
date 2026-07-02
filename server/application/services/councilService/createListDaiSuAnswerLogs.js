export const createListDaiSuAnswerLogs = ({ stateStore }) => async ({ limit, mode, threadId } = {}) => {
  const state = await stateStore.read();
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const normalizedMode = String(mode || "").trim();
  const normalizedThreadId = String(threadId || "").trim();
  const logs = (state.daisuAnswerLogs || []).filter((entry) => {
    if (normalizedMode && entry.mode !== normalizedMode) {
      return false;
    }

    if (normalizedThreadId && entry.threadId !== normalizedThreadId) {
      return false;
    }

    return true;
  });

  return {
    answerLogs: logs.slice(0, normalizedLimit),
  };
};
