import {
  badRequest,
  conflict,
  notFound,
  unauthorized,
} from "../errors.js";
import { createCreateStudentSession } from "./councilService/createCreateStudentSession.js";
import { createGetThread } from "./councilService/createGetThread.js";
import { createGetThreadMessages } from "./councilService/createGetThreadMessages.js";
import { createListThreadSummaries } from "./councilService/createListThreadSummaries.js";
import { createListStudents } from "./councilService/createListStudents.js";
import { createSignupStudent } from "./councilService/createSignupStudent.js";
import { createUpdateStudentEmail } from "./councilService/createUpdateStudentEmail.js";
import { createStudentRegisteredEventBuilder } from "./councilService/createStudentRegisteredEventBuilder.js";
import { createStudentProfileSupport } from "./councilService/createStudentProfileSupport.js";
import { createDomainEvent } from "../../domain/shared/domainEvent.js";
import {
  canManageMessage,
  canUseThreadAsStudent,
  createThreadSummary,
  createThreadSummaries,
  getVisibleThreads,
  initialCouncilState,
  isRecentDuplicateMessage,
  isValidEmail,
  isValidStudentIdentity,
  isValidStudentPin,
  listPublicStudents,
  normalizeClientMessageId,
  normalizeEmail,
  normalizeReplyTarget,
  normalizeStudentIdentity,
  normalizeTagName,
  normalizeThreadForClient,
  normalizeThreadsForClient,
  normalizeThreadStatus,
  paginateThreadMessages,
  publicStudent,
  sortThreadsByActivity,
  studentKey,
} from "../../domain/council/state.js";

