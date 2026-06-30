import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";

import { createCouncilService } from "./createCouncilService.js";
import { createAppendOnlyEventStore } from "../../infrastructure/persistence/appendOnlyEventStore.js";
import { createStateStore } from "../../infrastructure/persistence/stateStore.js";
import { applyCouncilEvent } from "../../domain/council/reducer.js";
import { initialCouncilState } from "../../domain/council/state.js";

const createTestService = async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "council-talk-service-"));
  const stateStore = createStateStore({
    eventStore: createAppendOnlyEventStore({
      filePath: path.join(tempDir, "events.jsonl"),
    }),
    evolve: applyCouncilEvent,
    initialState: initialCouncilState,
    snapshotFilePath: path.join(tempDir, "snapshot.json"),
  });

  let id = 0;
  return createCouncilService({
    clock: {
      now: () => "2026-06-27T00:00:00.000Z",
      timeLabel: () => "09:00",
    },
    hashPin: (value) => `hash:${value}`,
    idGenerator: () => `id-${++id}`,
    stateStore,
  });
};

test("student signup and session reuse work through the service", async () => {
  const service = await createTestService();

  const signup = await service.signupStudent({
    studentId: "1234",
    name: "홍길동",
    pin: "1111",
    email: "student@example.com",
  });

  assert.equal(signup.profile.studentId, "1234");

  const session = await service.createStudentSession({
    studentId: "1234",
    name: "홍길동",
    pin: "1111",
  });

  assert.equal(session.profile.email, "student@example.com");
  assert.deepEqual(session.threads, []);
});

test("thread creation and reply message persistence work through events", async () => {
  const service = await createTestService();

  await service.signupStudent({
    studentId: "1234",
    name: "홍길동",
    pin: "1111",
    email: "student@example.com",
  });

  const threadResult = await service.createThread({
    studentId: "1234",
    name: "홍길동",
    pin: "1111",
    title: "문의 제목",
    content: "문의 내용",
  });

  const reply = await service.addMessage(threadResult.thread.id, {
    author: "admin",
    authorLabel: "학생회",
    clientMessageId: "client-msg-01",
    text: "답변 내용",
    replyTo: {
      id: threadResult.thread.messages[0].id,
      authorLabel: "홍길동",
      text: "문의 내용",
    },
  });

  assert.equal(reply.duplicate, false);
  const loadedThread = await service.getThread(threadResult.thread.id);
  assert.equal(loadedThread.thread.messages.length, 2);
  assert.equal(loadedThread.thread.messages[1].replyTo.text, "문의 내용");
});

test("thread summaries and message pagination avoid loading full history", async () => {
  const service = await createTestService();

  await service.signupStudent({
    studentId: "1234",
    name: "홍길동",
    pin: "1111",
    email: "student@example.com",
  });

  const created = await service.createThread({
    studentId: "1234",
    name: "홍길동",
    pin: "1111",
    title: "성능 문의",
    content: "첫 문의",
  });

  for (let index = 0; index < 5; index += 1) {
    await service.addMessage(created.thread.id, {
      author: index % 2 === 0 ? "admin" : "student",
      authorLabel: "학생회",
      clientMessageId: `client-msg-${index + 10}`,
      name: "홍길동",
      pin: "1111",
      studentId: "1234",
      text: `메시지 ${index + 1}`,
    });
  }

  const summaries = await service.listThreadSummaries();
  assert.equal(summaries.threads[0].messageCount, 6);
  assert.equal(summaries.threads[0].latestMessage.text, "메시지 5");
  assert.equal("messages" in summaries.threads[0], false);

  const firstPage = await service.getThreadMessages(created.thread.id, { limit: 3 });
  assert.equal(firstPage.messages.length, 3);
  assert.equal(firstPage.hasMore, true);

  const secondPage = await service.getThreadMessages(created.thread.id, {
    before: firstPage.nextCursor,
    limit: 3,
  });
  assert.equal(secondPage.messages.length, 3);
  assert.equal(secondPage.hasMore, false);
});

