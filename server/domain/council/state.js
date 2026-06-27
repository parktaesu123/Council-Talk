import { THREAD_STATUSES, normalizeThreadStatus } from "../thread/threadStatus.js";

export const initialCouncilState = {
  notificationEmails: [],
  profileRequests: [],
  students: {},
  tags: [],
  threads: [],
};

export const normalizeStudentIdentity = ({ studentId, name }) => ({
  studentId: String(studentId || "").trim(),
  name: String(name || "").trim(),
});

export const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
export const normalizeTagName = (name) => String(name || "").trim().slice(0, 24);
export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const studentKey = ({ studentId, name }) => `${studentId}:${name}`;
export const isValidStudentPin = (pin) => /^\d{4}$/.test(String(pin || "").trim());
export const isValidStudentIdentity = ({ studentId, name }) =>
  /^\d{4}$/.test(String(studentId || "").trim()) && Boolean(String(name || "").trim());

export const publicStudent = (student) => ({
  studentId: student.studentId,
  name: student.name,
  email: student.email || "",
  banned: Boolean(student.banned),
  banReason: student.banReason || "",
  createdAt: student.createdAt,
  updatedAt: student.updatedAt,
});

export const listPublicStudents = (state) =>
  Object.values(state.students)
    .map(publicStudent)
    .sort((a, b) => `${a.studentId}${a.name}`.localeCompare(`${b.studentId}${b.name}`, "ko-KR"));

export const getVisibleThreads = (state, profile) =>
  state.threads.filter(
    (thread) => thread.studentId === profile.studentId && thread.name === profile.name,
  );

export const canUseThreadAsStudent = (thread, profile) =>
  profile && thread.studentId === profile.studentId && thread.name === profile.name;

export const canManageMessage = (message, author) =>
  (author === "admin" && message.author === "admin") ||
  (author === "student" && message.author === "student");

export const normalizeClientMessageId = (value) => {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{8,80}$/.test(id) ? id : "";
};

export const normalizeReplyTarget = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = String(value.id || "").trim();
  const authorLabel = String(value.authorLabel || "").trim();
  const text = String(value.text || "").trim();

  if (!id || !authorLabel || !text) {
    return null;
  }

  return { id, authorLabel, text };
};

export const isRecentDuplicateMessage = (message, { author, text }, nowMs) => {
  if (!message || message.author !== author || String(message.text || "").trim() !== text) {
    return false;
  }

  const createdAt = Date.parse(message.createdAt || message.updatedAt || "");
  return Number.isFinite(createdAt) && nowMs - createdAt < 3000;
};

export const normalizeThreadForClient = (thread) => ({
  ...thread,
  status: normalizeThreadStatus(thread.status),
});

export const normalizeThreadsForClient = (threads) => threads.map(normalizeThreadForClient);

export const sortThreadsByActivity = (threads) =>
  [...threads].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt),
  );

export { THREAD_STATUSES, normalizeThreadStatus };
