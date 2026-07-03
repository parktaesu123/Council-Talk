import { badRequest, notFound } from "../../errors.js";
import {
  initialCouncilState,
  normalizeDaiSuText,
} from "../../../domain/council/state.js";

export const createPreviewDaiSuReply = ({ responder, stateStore }) => async ({
  text,
  threadId,
}) => {
  const normalizedText = normalizeDaiSuText(text, 2000);

  if (!normalizedText) {
    throw badRequest("Missing preview text");
  }

  const state = await stateStore.read();
  const assistant = state.daisuAssistant || initialCouncilState.daisuAssistant;
  const thread = threadId
    ? state.threads.find((item) => item.id === threadId) || null
    : null;

  if (threadId && !thread) {
    throw notFound("Thread not found");
  }

  const previewStudentMessage = {
    id: "preview-student-message",
    author: "student",
    authorLabel: "미리보기 사용자",
    text: normalizedText,
  };

  const previewThread = thread
    ? {
        ...thread,
        messages: [...(thread.messages || []), previewStudentMessage],
      }
    : {
        id: "preview-thread",
        title: "따이수 미리보기",
        tagName: "",
        messages: [previewStudentMessage],
      };

  const result = await responder.buildReply({
    assistant,
    state,
    studentMessage: previewStudentMessage,
    thread: previewThread,
  });

  return {
    matchedDocuments: (result.matchedDocuments || []).map((document) => ({
      id: document.id,
      title: document.title,
      category: document.category,
    })),
    mode: result.mode,
    replyText: result.replyText,
    score: result.score,
    usedFallback: result.usedFallback,
    providerSkippedReason: result.providerSkippedReason || "",
  };
};
