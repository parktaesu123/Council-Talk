export const createListDaiSuAnswerLogs = ({ stateStore }) => async ({ limit, mode } = {}) => {
  const state = await stateStore.read();
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const normalizedMode = String(mode || "").trim();
  const logs = normalizedMode
    ? (state.daisuAnswerLogs || []).filter((entry) => entry.mode === normalizedMode)
    : state.daisuAnswerLogs || [];

  return {
    answerLogs: logs.slice(0, normalizedLimit),
  };
};
