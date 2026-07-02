export const createGetDaiSuState = ({ daiSuModelClient, stateStore }) => async ({ lessonLimit } = {}) => {
  const state = await stateStore.read();
  const normalizedLessonLimit = Math.max(1, Math.min(Number(lessonLimit) || 100, 300));
  return {
    answerLogs: state.daisuAnswerLogs || [],
    documents: state.daisuKnowledgeDocuments || [],
    assistant: state.daisuAssistant,
    lessons: (state.daisuLessons || []).slice(0, normalizedLessonLimit),
    provider: daiSuModelClient.getStatus(),
  };
};
