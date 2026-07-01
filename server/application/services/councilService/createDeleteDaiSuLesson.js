import { createDomainEvent } from "../../../domain/shared/domainEvent.js";

export const createDeleteDaiSuLesson = ({ stateStore }) => async (lessonId) => {
  const outcome = await stateStore.transact(async (state) => {
    if (!(state.daisuLessons || []).some((lesson) => lesson.id === lessonId)) {
      return {};
    }

    return {
      events: [
        createDomainEvent({
          type: "daisu.lessonDeleted",
          payload: { lessonId },
        }),
      ],
    };
  });

  return {
    domainEvents: outcome.events,
    lessons: outcome.state.daisuLessons || [],
  };
};
