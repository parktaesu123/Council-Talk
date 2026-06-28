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