export const createCouncilService = ({
  clock,
  hashPin,
  idGenerator,
  stateStore,
}) => {
  const { ensureStudentProfile, getStudentRecord } = createStudentProfileSupport({
    clock,
    hashPin,
  });
  const { buildStudentRegisteredEvent } = createStudentRegisteredEventBuilder({
    hashPin,
  });
  const listThreadSummaries = createListThreadSummaries({
    stateStore,
  });
  const getThread = createGetThread({
    stateStore,
  });
  const getThreadMessages = createGetThreadMessages({
    stateStore,
  });
  const createStudentSession = createCreateStudentSession({
    ensureStudentProfile,
    hashPin,
    stateStore,
  });
  const signupStudent = createSignupStudent({
    buildStudentRegisteredEvent,
    clock,
    ensureStudentProfile,
    getStudentRecord,
    stateStore,
  });
  const listStudents = createListStudents({
    stateStore,
  });
  const updateStudentEmail = createUpdateStudentEmail({
    clock,
    ensureStudentProfile,
    stateStore,
  });

  return {
    async getState() {
      return stateStore.read();
    },

    async listThreads() {
      return listThreadSummaries();
    },

    listThreadSummaries,

    getThread,

    getThreadMessages,

    async listTags() {
      const state = await stateStore.read();
      return { tags: state.tags };
    },

    async listNotificationEmails() {
      const state = await stateStore.read();
      return { emails: state.notificationEmails };
    },

    async createNotificationEmail({ email }) {
      const normalizedEmail = normalizeEmail(email);

      if (!isValidEmail(normalizedEmail)) {
        throw badRequest("Invalid email");
      }

      const outcome = await stateStore.transact(async (state) => {
        const exists = state.notificationEmails.some((item) => item.email === normalizedEmail);

        if (exists) {
          return {};
        }

        return {
          events: [
            createDomainEvent({
              type: "notificationEmail.added",
              payload: {
                notificationEmail: {
                  id: idGenerator(),
                  email: normalizedEmail,
                  createdAt: clock.now(),
                },
              },
            }),
          ],
        };
      });

      return { emails: outcome.state.notificationEmails };
    },

    async deleteNotificationEmail(notificationEmailId) {
      const outcome = await stateStore.transact(async (state) => {
        const target = state.notificationEmails.find((item) => item.id === notificationEmailId);

        if (!target) {
          return {};
        }

        return {
          events: [
            createDomainEvent({
              type: "notificationEmail.removed",
              payload: { notificationEmailId },
            }),
          ],
        };
      });

      return { emails: outcome.state.notificationEmails };
    },

    async createTag({ name }) {
      const normalizedName = normalizeTagName(name);

      if (!normalizedName) {
        throw badRequest("Missing tag name");
      }

      const outcome = await stateStore.transact(async (state) => {
        if (state.tags.some((tag) => tag.name === normalizedName)) {
          return {};
        }

        return {
          events: [
            createDomainEvent({
              type: "tag.created",
              payload: {
                tag: {
                  id: idGenerator(),
                  name: normalizedName,
                  createdAt: clock.now(),
                },
              },
            }),
          ],
        };
      });

      return { tags: outcome.state.tags };
    },

    async deleteTag(tagId) {
      const outcome = await stateStore.transact(async (state) => {
        if (!state.tags.some((tag) => tag.id === tagId)) {
          return {};
        }

        return {
          events: [
            createDomainEvent({
              type: "tag.deleted",
              payload: { tagId },
            }),
          ],
        };
      });

      return { tags: outcome.state.tags };
    },

    createStudentSession,

    signupStudent,

    updateStudentEmail,

    listStudents,

    async requestProfileChange(payload) {
      const state = await stateStore.read();
      const profile = ensureStudentProfile(state, payload || {});
      const nextProfile = normalizeStudentIdentity({
        studentId: payload?.newStudentId,
        name: payload?.newName,
      });

      if (!profile || !isValidStudentIdentity(nextProfile)) {
        throw badRequest("Invalid profile change request");
      }

      if (profile.studentId === nextProfile.studentId && profile.name === nextProfile.name) {
        throw badRequest("No profile changes requested");
      }

      if (getStudentRecord(state, nextProfile)) {
        throw conflict("Requested profile already exists");
      }

      const existing = state.profileRequests.find(
        (item) =>
          item.status === "대기" &&
          item.studentId === profile.studentId &&
          item.name === profile.name,
      );
      const now = clock.now();
      const request = existing
        ? {
            ...existing,
            newStudentId: nextProfile.studentId,
            newName: nextProfile.name,
            updatedAt: now,
          }
        : {
            id: idGenerator(),
            studentId: profile.studentId,
            name: profile.name,
            newStudentId: nextProfile.studentId,
            newName: nextProfile.name,
            status: "대기",
            createdAt: now,
            updatedAt: now,
          };

      const outcome = await stateStore.transact(async () => ({
        events: [
          createDomainEvent({
            type: "profileChange.requested",
            payload: { request },
          }),
        ],
      }));

      return {
        domainEvents: outcome.events,
        requests: outcome.state.profileRequests,
      };
    },

    async listProfileRequests() {
      const state = await stateStore.read();
      return { requests: state.profileRequests };
    },

    async reviewProfileRequest(requestId, status) {
      if (!["승인", "거절"].includes(status)) {
        throw badRequest("Invalid request status");
      }

      const outcome = await stateStore.transact(async (state) => {
        const profileRequest = state.profileRequests.find((item) => item.id === requestId);

        if (!profileRequest) {
          throw notFound("Profile request not found");
        }

        if (profileRequest.status !== "대기") {
          return {};
        }

        const events = [];
        const now = clock.now();

        if (status === "승인") {
          const previousKey = studentKey(profileRequest);
          const savedStudent = state.students[previousKey];
          const nextProfile = normalizeStudentIdentity({
            studentId: profileRequest.newStudentId,
            name: profileRequest.newName,
          });

          if (!savedStudent || (state.students[studentKey(nextProfile)] && studentKey(nextProfile) !== previousKey)) {
            throw conflict("Profile change cannot be approved");
          }

          const updatedStudent = {
            ...savedStudent,
            ...nextProfile,
            updatedAt: now,
          };
          const updatedThreads = state.threads
            .filter(
              (thread) =>
                thread.studentId === profileRequest.studentId && thread.name === profileRequest.name,
            )
            .map((thread) => ({
              ...thread,
              studentId: nextProfile.studentId,
              name: nextProfile.name,
              updatedAt: now,
              messages: thread.messages.map((message) =>
                message.author === "student"
                  ? { ...message, authorLabel: nextProfile.name }
                  : message,
              ),
            }));

          events.push(
            createDomainEvent({
              type: "student.profileChanged",
              payload: {
                previousKey,
                student: updatedStudent,
              },
            }),
          );
          updatedThreads.forEach((thread) => {
            events.push(
              createDomainEvent({
                type: "thread.statusChanged",
                payload: { thread },
              }),
            );
          });
        }

        events.push(
          createDomainEvent({
            type: "profileChange.reviewed",
            payload: {
              request: {
                ...profileRequest,
                status,
                reviewedAt: now,
                updatedAt: now,
              },
            },
          }),
        );

        return { events };
      });

      return {
        domainEvents: outcome.events,
        requests: outcome.state.profileRequests,
        students: listPublicStudents(outcome.state),
        threads: normalizeThreadsForClient(outcome.state.threads),
      };
    },

    async createThread(payload) {
      const state = await stateStore.read();
      const profile = ensureStudentProfile(state, payload || {});

      if (!profile) {
        throw unauthorized("Invalid student credentials");
      }

      if (profile.banned) {
        const error = conflict("banned");
        error.reason = profile.banReason;
        error.status = 403;
        throw error;
      }

      const title = String(payload?.title || "").trim();
      const content = String(payload?.content || "").trim();

      if (!title || !content) {
        throw badRequest("Missing required inquiry fields");
      }

      const tag = state.tags.find((item) => item.id === payload?.tagId);
      const now = clock.now();
      const thread = {
        id: idGenerator(),
        studentId: profile.studentId,
        name: profile.name,
        title,
        tagId: tag?.id || "",
        tagName: tag?.name || "",
        status: "미완료",
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id: idGenerator(),
            author: "student",
            authorLabel: profile.name,
            createdAt: now,
            time: clock.timeLabel(),
            text: content,
          },
        ],
      };

      const outcome = await stateStore.transact(async () => ({
        events: [
          createDomainEvent({
            type: "thread.created",
            payload: { thread },
          }),
        ],
      }));

      return {
        thread,
        threads: createThreadSummaries(getVisibleThreads(outcome.state, profile)),
        domainEvents: outcome.events,
      };
    },

    async createAdminStudentChat(payload) {
      const state = await stateStore.read();
      const profile = normalizeStudentIdentity(payload || {});

      if (!getStudentRecord(state, profile)) {
        throw notFound("Student not found");
      }

      const now = clock.now();
      const authorLabel = String(payload?.authorLabel || "학생회").trim();
      const title = String(payload?.title || "학생회 1:1 대화").trim();
      const text = String(payload?.message || "학생회에서 대화를 시작했습니다.").trim();
      const initialMessage = {
        id: idGenerator(),
        author: "admin",
        authorLabel,
        createdAt: now,
        time: clock.timeLabel(),
        text,
      };
      const thread = {
        id: idGenerator(),
        studentId: profile.studentId,
        name: profile.name,
        title,
        tagId: "",
        tagName: "",
        status: "진행중",
        createdAt: now,
        updatedAt: now,
        messages: [initialMessage],
      };

      const outcome = await stateStore.transact(async () => ({
        events: [
          createDomainEvent({
            type: "thread.created",
            payload: { thread },
          }),
        ],
      }));

      return {
        thread,
        threads: createThreadSummaries(outcome.state.threads),
        domainEvents: outcome.events,
      };
    },

    async addMessage(threadId, payload) {
      const author = payload?.author;
      const text = String(payload?.text || "").trim();

      if (!text || !["student", "admin"].includes(author)) {
        throw badRequest("Invalid message");
      }

      const outcome = await stateStore.transact(async (state) => {
        const thread = state.threads.find((item) => item.id === threadId);

        if (!thread) {
          throw notFound("Thread not found");
        }

        let profile = null;

        if (author === "student") {
          profile = ensureStudentProfile(state, payload || {});

          if (!profile || !canUseThreadAsStudent(thread, profile)) {
            throw unauthorized("Invalid student credentials");
          }

          if (profile.banned) {
            const error = conflict("banned");
            error.reason = profile.banReason;
            error.status = 403;
            throw error;
          }

          if (normalizeThreadStatus(thread.status) === "완료") {
            throw conflict("Completed thread is closed");
          }
        }

        const clientMessageId = normalizeClientMessageId(payload?.clientMessageId);
        const duplicate =
          (clientMessageId &&
            thread.messages.find((message) => message.clientMessageId === clientMessageId)) ||
          [...thread.messages]
            .reverse()
            .find((message) =>
              isRecentDuplicateMessage(message, { author, text }, Date.now()),
            );

        if (duplicate) {
          return {
            result: {
              duplicate: true,
              message: duplicate,
              thread,
              threads:
                author === "student"
                  ? createThreadSummaries(getVisibleThreads(state, profile))
                  : createThreadSummaries(state.threads),
            },
          };
        }

        const now = clock.now();
        const nextThread = {
          ...thread,
          status: author === "admin" ? "진행중" : "미완료",
          updatedAt: now,
          messages: [
            ...thread.messages,
            {
              id: idGenerator(),
              clientMessageId,
              author,
              authorLabel:
                author === "admin" ? String(payload?.authorLabel || "학생회").trim() : thread.name,
              createdAt: now,
              time: clock.timeLabel(),
              text,
              ...(normalizeReplyTarget(payload?.replyTo)
                ? { replyTo: normalizeReplyTarget(payload?.replyTo) }
                : {}),
            },
          ],
        };

        return {
          events: [
            createDomainEvent({
              type: "thread.messageAdded",
              payload: { thread: nextThread },
            }),
          ],
          result: {
            duplicate: false,
            thread: nextThread,
            message: nextThread.messages.at(-1),
            profile,
          },
        };
      });

      const result = outcome.result;
      const state = outcome.state ?? initialCouncilState;

      return {
        duplicate: Boolean(result?.duplicate),
        message: result?.message || null,
        thread: result?.thread ? createThreadSummary(result.thread) : null,
        threads: result?.threads || createThreadSummaries(state.threads),
        domainEvents: outcome.events,
      };
    },

    async updateMessage(threadId, messageId, payload) {
      const author = payload?.author;
      const text = String(payload?.text || "").trim();

      if (!text || !["student", "admin"].includes(author)) {
        throw badRequest("Invalid message update");
      }

      const outcome = await stateStore.transact(async (state) => {
        const thread = state.threads.find((item) => item.id === threadId);

        if (!thread) {
          throw notFound("Message not found");
        }

        const profile = author === "student" ? ensureStudentProfile(state, payload || {}) : null;

        if (author === "student") {
          if (!profile || !canUseThreadAsStudent(thread, profile)) {
            throw unauthorized("Unauthorized message update");
          }

          if (profile.banned) {
            const error = conflict("banned");
            error.reason = profile.banReason;
            error.status = 403;
            throw error;
          }
        }

        const message = thread.messages.find((item) => item.id === messageId);

        if (!message) {
          throw notFound("Message not found");
        }

        if (!canManageMessage(message, author)) {
          throw unauthorized("Unauthorized message update");
        }

        const nextThread = {
          ...thread,
          updatedAt: clock.now(),
          messages: thread.messages.map((item) =>
            item.id === messageId
              ? {
                  ...item,
                  text,
                  editedAt: clock.now(),
                }
              : item,
          ),
        };

        return {
          events: [
            createDomainEvent({
              type: "thread.messageUpdated",
              payload: { thread: nextThread },
            }),
          ],
          result: {
            thread: nextThread,
            threads:
              author === "student"
                ? createThreadSummaries(getVisibleThreads(state, profile))
                : createThreadSummaries(state.threads),
          },
        };
      });

      return {
        thread: normalizeThreadForClient(outcome.result.thread),
        threads: outcome.result.threads,
        domainEvents: outcome.events,
      };
    },

    async deleteMessage(threadId, messageId, payload) {
      const author = payload?.author;

      if (!["student", "admin"].includes(author)) {
        throw badRequest("Invalid message delete");
      }

      const outcome = await stateStore.transact(async (state) => {
        const thread = state.threads.find((item) => item.id === threadId);

        if (!thread) {
          throw notFound("Message not found");
        }

        const profile = author === "student" ? ensureStudentProfile(state, payload || {}) : null;

        if (author === "student") {
          if (!profile || !canUseThreadAsStudent(thread, profile)) {
            throw unauthorized("Unauthorized message delete");
          }

          if (profile.banned) {
            const error = conflict("banned");
            error.reason = profile.banReason;
            error.status = 403;
            throw error;
          }
        }

        const target = thread.messages.find((item) => item.id === messageId);

        if (!target) {
          throw notFound("Message not found");
        }

        if (!canManageMessage(target, author)) {
          throw unauthorized("Unauthorized message delete");
        }

        const nextThread = {
          ...thread,
          updatedAt: clock.now(),
          messages: thread.messages.filter((item) => item.id !== messageId),
        };

        return {
          events: [
            createDomainEvent({
              type: "thread.messageDeleted",
              payload: { thread: nextThread },
            }),
          ],
          result: {
            thread: nextThread,
            threads:
              author === "student"
                ? createThreadSummaries(getVisibleThreads(state, profile))
                : createThreadSummaries(state.threads),
          },
        };
      });

      return {
        thread: normalizeThreadForClient(outcome.result.thread),
        threads: outcome.result.threads,
        domainEvents: outcome.events,
      };
    },

    async changeThreadStatus(threadId, status) {
      const normalizedStatus = normalizeThreadStatus(status);
      const outcome = await stateStore.transact(async (state) => {
        const thread = state.threads.find((item) => item.id === threadId);

        if (!thread) {
          throw notFound("Thread not found");
        }

        const nextThread = {
          ...thread,
          status: normalizedStatus,
          updatedAt: clock.now(),
        };

        return {
          events: [
            createDomainEvent({
              type: "thread.statusChanged",
              payload: { thread: nextThread },
            }),
          ],
          result: { thread: nextThread },
        };
      });

      return {
        thread: normalizeThreadForClient(outcome.result.thread),
        threads: createThreadSummaries(outcome.state.threads),
        domainEvents: outcome.events,
      };
    },

    async reopenThread(threadId, payload) {
      const outcome = await stateStore.transact(async (state) => {
        const profile = ensureStudentProfile(state, payload || {});

        if (!profile) {
          throw unauthorized("Invalid student credentials");
        }

        const thread = state.threads.find((item) => item.id === threadId);

        if (!thread) {
          throw notFound("Thread not found");
        }

        if (!canUseThreadAsStudent(thread, profile)) {
          throw unauthorized("Invalid student credentials");
        }

        const nextThread = {
          ...thread,
          status: "진행중",
          updatedAt: clock.now(),
        };

        return {
          events: [
            createDomainEvent({
              type: "thread.reopened",
              payload: { thread: nextThread },
            }),
          ],
          result: { profile, thread: nextThread },
        };
      });

      return {
        thread: normalizeThreadForClient(outcome.result.thread),
        threads: createThreadSummaries(getVisibleThreads(outcome.state, outcome.result.profile)),
        domainEvents: outcome.events,
      };
    },

    async setStudentBanStatus(payload) {
      const identity = normalizeStudentIdentity(payload || {});

      if (!isValidStudentIdentity(identity)) {
        throw badRequest("Missing student identity");
      }

      const outcome = await stateStore.transact(async (state) => {
        const saved = getStudentRecord(state, identity);

        if (!saved) {
          throw notFound("Student not found");
        }

        return {
          events: [
            createDomainEvent({
              type: "student.banStatusChanged",
              payload: {
                student: {
                  ...saved,
                  banned: Boolean(payload?.banned),
                  banReason: payload?.banned ? String(payload?.reason || "").trim() : "",
                  bannedAt: payload?.banned ? clock.now() : "",
                  updatedAt: clock.now(),
                },
              },
            }),
          ],
        };
      });

      return {
        student: publicStudent(outcome.state.students[studentKey(identity)]),
        students: listPublicStudents(outcome.state),
      };
    },
  };
};
