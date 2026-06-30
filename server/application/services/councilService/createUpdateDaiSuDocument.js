import { badRequest, notFound } from "../../errors.js";
import { createDomainEvent } from "../../../domain/shared/domainEvent.js";
import { normalizeDaiSuKnowledgeDocument } from "../../../domain/council/state.js";

export const createUpdateDaiSuDocument = ({ clock, stateStore }) => async (documentId, payload = {}) => {
  const outcome = await stateStore.transact(async (state) => {
    const current = (state.daisuKnowledgeDocuments || []).find((document) => document.id === documentId);

    if (!current) {
      throw notFound("DaiSu document not found");
    }

    const document = normalizeDaiSuKnowledgeDocument(
      {
        ...payload,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: clock.now(),
      },
      current,
    );

    if (!document.title || !document.content) {
      throw badRequest("Missing daisu document fields");
    }

    return {
      events: [
        createDomainEvent({
          type: "daisu.documentUpdated",
          payload: { document },
        }),
      ],
    };
  });

  return {
    document: outcome.state.daisuKnowledgeDocuments.find((item) => item.id === documentId) || null,
    documents: outcome.state.daisuKnowledgeDocuments,
    domainEvents: outcome.events,
  };
};
