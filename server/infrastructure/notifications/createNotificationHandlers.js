import nodemailer from "nodemailer";

import { isDaiSuThread, normalizeThreadStatus, studentKey } from "../../domain/council/state.js";

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const createTransporter = (config) => {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
};

const createBaseUrlResolver = (config) => (requestBaseUrl = "") =>
  String(config.publicBaseUrl || requestBaseUrl || "").replace(/\/$/, "");

export const createNotificationHandlers = ({
  config,
  logger,
  queryState,
}) => {
  const transporter = createTransporter(config);
  const resolveBaseUrl = createBaseUrlResolver(config);

  const sendDiscordThreadNotification = async (thread) => {
    if (!config.discordWebhookUrl) {
      return;
    }

    if (isDaiSuThread(thread)) {
      return;
    }

    try {
      const response = await fetch(config.discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Council Talk",
          embeds: [
            {
              title: "새 문의가 들어왔습니다",
              description: `**${thread.title}**`,
              color: 0x171717,
              fields: [
                { name: "학생", value: `${thread.name} · ${thread.studentId}`, inline: true },
                { name: "상태", value: normalizeThreadStatus(thread.status), inline: true },
                { name: "태그", value: thread.tagName || "태그 없음", inline: true },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });

      if (!response.ok) {
        logger.error("[discord failed]", response.status, await response.text());
      }
    } catch (error) {
      logger.error("[discord failed]", error.message);
    }
  };

  const sendAdminEmail = async (thread) => {
    if (isDaiSuThread(thread)) {
      return;
    }

    const state = await queryState();
    const recipients = state.notificationEmails.map((item) => item.email).filter(Boolean);

    if (recipients.length === 0 || !transporter) {
      return;
    }

    const safeTitle = escapeHtml(thread.title);
    const safeName = escapeHtml(thread.name);
    const safeStudentId = escapeHtml(thread.studentId);
    const safeStatus = escapeHtml(normalizeThreadStatus(thread.status));
    const safeUrl = escapeHtml(resolveBaseUrl());

    try {
      await transporter.sendMail({
        from: config.smtp.from,
        to: recipients,
        subject: `[Council Talk] 새 채팅방: ${thread.title}`,
        text: [
          "새 채팅방이 개설되었습니다.",
          "",
          `제목: ${thread.title}`,
          `학생: ${thread.name} (${thread.studentId})`,
          `상태: ${normalizeThreadStatus(thread.status)}`,
          `확인: ${resolveBaseUrl()}/admin/inquiries/${encodeURIComponent(thread.id)}`,
        ].join("\n"),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#202123">
            <h2>새 채팅방이 개설되었습니다.</h2>
            <p><strong>제목</strong>: ${safeTitle}</p>
            <p><strong>학생</strong>: ${safeName} (${safeStudentId})</p>
            <p><strong>상태</strong>: ${safeStatus}</p>
            <p><a href="${safeUrl}/admin/inquiries/${encodeURIComponent(thread.id)}">어드민에서 확인</a></p>
          </div>
        `,
      });
    } catch (error) {
      logger.error("[mail failed]", error.message);
    }
  };

  const sendStudentReplyEmail = async (thread) => {
    if (isDaiSuThread(thread)) {
      return;
    }

    const state = await queryState();
    const student = state.students[studentKey(thread)];
    const recipient = student?.email;
    const message = thread.messages.at(-1);

    if (!recipient || message?.author !== "admin" || !transporter) {
      return;
    }

    const safeTitle = escapeHtml(thread.title);
    const safeName = escapeHtml(message.authorLabel || "학생회");
    const safeText = escapeHtml(message.text);
    const safeUrl = escapeHtml(resolveBaseUrl());

    try {
      await transporter.sendMail({
        from: config.smtp.from,
        to: recipient,
        subject: `[Council Talk] 답변이 도착했습니다: ${thread.title}`,
        text: [
          "학생회 답변이 도착했습니다.",
          "",
          `문의: ${thread.title}`,
          `답변자: ${message.authorLabel || "학생회"}`,
          `내용: ${message.text}`,
          `확인하기: ${resolveBaseUrl()}/`,
        ].join("\n"),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#202123">
            <h2>학생회 답변이 도착했습니다.</h2>
            <p><strong>문의</strong>: ${safeTitle}</p>
            <p><strong>답변자</strong>: ${safeName}</p>
            <p>${safeText}</p>
            <p><a href="${safeUrl}/">Council Talk에서 확인</a></p>
          </div>
        `,
      });
    } catch (error) {
      logger.error("[student mail failed]", error.message);
    }
  };

  const onThreadChanged = async (event) => {
    const thread = event.payload.thread;

    if (event.type === "thread.created") {
      await Promise.all([
        sendAdminEmail(thread),
        sendDiscordThreadNotification(thread),
      ]);
      return;
    }

    if (event.type === "thread.messageAdded") {
      await sendStudentReplyEmail(thread);
    }
  };

  return {
    "thread.created": [onThreadChanged],
    "thread.messageAdded": [onThreadChanged],
  };
};
