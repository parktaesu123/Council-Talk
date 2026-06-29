import {
  createThreadSummaries,
  getVisibleThreads,
  isValidStudentPin,
  publicStudent,
} from "../../../domain/council/state.js";
import { unauthorized } from "../../errors.js";

export const createCreateStudentSession = ({
  ensureStudentProfile,
  hashPin,
  stateStore,
}) => async (payload) => {
  const state = await stateStore.read();
  const profile = payload?.studentId
    ? ensureStudentProfile(state, payload || {})
    : (() => {
        const cleanName = String(payload?.name || "").trim();
        const cleanPin = String(payload?.pin || "").trim();

        if (!cleanName || !isValidStudentPin(cleanPin)) {
          return null;
        }

        const student = Object.values(state.students).find(
          (item) => item.name === cleanName && item.pinHash === hashPin(cleanPin),
        );

        return student ? publicStudent(student) : null;
      })();

  if (!profile) {
    throw unauthorized("Invalid student credentials");
  }

  return {
    profile,
    threads: createThreadSummaries(getVisibleThreads(state, profile)),
  };
};
