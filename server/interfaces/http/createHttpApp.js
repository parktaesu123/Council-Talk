import express from "express";
import path from "node:path";

import { ApplicationError } from "../../application/errors.js";

const getMailStatus = (config) => {
  const missing = ["host", "user", "pass"].filter((key) => !config.smtp[key]);

  return {
    configured: missing.length === 0,
    missing: missing.map((key) => `SMTP_${key.toUpperCase()}`),
    host: config.smtp.host,
    user: config.smtp.user,
    from: config.smtp.from,
  };
};

const handleError = (error, response) => {
  if (error instanceof ApplicationError) {
    response.status(error.status).json({
      message: error.message,
      ...(error.reason ? { reason: error.reason } : {}),
    });
    return;
  }

  console.error(error);
  response.status(500).json({ message: "Internal server error" });
};

const createRouteHandler = (handler) => async (request, response) => {
  try {
    await handler(request, response);
  } catch (error) {
    handleError(error, response);
  }
};

export const createHttpApp = ({ runtime }) => {
  const app = express();

  app.use(express.json());

  app.get("/healthz", (_request, response) => {
    response.type("text/plain").send("ok\n");
  });

  app.get("/api/events", createRouteHandler(async (request, response) => {
    await runtime.sseHub.handleConnection(request, response);
  }));

  app.get("/api/threads", createRouteHandler(async (_request, response) => {
    response.json(await runtime.service.listThreads());
  }));

  app.get("/api/thread-summaries", createRouteHandler(async (_request, response) => {
    response.json(await runtime.service.listThreadSummaries());
  }));

  app.get("/api/threads/:id", createRouteHandler(async (request, response) => {
    response.json(await runtime.service.getThread(request.params.id));
  }));

  app.get("/api/threads/:id/messages", createRouteHandler(async (request, response) => {
    response.json(
      await runtime.service.getThreadMessages(request.params.id, {
        before: request.query.before,
        limit: request.query.limit,
      }),
    );
  }));

  app.post("/api/threads/:id/typing", createRouteHandler(async (request, response) => {
    const clientId = String(request.body?.clientId || "").trim().slice(0, 80);
    const authorLabel = String(request.body?.authorLabel || "학생회").trim().slice(0, 30);
    const active = Boolean(request.body?.active);

    if (!clientId) {
      response.status(400).json({ message: "Missing typing client" });
      return;
    }

    runtime.typingPresence.update(request.params.id, {
      active,
      authorLabel,
      clientId,
    });

    response.json({ ok: true });
  }));

  app.get("/api/tags", createRouteHandler(async (_request, response) => {
    response.json(await runtime.service.listTags());
  }));

  app.get("/api/notification-emails", createRouteHandler(async (_request, response) => {
    response.json(await runtime.service.listNotificationEmails());
  }));

  app.get("/api/mail-status", (_request, response) => {
    response.json(getMailStatus(runtime.config));
  });

  app.get("/api/emojis", createRouteHandler(async (request, response) => {
    response.json({
      emojis: await runtime.emojiHubClient.search({
        limit: request.query.limit,
        query: request.query.q,
      }),
    });
  }));

  app.get("/api/daisu", createRouteHandler(async (_request, response) => {
    response.json(
      await runtime.service.getDaiSuState({
        lessonLimit: _request.query.lessonLimit,
      }),
    );
  }));

  app.put("/api/daisu/settings", createRouteHandler(async (request, response) => {
    const result = await runtime.service.updateDaiSuSettings(request.body || {});
    await runtime.handleCommittedEvents(result.domainEvents);
    response.json({
      assistant: result.assistant,
    });
  }));

  app.get("/api/daisu/answer-logs", createRouteHandler(async (request, response) => {
    response.json(
      await runtime.service.listDaiSuAnswerLogs({
        limit: request.query.limit,
        mode: request.query.mode,
      }),
    );
  }));

  app.delete("/api/daisu/answer-logs", createRouteHandler(async (_request, response) => {
    const result = await runtime.service.clearDaiSuAnswerLogs();
    await runtime.handleCommittedEvents(result.domainEvents);
    response.json({
      answerLogs: result.answerLogs,
    });
  }));

  app.post("/api/daisu/documents", createRouteHandler(async (request, response) => {
    const result = await runtime.service.createDaiSuDocument(request.body || {});
    await runtime.handleCommittedEvents(result.domainEvents);
    response.status(201).json({
      document: result.document,
      documents: result.documents,
    });
  }));

  app.patch("/api/daisu/documents/:id", createRouteHandler(async (request, response) => {
    const result = await runtime.service.updateDaiSuDocument(request.params.id, request.body || {});
    await runtime.handleCommittedEvents(result.domainEvents);
    response.json({
      document: result.document,
      documents: result.documents,
    });
  }));

  app.delete("/api/daisu/documents/:id", createRouteHandler(async (request, response) => {
    const result = await runtime.service.deleteDaiSuDocument(request.params.id);
    await runtime.handleCommittedEvents(result.domainEvents);
    response.json({
      documents: result.documents,
    });
  }));

  app.delete("/api/daisu/lessons/:id", createRouteHandler(async (request, response) => {
    const result = await runtime.service.deleteDaiSuLesson(request.params.id);
    await runtime.handleCommittedEvents(result.domainEvents);
    response.json({
      lessons: result.lessons,
    });
  }));

  app.post("/api/daisu/preview", createRouteHandler(async (request, response) => {
    response.json(
      await runtime.service.previewDaiSuReply({
        text: request.body?.text,
        threadId: request.body?.threadId,
      }),
    );
  }));

  app.post("/api/notification-emails", createRouteHandler(async (request, response) => {
    response.status(201).json(await runtime.service.createNotificationEmail(request.body || {}));
  }));

  app.delete("/api/notification-emails/:id", createRouteHandler(async (request, response) => {
    response.json(await runtime.service.deleteNotificationEmail(request.params.id));
  }));

  app.post("/api/tags", createRouteHandler(async (request, response) => {
    response.status(201).json(await runtime.service.createTag(request.body || {}));
  }));

  app.delete("/api/tags/:id", createRouteHandler(async (request, response) => {
    response.json(await runtime.service.deleteTag(request.params.id));
  }));

  app.post("/api/students/session", createRouteHandler(async (request, response) => {
    response.json(await runtime.service.createStudentSession(request.body || {}));
  }));

  app.post("/api/students/signup", createRouteHandler(async (request, response) => {
    response.status(201).json(await runtime.service.signupStudent(request.body || {}));
  }));

  app.patch("/api/students/email", createRouteHandler(async (request, response) => {
    response.json(await runtime.service.updateStudentEmail(request.body || {}));
  }));

  app.get("/api/students", createRouteHandler(async (_request, response) => {
    response.json(await runtime.service.listStudents());
  }));

  app.post("/api/students/profile-change", createRouteHandler(async (request, response) => {
    response.status(201).json(await runtime.service.requestProfileChange(request.body || {}));
  }));

  app.get("/api/profile-requests", createRouteHandler(async (_request, response) => {
    response.json(await runtime.service.listProfileRequests());
  }));

  app.patch("/api/profile-requests/:id", createRouteHandler(async (request, response) => {
    const result = await runtime.service.reviewProfileRequest(
      request.params.id,
      request.body?.status,
    );
    await runtime.handleCommittedEvents(result.domainEvents);
    response.json({
      requests: result.requests,
      students: result.students,
      threads: result.threads,
    });
  }));

  app.post("/api/threads", createRouteHandler(async (request, response) => {
    const result = await runtime.service.createThread(request.body || {});
    await runtime.handleCommittedEvents(result.domainEvents);
    response.status(201).json({
      thread: result.thread,
      threads: result.threads,
    });
  }));

  app.post("/api/admin/student-chat", createRouteHandler(async (request, response) => {
    const result = await runtime.service.createAdminStudentChat(request.body || {});
    await runtime.handleCommittedEvents(result.domainEvents);
    response.status(201).json({
      thread: result.thread,
      threads: result.threads,
    });
  }));

  app.post("/api/threads/:id/messages", createRouteHandler(async (request, response) => {
    const result = await runtime.service.addMessage(request.params.id, request.body || {});
    await runtime.handleCommittedEvents(result.domainEvents);
    response.json({
      duplicate: result.duplicate,
      message: result.message,
      thread: result.thread,
      threads: result.threads,
    });
  }));

  app.patch("/api/threads/:id/messages/:messageId", createRouteHandler(async (request, response) => {
    const result = await runtime.service.updateMessage(
      request.params.id,
      request.params.messageId,
      request.body || {},
    );
    await runtime.handleCommittedEvents(result.domainEvents);
    response.json({
      thread: result.thread,
      threads: result.threads,
    });
  }));

  app.post("/api/threads/:id/messages/:messageId/reactions", createRouteHandler(async (request, response) => {
    const result = await runtime.service.reactToMessage(
      request.params.id,
      request.params.messageId,
      request.body || {},
    );
    await runtime.handleCommittedEvents(result.domainEvents);
    response.json({
      thread: result.thread,
      threads: result.threads,
    });
  }));

  app.delete("/api/threads/:id/messages/:messageId", createRouteHandler(async (request, response) => {
    const result = await runtime.service.deleteMessage(
      request.params.id,
      request.params.messageId,
      request.body || {},
    );
    await runtime.handleCommittedEvents(result.domainEvents);
    response.json({
      thread: result.thread,
      threads: result.threads,
    });
  }));

  app.patch("/api/threads/:id/status", createRouteHandler(async (request, response) => {
    const result = await runtime.service.changeThreadStatus(
      request.params.id,
      request.body?.status,
    );
    await runtime.handleCommittedEvents(result.domainEvents);
    response.json({
      thread: result.thread,
      threads: result.threads,
    });
  }));

  app.post("/api/threads/:id/reopen", createRouteHandler(async (request, response) => {
    const result = await runtime.service.reopenThread(request.params.id, request.body || {});
    await runtime.handleCommittedEvents(result.domainEvents);
    response.json({
      thread: result.thread,
      threads: result.threads,
    });
  }));

  app.post("/api/admin/login", (request, response) => {
    if (request.body?.password !== runtime.config.adminPassword) {
      response.status(401).json({ message: "Invalid password" });
      return;
    }

    response.json({ ok: true });
  });

  app.post("/api/admin/token", (request, response) => {
    if (request.body?.token !== runtime.adminToken) {
      response.status(401).json({ message: "Invalid admin token" });
      return;
    }

    response.json({ ok: true });
  });

  app.post("/api/admin/students/ban", createRouteHandler(async (request, response) => {
    response.json(await runtime.service.setStudentBanStatus(request.body || {}));
  }));

  app.use(express.static(runtime.config.staticDir));

  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(runtime.config.staticDir, "index.html"));
  });

  return app;
};
