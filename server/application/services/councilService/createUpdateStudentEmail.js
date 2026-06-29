import { createDomainEvent } from "../../../domain/shared/domainEvent.js";
import { isValidEmail, normalizeEmail, publicStudent, studentKey } from "../../../domain/council/state.js";
import { badRequest, notFound } from "../../errors.js";

export const createUpdateStudentEmail = ({
  clock,
  ensureStudentProfile,
  stateStore,
}) => async (payload) => {
  const state = await stateStore.read();
  const profile = ensureStudentProfile(state, payload || {});
  const email = normalizeEmail(payload?.email);

  if (!profile || !isValidEmail(email)) {
    throw badRequest("Invalid student email");
  }

  const outcome = await stateStore.transact(async (currentState) => {
    const saved = currentState.students[studentKey(profile)];

    if (!saved) {
      throw notFound("Student not found");
    }

    return {
      events: [
        createDomainEvent({
          type: "student.emailUpdated",
          payload: {
            student: {
              ...saved,
              email,
              updatedAt: clock.now(),
            },
          },
        }),
      ],
    };
  });

  return {
    profile: publicStudent(outcome.state.students[studentKey(profile)]),
  };
};
