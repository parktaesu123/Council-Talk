import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";

import { appendLinesWithFsync, readJsonFile, writeJsonFileAtomic } from "./atomicFile.js";

test("atomic json helpers write nested files and read fallback values", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "council-talk-atomic-"));
  const filePath = path.join(tempDir, "nested", "state.json");

  assert.deepEqual(await readJsonFile(filePath, { missing: true }), { missing: true });

  await writeJsonFileAtomic(filePath, { ok: true, count: 2 });

  assert.deepEqual(await readJsonFile(filePath, null), { ok: true, count: 2 });
});

test("appendLinesWithFsync creates parent directories and appends lines", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "council-talk-append-"));
  const filePath = path.join(tempDir, "events", "events.jsonl");

  await appendLinesWithFsync(filePath, ["one\n"]);
  await appendLinesWithFsync(filePath, ["two\n", "three\n"]);

  assert.equal(await readFile(filePath, "utf8"), "one\ntwo\nthree\n");
});
