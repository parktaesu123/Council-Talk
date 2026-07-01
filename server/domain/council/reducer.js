import { normalizeDaiSuLessonKey, normalizeThreadStatus, studentKey } from "./state.js";

const replaceThread = (threads, nextThread) => {
  const index = threads.findIndex((thread) => thread.id === nextThread.id);

  if (index < 0) {
    return [nextThread, ...threads];
  }

  const updated = [...threads];
  updated[index] = nextThread;
  return updated;
};

export const applyCouncilEvent = (state, event) => {
  switch (event.type) {
    case "student.registered": {
      const student = event.payload.student;
      return {
        ...state,
        students: {
          ...state.students,
          [studentKey(student)]: student,
        },
      };
    }

    case "student.emailUpdated":
    case "student.banStatusChanged": {
      const student = event.payload.student;
      return {
        ...state,
        students: {
          ...state.students,
          [studentKey(student)]: student,
        },
      };
    }

    case "student.profileChanged": {
      const { previousKey, student } = event.payload;
      const nextStudents = { ...state.students };
      delete nextStudents[previousKey];
      nextStudents[studentKey(student)] = student;

      return {
        ...state,
        students: nextStudents,
      };
    }

    case "tag.created": {
      return {
        ...state,
        tags: [...state.tags, event.payload.tag],
      };
    }

    case "tag.deleted": {
      return {
        ...state,
        tags: state.tags.filter((tag) => tag.id !== event.payload.tagId),
      };
    }

    case "notificationEmail.added": {
      return {
        ...state,
        notificationEmails: [...state.notificationEmails, event.payload.notificationEmail],
      };
    }

    case "notificationEmail.removed": {
      return {
        ...state,
        notificationEmails: state.notificationEmails.filter(
          (item) => item.id !== event.payload.notificationEmailId,
        ),
      };
    }

    case "daisu.settingsUpdated": {
      return {
        ...state,
        daisuAssistant: event.payload.assistant,
      };
    }

    case "daisu.documentCreated": {
      return {
        ...state,
        daisuKnowledgeDocuments: [event.payload.document, ...state.daisuKnowledgeDocuments],
      };
    }

    case "daisu.documentUpdated": {
      return {
        ...state,
        daisuKnowledgeDocuments: state.daisuKnowledgeDocuments.map((document) =>
          document.id === event.payload.document.id ? event.payload.document : document,
        ),
      };
    }

    case "daisu.documentDeleted": {
      return {
        ...state,
        daisuKnowledgeDocuments: state.daisuKnowledgeDocuments.filter(
          (document) => document.id !== event.payload.documentId,
        ),
      };
    }

    case "daisu.answerLogged": {
      return {
        ...state,
        daisuAnswerLogs: [event.payload.log, ...state.daisuAnswerLogs].slice(0, 500),
      };
    }

    case "daisu.lessonLearned": {
      const lessonKey = normalizeDaiSuLessonKey(event.payload.lesson.question);
      return {
        ...state,
        daisuLessons: [
          event.payload.lesson,
          ...state.daisuLessons.filter(
            (lesson) => normalizeDaiSuLessonKey(lesson.question) !== lessonKey,
          ),
        ].slice(0, 500),
      };
    }

    case "profileChange.requested": {
      const request = event.payload.request;
      const existingIndex = state.profileRequests.findIndex((item) => item.id === request.id);

      if (existingIndex < 0) {
        return {
          ...state,
          profileRequests: [request, ...state.profileRequests],
        };
      }

      const nextRequests = [...state.profileRequests];
      nextRequests[existingIndex] = request;
      return {
        ...state,
        profileRequests: nextRequests,
      };
    }

    case "profileChange.reviewed": {
      const nextRequests = state.profileRequests.map((item) =>
        item.id === event.payload.request.id ? event.payload.request : item,
      );
      return {
        ...state,
        profileRequests: nextRequests,
      };
    }

    case "thread.created":
    case "thread.messageAdded":
    case "thread.messageUpdated":
    case "thread.messageDeleted":
    case "thread.statusChanged":
    case "thread.reopened": {
      const thread = {
        ...event.payload.thread,
        status: normalizeThreadStatus(event.payload.thread.status),
      };
      return {
        ...state,
        threads: replaceThread(state.threads, thread),
      };
    }

    default:
      return state;
  }
};
