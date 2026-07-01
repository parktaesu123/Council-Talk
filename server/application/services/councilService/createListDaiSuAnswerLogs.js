export const createListDaiSuAnswerLogs = ({ stateStore }) => async ({ limit } = {}) => {
  const state = await stateStore.read();
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  return {
    answerLogs: (state.daisuAnswerLogs || []).slice(0, normalizedLimit),
  };
};
