import { createDomainEvent } from "../../../domain/shared/domainEvent.js";
import { normalizeEmail } from "../../../domain/council/state.js";

export const createStudentRegisteredEventBuilder = ({ hashPin }) => ({
  buildStudentRegisteredEvent(payload) {
    return createDomainEvent({
      type: "student.registered",
      payload: {
        student: {
          ...payload.profile,
          email: normalizeEmail(payload.email),
          pinHash: hashPin(payload.pin),
          createdAt: payload.now,
          updatedAt: payload.now,
        },
      },
    });
  },
});
