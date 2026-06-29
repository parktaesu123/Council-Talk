import {
  isValidEmail,
  isValidStudentIdentity,
  isValidStudentPin,
  normalizeEmail,
  normalizeStudentIdentity,
  publicStudent,
  studentKey,
} from "../../../domain/council/state.js";

export const createStudentProfileSupport = ({ clock, hashPin }) => {
  const getStudentRecord = (state, identity) => state.students[studentKey(identity)] || null;

  const ensureStudentProfile = (
    state,
    { studentId, name, pin },
    { createIfMissing = false, email = "" } = {},
  ) => {
    const profile = normalizeStudentIdentity({ studentId, name });
    const cleanPin = String(pin || "").trim();
    const cleanEmail = normalizeEmail(email);

    if (!isValidStudentIdentity(profile) || !isValidStudentPin(cleanPin)) {
      return null;
    }

    if (createIfMissing && !isValidEmail(cleanEmail)) {
      return null;
    }

    const existing = getStudentRecord(state, profile);

    if (existing && existing.pinHash !== hashPin(cleanPin)) {
      return null;
    }

    if (!existing && !createIfMissing) {
      return null;
    }

    return existing
      ? publicStudent(existing)
      : publicStudent({
          ...profile,
          email: cleanEmail,
          pinHash: hashPin(cleanPin),
          createdAt: clock.now(),
          updatedAt: clock.now(),
        });
  };

  return {
    ensureStudentProfile,
    getStudentRecord,
  };
};
