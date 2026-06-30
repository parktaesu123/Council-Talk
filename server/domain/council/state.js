import { THREAD_STATUSES, normalizeThreadStatus } from "../thread/threadStatus.js";

export const initialCouncilState = {
  daisuAnswerLogs: [],
  daisuAssistant: {
    id: "daisu",
    name: "따이수",
    description: "학생회 문의를 돕는 AI 도우미",
    tone: "친절하고 간결하게 답변합니다.",
    guardrails: [],
    fallbackMessage:
      "현재 등록된 안내만으로는 정확한 답변이 어려워 학생회 담당자에게 연결하는 것이 안전합니다.",
    autoReplyEnabled: false,
    autoReplyTags: [],
    confidenceThreshold: 6,
    updatedAt: "",
  },
  daisuKnowledgeDocuments: [],
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

export const normalizeMessageReactionEmoji = (value) => String(value || "").trim().slice(0, 16);
export const normalizeDaiSuText = (value, limit = 4000) => String(value || "").trim().slice(0, limit);
export const normalizeDaiSuShortText = (value, limit = 120) => String(value || "").trim().slice(0, limit);
export const normalizeDaiSuTags = (value, limit = 12) =>
  (Array.isArray(value) ? value : String(value || "").split(","))
    .map((item) => normalizeDaiSuShortText(item, 24))
    .filter(Boolean)
    .slice(0, limit);
export const normalizeDaiSuGuardrails = (value, limit = 12) =>
  (Array.isArray(value) ? value : String(value || "").split("\n"))
    .map((item) => normalizeDaiSuText(item, 160))
    .filter(Boolean)
    .slice(0, limit);
export const normalizeDaiSuDocumentStatus = (value) => {
  const status = String(value || "").trim();
  return ["draft", "published", "archived"].includes(status) ? status : "draft";
};
export const normalizeDaiSuAssistantSettings = (value = {}, current = initialCouncilState.daisuAssistant) => ({
  ...current,
  name: normalizeDaiSuShortText(value.name || current.name, 40) || current.name,
  description: normalizeDaiSuText(value.description || current.description, 240) || current.description,
  tone: normalizeDaiSuText(value.tone || current.tone, 240) || current.tone,
  guardrails: normalizeDaiSuGuardrails(value.guardrails ?? current.guardrails),
  fallbackMessage:
    normalizeDaiSuText(value.fallbackMessage || current.fallbackMessage, 320) || current.fallbackMessage,
  autoReplyEnabled: Boolean(value.autoReplyEnabled),
  autoReplyTags: normalizeDaiSuTags(value.autoReplyTags ?? current.autoReplyTags),
  confidenceThreshold: Math.max(1, Math.min(Number(value.confidenceThreshold) || current.confidenceThreshold || 6, 50)),
  updatedAt: String(value.updatedAt || current.updatedAt || ""),
});
export const normalizeDaiSuKnowledgeDocument = (value = {}, current = null) => ({
  ...(current || {}),
  id: String(value.id || current?.id || "").trim(),
  title: normalizeDaiSuShortText(value.title || current?.title || "", 80),
  category: normalizeDaiSuShortText(value.category || current?.category || "", 40),
  tags: normalizeDaiSuTags(value.tags ?? current?.tags),
  keywords: normalizeDaiSuTags(value.keywords ?? current?.keywords, 24),
  content: normalizeDaiSuText(value.content || current?.content || "", 8000),
  status: normalizeDaiSuDocumentStatus(value.status || current?.status),
  createdAt: String(value.createdAt || current?.createdAt || ""),
  updatedAt: String(value.updatedAt || current?.updatedAt || ""),
});
export const normalizeDaiSuAnswerLog = (value = {}) => ({
  id: String(value.id || "").trim(),
  threadId: String(value.threadId || "").trim(),
  studentMessageId: String(value.studentMessageId || "").trim(),
  assistantMessageId: String(value.assistantMessageId || "").trim(),
  matchedDocumentIds: (Array.isArray(value.matchedDocumentIds) ? value.matchedDocumentIds : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 10),
  score: Number(value.score) || 0,
  mode: String(value.mode || "auto").trim() || "auto",
  createdAt: String(value.createdAt || "").trim(),
});
export const listPublishedDaiSuDocuments = (state) =>
  (state.daisuKnowledgeDocuments || []).filter((document) => document.status === "published");

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

export const createMessagePreview = (message) =>
  message
    ? {
        id: message.id,
        author: message.author,
        authorLabel: message.authorLabel,
        text: message.text,
        time: message.time,
        createdAt: message.createdAt,
      }
    : null;

export const createThreadSummary = (thread) => ({
  id: thread.id,
  studentId: thread.studentId,
  name: thread.name,
  title: thread.title,
  tagId: thread.tagId || "",
  tagName: thread.tagName || "",
  status: normalizeThreadStatus(thread.status),
  createdAt: thread.createdAt,
  updatedAt: thread.updatedAt,
  messageCount: Array.isArray(thread.messages) ? thread.messages.length : 0,
  latestMessage: createMessagePreview(thread.messages?.at(-1) || null),
});

export const createThreadSummaries = (threads) => threads.map(createThreadSummary);

export const paginateThreadMessages = (thread, { before, limit = 30 } = {}) => {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 30, 100));
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  const cursorIndex = before
    ? messages.findIndex((message) => message.id === before)
    : -1;
  const endExclusive = cursorIndex >= 0 ? cursorIndex : messages.length;
  const startInclusive = Math.max(0, endExclusive - normalizedLimit);
  const pageMessages = messages.slice(startInclusive, endExclusive);
  const hasMore = startInclusive > 0;
  const nextCursor = hasMore ? pageMessages[0]?.id || null : null;

  return {
    hasMore,
    limit: normalizedLimit,
    messages: pageMessages,
    nextCursor,
    totalCount: messages.length,
  };
};

export const sortThreadsByActivity = (threads) =>
  [...threads].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt),
  );

export { THREAD_STATUSES, normalizeThreadStatus };
