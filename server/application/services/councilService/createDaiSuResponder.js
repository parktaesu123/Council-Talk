import {
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

const scoreDocument = (document, tokens) => {
  const title = normalizeDaiSuText(document.title, 160).toLowerCase();
  const content = normalizeDaiSuText(document.content, 8000).toLowerCase();
  const tags = (document.tags || []).map((item) => String(item || "").toLowerCase());
  const keywords = (document.keywords || []).map((item) => String(item || "").toLowerCase());

  let score = 0;
  const matchedTokens = [];

  for (const token of tokens) {
    let tokenScore = 0;

    if (keywords.includes(token)) {
      tokenScore += 5;
    }

    if (tags.includes(token)) {
      tokenScore += 3;
    }

    if (title.includes(token)) {
      tokenScore += 4;
    }

    if (content.includes(token)) {
      tokenScore += 1;
    }

    if (tokenScore > 0) {
      matchedTokens.push(token);
      score += tokenScore;
    }
  }

  return {
    document,
    matchedTokens: unique(matchedTokens),
    score,
  };
};

const extractRelevantLines = (content, tokens) => {
  const lines = String(content || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const matched = lines.filter((line) =>
    tokens.some((token) => line.toLowerCase().includes(token.toLowerCase())),
  );

  return (matched.length > 0 ? matched : lines).slice(0, 3);
};

export const createDaiSuResponder = () => ({
  buildReply({ assistant, state, studentMessage, thread }) {
    const tokens = unique(tokenize(studentMessage.text));
    const publishedDocuments = listPublishedDaiSuDocuments(state);

    if (tokens.length === 0 || publishedDocuments.length === 0) {
      return {
        matchedDocuments: [],
        replyText: assistant.fallbackMessage,
        score: 0,
        usedFallback: true,
      };
    }

    const ranked = publishedDocuments
      .map((document) => scoreDocument(document, tokens))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);

    const top = ranked[0];

    if (!top || top.score < assistant.confidenceThreshold) {
      return {
        matchedDocuments: ranked.map((item) => item.document),
        replyText: assistant.fallbackMessage,
        score: top?.score || 0,
        usedFallback: true,
      };
    }

    const relatedLines = extractRelevantLines(top.document.content, top.matchedTokens);
    const opening = `안녕하세요, ${assistant.name}입니다. 등록된 학생회 안내를 기준으로 확인해봤어요.`;
    const body = relatedLines.map((line) => `- ${normalizeDaiSuShortText(line, 160)}`).join("\n");
    const closing =
      thread.tagName || top.document.category
        ? `추가로 ${thread.tagName || top.document.category} 상황이 다를 수 있으니 필요하면 학생회 담당자가 이어서 확인해드릴게요.`
        : "세부 상황이 다를 수 있으니 필요하면 학생회 담당자가 이어서 확인해드릴게요.";

    return {
      matchedDocuments: ranked.map((item) => item.document),
      replyText: [opening, "", body, "", closing].join("\n"),
      score: top.score,
      usedFallback: false,
    };
  },
});
