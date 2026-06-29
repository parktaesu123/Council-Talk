import { badRequest, conflict } from "../../errors.js";
import { normalizeStudentIdentity } from "../../../domain/council/state.js";

export const createSignupStudent = ({
  buildStudentRegisteredEvent,
  clock,
  ensureStudentProfile,
  getStudentRecord,
  stateStore,
}) => async (payload) => {
  const profile = normalizeStudentIdentity(payload || {});
  const state = await stateStore.read();

  if (getStudentRecord(state, profile)) {
    throw conflict("Student already exists");
  }

  const ensured = ensureStudentProfile(state, payload || {}, {
    createIfMissing: true,
    email: payload?.email,
  });

  if (!ensured) {
    throw badRequest("Invalid student credentials");
  }

  await stateStore.transact(async () => ({
    events: [
      buildStudentRegisteredEvent({
        email: payload.email,
        now: clock.now(),
        pin: payload.pin,
        profile,
      }),
    ],
  }));

  return { profile: ensured, threads: [] };
};
