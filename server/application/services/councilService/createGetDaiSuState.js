export const createGetDaiSuState = ({ daiSuModelClient, stateStore }) => async () => {
  const state = await stateStore.read();
  return {
    answerLogs: state.daisuAnswerLogs || [],
    documents: state.daisuKnowledgeDocuments || [],
    assistant: state.daisuAssistant,
    lessons: state.daisuLessons || [],
    provider: daiSuModelClient.getStatus(),
  };
};
