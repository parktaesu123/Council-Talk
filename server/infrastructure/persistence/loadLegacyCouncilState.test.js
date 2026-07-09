import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";

import { loadLegacyCouncilState } from "./loadLegacyCouncilState.js";

test("loadLegacyCouncilState merges valid legacy files and ignores invalid shapes", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "council-talk-legacy-state-"));
  await writeFile(path.join(tempDir, "threads.json"), JSON.stringify([{ id: "thread-1" }]));
  await writeFile(path.join(tempDir, "students.json"), JSON.stringify({ student: { name: "홍길동" } }));
  await writeFile(path.join(tempDir, "tags.json"), JSON.stringify("invalid-tags"));
  await writeFile(path.join(tempDir, "profile-requests.json"), JSON.stringify(null));
  await writeFile(path.join(tempDir, "notification-emails.json"), JSON.stringify([{ email: "a@example.com" }]));

  const state = await loadLegacyCouncilState(tempDir);

  assert.equal(state.threads.length, 1);
  assert.equal(state.students.student.name, "홍길동");
  assert.deepEqual(state.tags, []);
  assert.deepEqual(state.profileRequests, []);
  assert.deepEqual(state.notificationEmails, [{ email: "a@example.com" }]);
});
