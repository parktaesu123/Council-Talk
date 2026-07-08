import test from "node:test";
import assert from "node:assert/strict";

import { createClock } from "./clock.js";

test("createClock formats now and Seoul time labels from injected time", () => {
  const clock = createClock({
    nowProvider: () => new Date("2026-07-08T00:30:00.000Z"),
  });

  assert.equal(clock.now(), "2026-07-08T00:30:00.000Z");
  assert.match(clock.timeLabel(), /09:30|오전 09:30/);
});
