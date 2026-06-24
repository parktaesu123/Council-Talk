import express from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const adminPassword = process.env.ADMIN_PASSWORD || "counciltalk";
const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
const dataFile = path.join(dataDir, "threads.json");
const staticDir = path.join(__dirname, "dist");

app.use(express.json());

const timeLabel = () =>
  new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date());

const readThreads = async () => {
  try {
    const raw = await readFile(dataFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const writeThreads = async (threads) => {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, JSON.stringify(threads, null, 2));
};

app.get("/healthz", (_request, response) => {
  response.type("text/plain").send("ok\n");
});

app.get("/api/threads", async (_request, response) => {
  response.json({ threads: await readThreads() });
});

app.post("/api/threads", async (request, response) => {
  const { studentId, name, title, content } = request.body || {};

  if (!studentId || !name || !title || !content) {
    response.status(400).json({ message: "Missing required inquiry fields" });
    return;
  }

  const now = new Date().toISOString();
  const thread = {
    id: crypto.randomUUID(),
    studentId: String(studentId).trim(),
    name: String(name).trim(),
    title: String(title).trim(),
    status: "대기중",
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: crypto.randomUUID(),
        author: "student",
        authorLabel: String(name).trim(),
        time: timeLabel(),
        text: String(content).trim(),
      },
    ],
  };

  const threads = [thread, ...(await readThreads())];
  await writeThreads(threads);
  response.status(201).json({ thread, threads });
});

app.post("/api/threads/:id/messages", async (request, response) => {
  const { author, authorLabel, text } = request.body || {};

  if (!text || !["student", "admin"].includes(author)) {
    response.status(400).json({ message: "Invalid message" });
    return;
  }

  const threads = await readThreads();
  const thread = threads.find((item) => item.id === request.params.id);

  if (!thread) {
    response.status(404).json({ message: "Thread not found" });
    return;
  }

  thread.status = author === "admin" ? "답변완료" : "대기중";
  thread.updatedAt = new Date().toISOString();
  thread.messages.push({
    id: crypto.randomUUID(),
    author,
    authorLabel: author === "admin" ? String(authorLabel || "학생회").trim() : thread.name,
    time: timeLabel(),
    text: String(text).trim(),
  });

  await writeThreads(threads);
  response.json({ thread, threads });
});

app.post("/api/admin/login", (request, response) => {
  if (request.body?.password !== adminPassword) {
    response.status(401).json({ message: "Invalid password" });
    return;
  }

  response.json({ ok: true });
});

app.use(express.static(staticDir));

app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(staticDir, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Council Talk listening on ${port}`);
});
