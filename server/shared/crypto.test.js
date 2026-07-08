import test from "node:test";
import assert from "node:assert/strict";

import { hashPin } from "./crypto.js";

test("hashPin returns a deterministic sha256 hex digest", () => {
  const first = hashPin("1234");
  const second = hashPin(1234);

  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.match(first, /^[a-f0-9]{64}$/);
});
