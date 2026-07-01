import { createDomainEvent } from "../../../domain/shared/domainEvent.js";

export const createClearDaiSuAnswerLogs = ({ stateStore }) => async () => {
  const outcome = await stateStore.transact(async (state) => {
    if ((state.daisuAnswerLogs || []).length === 0) {
      return {};
    }

    return {
      events: [
        createDomainEvent({
          type: "daisu.answerLogsCleared",
          payload: {},
        }),
      ],
    };
  });

  return {
    answerLogs: outcome.state.daisuAnswerLogs || [],
    domainEvents: outcome.events,
  };
};
