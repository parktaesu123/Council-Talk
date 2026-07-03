import {
  initialCouncilState,
  listPublishedDaiSuDocuments,
  normalizeDaiSuShortText,
  normalizeDaiSuText,
} from "../../../domain/council/state.js";

const tokenize = (value) =>
  normalizeDaiSuText(value, 2000)
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

const unique = (items) => [...new Set(items)];
const includesAny = (text, patterns) => patterns.some((pattern) => text.includes(pattern));
const buildIdentityReply = (assistant) =>
  `나는 학생회 관련 문의를 도와주는 봇 ${assistant.name}야. 학생회가 등록한 안내와 이전 상담 내용을 바탕으로 먼저 답변하고, 필요한 경우 학생회 담당자가 이어서 확인해줄게.`;
const buildUnknownReply = (assistant) =>
  assistant.fallbackMessage ||
  "미안하지만 지금은 그 질문에 대해 정확히 모르겠어요. 학생회 담당자가 이어서 확인할 수 있도록 조금 더 자세히 남겨주세요.";

const scoreCorpusItem = (item, tokens) => {
  const title = normalizeDaiSuText(item.title || "", 160).toLowerCase();
  const content = normalizeDaiSuText(item.content || item.answer || "", 8000).toLowerCase();
  const tags = (item.tags || []).map((entry) => String(entry || "").toLowerCase());
  const keywords = (item.keywords || []).map((entry) => String(entry || "").toLowerCase());
  const question = normalizeDaiSuText(item.question || "", 800).toLowerCase();

  let score = 0;
  const matchedTokens = [];

  for (const token of tokens) {
    let tokenScore = 0;

    if (keywords.includes(token)) tokenScore += 5;
    if (tags.includes(token)) tokenScore += 3;
    if (title.includes(token)) tokenScore += 4;
    if (question.includes(token)) tokenScore += 4;
    if (content.includes(token)) tokenScore += 1;

    if (tokenScore > 0) {
      matchedTokens.push(token);
      score += tokenScore;
    }
  }

  return {
    item,
    matchedTokens: unique(matchedTokens),
    score,
  };
};

const extractRelevantLines = (text, tokens) => {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const matched = lines.filter((line) =>
    tokens.some((token) => line.toLowerCase().includes(token.toLowerCase())),
  );

  return (matched.length > 0 ? matched : lines).slice(0, 4);
};

const buildConversation = (thread) =>
  (thread.messages || []).slice(-10).map((message) => ({
    role: message.author === "student" ? "user" : "assistant",
    content: String(message.text || ""),
  }));

const buildContextText = ({ assistant, documents, lessons, ranked }) => {
  const sections = [];

  const topLessons = ranked
    .filter((entry) => entry.item.kind === "lesson")
    .slice(0, 3)
    .map((entry, index) => `예시 ${index + 1}\n질문: ${entry.item.question}\n답변: ${entry.item.answer}`)
    .join("\n\n");

  if (topLessons) {
    sections.push(`이전 대화에서 학습한 예시:\n${topLessons}`);
  }

  const generalGuide = documents
    .slice(0, 2)
    .map((document) => extractRelevantLines(document.content, []))
    .flat()
    .slice(0, 5)
    .join("\n");

  if (generalGuide) {
    sections.push(`학생회 운영 원칙과 안내 요약:\n${normalizeDaiSuText(generalGuide, 1200)}`);
  }

  const topDocs = ranked
    .filter((entry) => entry.item.kind === "document")
    .slice(0, 3)
    .map((entry, index) => {
      const summary = extractRelevantLines(entry.item.content, entry.matchedTokens)
        .slice(0, 3)
        .join("\n");
      return `문서 ${index + 1}: ${entry.item.title}\n핵심 요점:\n${summary}`;
    })
    .join("\n\n");

  if (topDocs) {
    sections.push(`관련 참고 문서:\n${topDocs}`);
  }

  if ((assistant.guardrails || []).length > 0) {
    sections.push(`주의 규칙:\n${assistant.guardrails.map((rule) => `- ${rule}`).join("\n")}`);
  }

  return sections.join("\n\n");
};

