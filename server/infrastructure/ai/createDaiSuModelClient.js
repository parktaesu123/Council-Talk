const normalizeReplyText = (value) => {
  const text = String(value || "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) {
    return "";
  }

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join("\n")
    .slice(0, 700)
    .trim();
};

const buildMessages = ({ assistant, conversation, contextText }) => {
  const systemPrompt = [
    `너는 학생회 문의를 도와주는 대화형 AI ${assistant.name || "따이수"}다.`,
    "너의 역할은 학생 질문에 친절하고 자연스럽게 답변하는 것이다.",
    assistant.tone ? `답변 톤: ${assistant.tone}` : "",
    "학생회가 입력한 참고 내용은 근거로만 사용하고, 문장을 그대로 베끼지 말고 네가 이해한 내용으로 다시 설명한다.",
    "답변은 따이수 자신의 말처럼 자연스럽게 말한다. '참고 내용에 따르면', '등록된 안내를 기준으로' 같은 메타 표현은 쓰지 않는다.",
    "가능하면 짧은 문단 1~3개로 답하고, 불필요한 bullet list나 안내문 문체를 남발하지 않는다.",
    "모르는 내용은 추측하지 말고 모른다고 말한다.",
    "질문이 모호하면 필요한 정보를 짧게 다시 물어본다.",
    contextText ? `참고 내용:\n${contextText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { role: "system", content: systemPrompt },
    ...conversation,
  ];
};

const buildAnthropicMessages = ({ conversation }) =>
  conversation.map((message) => ({
    role: message.role,
    content: [{ type: "text", text: String(message.content || "") }],
  }));

export const createDaiSuModelClient = ({ config, logger }) => ({
  getStatus() {
    return {
      enabled: Boolean(config.daisuAi.enabled),
      configured: Boolean(config.daisuAi.apiKey),
      model: config.daisuAi.model,
      provider: config.daisuAi.provider,
      timeoutMs: config.daisuAi.timeoutMs,
    };
  },

  async generateReply({ assistant, contextText, conversation }) {
    if (!config.daisuAi.enabled || !config.daisuAi.apiKey) {
      return { text: "", skipped: "provider-disabled" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.daisuAi.timeoutMs);

    try {
      const isAnthropic = config.daisuAi.provider === "anthropic";
      const response = await fetch(
        config.daisuAi.apiUrl,
        isAnthropic
          ? {
              method: "POST",
              signal: controller.signal,
              headers: {
                "Content-Type": "application/json",
                "anthropic-version": "2023-06-01",
                "x-api-key": config.daisuAi.apiKey,
              },
              body: JSON.stringify({
                model: config.daisuAi.model,
                max_tokens: 500,
                system: buildMessages({
                  assistant,
                  contextText,
                  conversation: [],
                })[0].content,
                messages: buildAnthropicMessages({
                  conversation,
                }),
              }),
            }
          : {
              method: "POST",
              signal: controller.signal,
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.daisuAi.apiKey}`,
              },
              body: JSON.stringify({
                model: config.daisuAi.model,
                temperature: 0.7,
                messages: buildMessages({
                  assistant,
                  contextText,
                  conversation,
                }),
              }),
            },
      );

      if (!response.ok) {
        logger.error("[daisu model failed]", response.status, await response.text());
        return { text: "", skipped: "provider-error" };
      }

      const payload = await response.json();
      const text = normalizeReplyText(
        config.daisuAi.provider === "anthropic"
          ? payload?.content
              ?.filter((item) => item?.type === "text")
              .map((item) => item?.text || "")
              .join("\n")
          : payload?.choices?.[0]?.message?.content,
      );
      return {
        text,
        skipped: text ? "" : "empty-provider-response",
      };
    } catch (error) {
      if (error.name === "AbortError") {
        logger.error("[daisu model failed]", `timeout after ${config.daisuAi.timeoutMs}ms`);
        return { text: "", skipped: "provider-timeout" };
      }

      logger.error("[daisu model failed]", error.message);
      return { text: "", skipped: "provider-exception" };
    } finally {
      clearTimeout(timeout);
    }
  },
});
