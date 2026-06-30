import { createDomainEvent } from "../../../domain/shared/domainEvent.js";
import { normalizeDaiSuAssistantSettings } from "../../../domain/council/state.js";

export const createUpdateDaiSuSettings = ({ clock, stateStore }) => async (payload = {}) => {
  const outcome = await stateStore.transact(async (state) => {
    const assistant = normalizeDaiSuAssistantSettings(
      {
        ...payload,
        updatedAt: clock.now(),
      },
      state.daisuAssistant,
    );

    return {
      events: [
        createDomainEvent({
          type: "daisu.settingsUpdated",
          payload: { assistant },
        }),
      ],
    };
  });

  return {
    assistant: outcome.state.daisuAssistant,
    domainEvents: outcome.events,
  };
};
