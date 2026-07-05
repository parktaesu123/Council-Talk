import test from "node:test";
import assert from "node:assert/strict";

import { DAISU_THREAD_TITLE, isDaiSuThread } from "./state.js";

test("isDaiSuThread recognizes the reserved daisu thread title", () => {
  assert.equal(DAISU_THREAD_TITLE, "따이수와 대화");
  assert.equal(isDaiSuThread({ title: "따이수와 대화" }), true);
  assert.equal(isDaiSuThread({ title: " 따이수와 대화 " }), true);
  assert.equal(isDaiSuThread({ title: "일반 문의" }), false);
  assert.equal(isDaiSuThread(null), false);
});
