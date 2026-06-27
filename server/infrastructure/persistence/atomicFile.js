import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const ensureDir = async (filePath) => {
  await mkdir(path.dirname(filePath), { recursive: true });
};

export const readJsonFile = async (filePath, fallbackValue) => {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
};

export const writeJsonFileAtomic = async (filePath, value) => {
  await ensureDir(filePath);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;

  await writeFile(tempPath, payload, "utf8");
  await rename(tempPath, filePath);
};

export const appendLinesWithFsync = async (filePath, lines) => {
  await ensureDir(filePath);
  const handle = await open(filePath, "a");

  try {
    await handle.writeFile(lines.join(""));
    await handle.sync();
  } finally {
    await handle.close();
  }
};