test("message reactions toggle and persist on the target message", async () => {
  const service = await createTestService();

  await service.signupStudent({
    studentId: "1234",
    name: "홍길동",
    pin: "1111",
    email: "student@example.com",
  });

  const created = await service.createThread({
    studentId: "1234",
    name: "홍길동",
    pin: "1111",
    title: "이모지 문의",
    content: "반응 테스트",
  });

  const targetMessage = created.thread.messages[0];

  await service.reactToMessage(created.thread.id, targetMessage.id, {
    author: "admin",
    authorLabel: "학생회",
    emoji: "😀",
  });

  let loaded = await service.getThread(created.thread.id);
  assert.equal(loaded.thread.messages[0].reactions[0].emoji, "😀");
  assert.equal(loaded.thread.messages[0].reactions[0].count, 1);

  await service.reactToMessage(created.thread.id, targetMessage.id, {
    author: "admin",
    authorLabel: "학생회",
    emoji: "😀",
  });

  loaded = await service.getThread(created.thread.id);
  assert.deepEqual(loaded.thread.messages[0].reactions, []);
});

test("daisu settings and documents can be managed by the service", async () => {
  const service = await createTestService();

  const settings = await service.updateDaiSuSettings({
    autoReplyEnabled: true,
    confidenceThreshold: 9,
    fallbackMessage: "학생회가 이어서 확인할게요.",
    guardrails: ["근거 없는 확답 금지"],
  });

  assert.equal(settings.assistant.autoReplyEnabled, true);
  assert.equal(settings.assistant.confidenceThreshold, 9);

  const created = await service.createDaiSuDocument({
    title: "수강 정정 안내",
    category: "학사",
    tags: ["학사", "수강정정"],
    keywords: ["정정", "수강"],
    content: "수강 정정은 개강 첫 주 금요일까지 가능합니다.",
    status: "published",
  });

  assert.equal(created.document.status, "published");

  const updated = await service.updateDaiSuDocument(created.document.id, {
    content: "수강 정정은 개강 첫 주 금요일 18시까지 가능합니다.",
    status: "published",
  });

  assert.match(updated.document.content, /18시/);

  const daisuState = await service.getDaiSuState();
  assert.equal(daisuState.documents.length, 1);
  assert.equal(daisuState.assistant.autoReplyEnabled, true);

  await service.deleteDaiSuDocument(created.document.id);
  const deletedState = await service.getDaiSuState();
  assert.equal(deletedState.documents.length, 0);
});

test("daisu can generate an automatic reply from published knowledge", async () => {
  const service = await createTestService();

  await service.signupStudent({
    studentId: "1234",
    name: "홍길동",
    pin: "1111",
    email: "student@example.com",
  });

  await service.updateDaiSuSettings({
    autoReplyEnabled: true,
    confidenceThreshold: 4,
  });

  await service.createDaiSuDocument({
    title: "수강 정정 안내",
    category: "학사",
    tags: ["학사"],
    keywords: ["수강", "정정"],
    content: "수강 정정은 개강 첫 주 금요일 18시까지 가능합니다.\n학생회 공지 링크를 통해 신청합니다.",
    status: "published",
  });

  const created = await service.createThread({
    studentId: "1234",
    name: "홍길동",
    pin: "1111",
    title: "수강 문의",
    content: "수강 정정은 언제까지 가능한가요?",
  });

  const studentMessage = created.thread.messages[0];
  const reply = await service.generateDaiSuReplyForThread(created.thread.id, studentMessage.id);

  assert.equal(reply.skipped, "");
  assert.equal(reply.assistantMessage.author, "admin");
  assert.equal(reply.assistantMessage.authorLabel, "따이수");
  assert.match(reply.assistantMessage.text, /수강 정정/);
  assert.equal(reply.log.matchedDocumentIds.length, 1);
});
