import { createDomainEvent } from "../../../domain/shared/domainEvent.js";

export const createDeleteDaiSuDocument = ({ stateStore }) => async (documentId) => {
  const outcome = await stateStore.transact(async (state) => {
    if (!(state.daisuKnowledgeDocuments || []).some((document) => document.id === documentId)) {
      return {};
    }

    return {
      events: [
        createDomainEvent({
          type: "daisu.documentDeleted",
          payload: { documentId },
        }),
      ],
    };
  });

  return {
    documents: outcome.state.daisuKnowledgeDocuments,
    domainEvents: outcome.events,
  };
};
