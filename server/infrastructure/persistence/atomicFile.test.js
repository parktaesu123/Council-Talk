import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";

import { readJsonFile, writeJsonFileAtomic } from "./atomicFile.js";

test("atomic json helpers write nested files and read fallback values", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "council-talk-atomic-"));
  const filePath = path.join(tempDir, "nested", "state.json");

  assert.deepEqual(await readJsonFile(filePath, { missing: true }), { missing: true });

  await writeJsonFileAtomic(filePath, { ok: true, count: 2 });

  assert.deepEqual(await readJsonFile(filePath, null), { ok: true, count: 2 });
});
