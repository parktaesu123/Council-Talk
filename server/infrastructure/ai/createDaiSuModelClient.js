const buildMessages = ({ assistant, conversation, contextText }) => {
  const systemPrompt = [
    `너는 학생회 문의를 도와주는 대화형 AI ${assistant.name || "따이수"}다.`,
    "너의 역할은 학생 질문에 친절하고 자연스럽게 답변하는 것이다.",
    "학생회가 입력한 참고 내용을 최우선으로 반영하되, 그 내용만 기계적으로 복붙하지 말고 자연스럽게 설명한다.",
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

export const createDaiSuModelClient = ({ config, logger }) => ({
  async generateReply({ assistant, contextText, conversation }) {
    if (!config.daisuAi.enabled || !config.daisuAi.apiKey) {
      return { text: "", skipped: "provider-disabled" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.daisuAi.timeoutMs);

    try {
      const response = await fetch(config.daisuAi.apiUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.daisuAi.apiKey}`,
        },
        body: JSON.stringify({
          model: config.daisuAi.model,
          temperature: 0.5,
          messages: buildMessages({
            assistant,
            contextText,
            conversation,
          }),
        }),
      });

      if (!response.ok) {
        logger.error("[daisu model failed]", response.status, await response.text());
        return { text: "", skipped: "provider-error" };
      }

      const payload = await response.json();
      const text = String(payload?.choices?.[0]?.message?.content || "").trim();
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
