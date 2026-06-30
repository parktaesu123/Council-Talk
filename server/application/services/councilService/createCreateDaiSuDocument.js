import { badRequest } from "../../errors.js";
import { createDomainEvent } from "../../../domain/shared/domainEvent.js";
import { normalizeDaiSuKnowledgeDocument } from "../../../domain/council/state.js";

export const createCreateDaiSuDocument = ({ clock, idGenerator, stateStore }) => async (payload = {}) => {
  const now = clock.now();
  const document = normalizeDaiSuKnowledgeDocument({
    ...payload,
    id: idGenerator(),
    createdAt: now,
    updatedAt: now,
  });

  if (!document.title || !document.content) {
    throw badRequest("Missing daisu document fields");
  }

  const outcome = await stateStore.transact(async () => ({
    events: [
      createDomainEvent({
        type: "daisu.documentCreated",
        payload: { document },
      }),
    ],
  }));

  return {
    document,
    documents: outcome.state.daisuKnowledgeDocuments,
    domainEvents: outcome.events,
  };
};
