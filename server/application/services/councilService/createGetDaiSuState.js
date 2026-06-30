export const createGetDaiSuState = ({ stateStore }) => async () => {
  const state = await stateStore.read();
  return {
    answerLogs: state.daisuAnswerLogs || [],
    documents: state.daisuKnowledgeDocuments || [],
    assistant: state.daisuAssistant,
  };
};
