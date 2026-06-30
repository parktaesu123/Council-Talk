export const createListDaiSuAnswerLogs = ({ stateStore }) => async () => {
  const state = await stateStore.read();
  return {
    answerLogs: state.daisuAnswerLogs || [],
  };
};
