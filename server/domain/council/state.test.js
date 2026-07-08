import test from "node:test";
import assert from "node:assert/strict";

import {
  DAISU_THREAD_TITLE,
  isDaiSuThread,
  normalizeClientMessageId,
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
