import test from "node:test";
import assert from "node:assert/strict";

import {
  DAISU_THREAD_TITLE,
  isDaiSuThread,
  normalizeClientMessageId,
  normalizeDaiSuAnswerLog,
  normalizeReplyTarget,
} from "./state.js";

test("isDaiSuThread recognizes the reserved daisu thread title", () => {
  assert.equal(DAISU_THREAD_TITLE, "따이수와 대화");
  assert.equal(isDaiSuThread({ title: "따이수와 대화" }), true);
  assert.equal(isDaiSuThread({ title: " 따이수와 대화 " }), true);
  assert.equal(isDaiSuThread({ title: "일반 문의" }), false);
  assert.equal(isDaiSuThread(null), false);
});

test("message identity helpers accept only usable values", () => {
  assert.equal(normalizeClientMessageId("client-message-1234"), "client-message-1234");
  assert.equal(normalizeClientMessageId("short"), "");
  assert.deepEqual(
    normalizeReplyTarget({
      id: "message-1",
      authorLabel: "학생회",
      text: "확인했습니다.",
    }),
    {
      id: "message-1",
      authorLabel: "학생회",
      text: "확인했습니다.",
    },
  );
  assert.equal(normalizeReplyTarget({ id: "message-1", authorLabel: "", text: "내용" }), null);
});

test("normalizeDaiSuAnswerLog trims provider diagnostics and document ids", () => {
  const log = normalizeDaiSuAnswerLog({
    id: "log-1",
    matchedDocumentIds: ["doc-1", "", "doc-2", "doc-3", "doc-4", "doc-5", "doc-6", "doc-7", "doc-8", "doc-9", "doc-10", "doc-11"],
    mode: "generative",
    providerSkippedReason: "provider-error-with-extra-details-that-should-not-fill-the-log-card",
    score: "12",
  });

  assert.equal(log.id, "log-1");
  assert.equal(log.score, 12);
  assert.equal(log.mode, "generative");
  assert.equal(log.matchedDocumentIds.length, 10);
  assert.equal(log.providerSkippedReason.length, 40);
});
