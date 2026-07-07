import test from "node:test";
import assert from "node:assert/strict";

import { THREAD_STATUSES, normalizeThreadStatus } from "./threadStatus.js";

test("normalizeThreadStatus keeps canonical statuses and maps legacy labels", () => {
  assert.deepEqual(THREAD_STATUSES, ["미완료", "진행중", "완료"]);
  assert.equal(normalizeThreadStatus("미완료"), "미완료");
  assert.equal(normalizeThreadStatus("진행중"), "진행중");
  assert.equal(normalizeThreadStatus("완료"), "완료");
  assert.equal(normalizeThreadStatus("대기중"), "미완료");
  assert.equal(normalizeThreadStatus("답변중"), "진행중");
  assert.equal(normalizeThreadStatus("답변완료"), "완료");
  assert.equal(normalizeThreadStatus("알수없음"), "미완료");
});