export const createDaiSuResponder = ({ modelClient }) => ({
  async buildReply({ assistant, state, studentMessage, thread }) {
    const resolvedAssistant = assistant || initialCouncilState.daisuAssistant;
    const rawQuestion = normalizeDaiSuText(studentMessage.text, 2000).toLowerCase();
    const tokens = unique(tokenize(studentMessage.text));
    const documents = listPublishedDaiSuDocuments(state).map((document) => ({
      ...document,
      kind: "document",
    }));
    const lessons = (state.daisuLessons || []).map((lesson) => ({
      ...lesson,
      kind: "lesson",
      title: lesson.question,
      content: lesson.answer,
      tags: [],
      keywords: [],
    }));

    if (
      includesAny(rawQuestion, [
        "너 누구야",
        "누구야",
        "뭐하는",
        "정체가 뭐야",
        "너는 누구",
      ])
    ) {
      return {
        matchedDocuments: [],
        mode: "identity",
        replyText: buildIdentityReply(resolvedAssistant),
        score: 100,
        usedFallback: false,
      };
    }

    if (tokens.length === 0) {
      return {
        matchedDocuments: [],
        mode: "fallback",
        replyText: buildUnknownReply(resolvedAssistant),
        score: 0,
        usedFallback: true,
      };
    }

    const ranked = [...documents, ...lessons]
      .map((item) => scoreCorpusItem(item, tokens))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score);

    const top = ranked[0];
    const contextText = buildContextText({
      assistant: resolvedAssistant,
      documents,
      lessons,
      ranked,
    });
    const modelResult = await modelClient.generateReply({
      assistant: resolvedAssistant,
      contextText,
      conversation: buildConversation(thread),
    });
    const providerSkippedReason = modelResult.skipped || "";

    if (modelResult.text) {
      return {
        matchedDocuments: ranked
          .map((entry) => entry.item)
          .filter((item) => item.kind === "document"),
        mode: "generative",
        replyText: modelResult.text,
        score: Math.max(top?.score || 0, 20),
        usedFallback: false,
        providerSkippedReason,
      };
    }

    if (!top || top.score < resolvedAssistant.confidenceThreshold) {
      return {
        matchedDocuments: ranked.map((entry) => entry.item).filter((item) => item.kind === "document"),
        mode: "fallback",
        replyText: buildUnknownReply(resolvedAssistant),
        score: top?.score || 0,
        usedFallback: true,
        providerSkippedReason,
      };
    }

    if (top.item.kind === "lesson") {
      return {
        matchedDocuments: [],
        mode: "lesson",
        replyText: top.item.answer,
        score: top.score,
        usedFallback: false,
        providerSkippedReason,
      };
    }

    const relatedLines = extractRelevantLines(top.item.content, top.matchedTokens)
      .map((line) => normalizeDaiSuShortText(line, 160));
    const firstPoint = relatedLines[0] || "";
    const secondPoint = relatedLines[1] || "";
    const opening = `안녕하세요, ${resolvedAssistant.name}입니다.`;
    const body = secondPoint
      ? `${firstPoint} ${secondPoint}`.trim()
      : firstPoint;
    const closing =
      thread.tagName || top.item.category
        ? `${thread.tagName || top.item.category}처럼 세부 상황에 따라 달라질 수 있어서, 필요하면 학생회 담당자가 이어서 더 정확히 확인해드릴게요.`
        : "상황에 따라 세부 안내가 달라질 수 있어서, 필요하면 학생회 담당자가 이어서 더 정확히 확인해드릴게요.";

    return {
      matchedDocuments: ranked.map((entry) => entry.item).filter((item) => item.kind === "document"),
      mode: "retrieval-template",
      replyText: [opening, body, closing].filter(Boolean).join("\n\n"),
      score: top.score,
      usedFallback: false,
      providerSkippedReason,
    };
  },
});
