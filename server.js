import express from "express";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const adminPassword = process.env.ADMIN_PASSWORD || "counciltalk";
const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
const dataFile = path.join(dataDir, "threads.json");
const studentsFile = path.join(dataDir, "students.json");
const staticDir = path.join(__dirname, "dist");
let operationQueue = Promise.resolve();

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

const readStudents = async () => {
  try {
    const raw = await readFile(studentsFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const writeStudents = async (students) => {
  await mkdir(dataDir, { recursive: true });
  await writeFile(studentsFile, JSON.stringify(students, null, 2));
};

const normalizeStudent = ({ studentId, name }) => ({
  studentId: String(studentId || "").trim(),
  name: String(name || "").trim(),
});

const studentKey = ({ studentId, name }) => `${studentId}:${name}`;
const hashPin = (pin) => createHash("sha256").update(String(pin)).digest("hex");

const normalizeStatus = (status) => {
  if (status === "답변완료") return "완료";
  if (status === "답변중") return "진행중";
  if (status === "대기중") return "미완료";
  return ["미완료", "진행중", "완료"].includes(status) ? status : "미완료";
};

const enqueueThreadUpdate = async (operation) => {
  const result = operationQueue.then(async () => {
    const threads = await readThreads();
    const value = await operation(threads);
    await writeThreads(threads);
    return value;
  });

  operationQueue = result.catch(() => {});
  return result;
};

const ensureStudentSession = async ({ studentId, name, pin }) => {
  const profile = normalizeStudent({ studentId, name });
  const cleanPin = String(pin || "").trim();

  if (!/^\d{4}$/.test(profile.studentId) || !profile.name || !/^\d{4}$/.test(cleanPin)) {
    return null;
  }

  const students = await readStudents();
  const key = studentKey(profile);
  const saved = students[key];

  if (saved && saved.pinHash !== hashPin(cleanPin)) {
    return null;
  }

  if (!saved) {
    students[key] = {
      ...profile,
      pinHash: hashPin(cleanPin),
      createdAt: new Date().toISOString(),
    };
    await writeStudents(students);
  }

  return profile;
};

app.get("/healthz", (_request, response) => {
  response.type("text/plain").send("ok\n");
});

app.get("/api/threads", async (_request, response) => {
  const threads = await readThreads();
  response.json({
    threads: threads.map((thread) => ({
      ...thread,
      status: normalizeStatus(thread.status),
    })),
  });
});

app.post("/api/students/session", async (request, response) => {
  const profile = await ensureStudentSession(request.body || {});

  if (!profile) {
    response.status(401).json({ message: "Invalid student credentials" });
    return;
  }

  const threads = (await readThreads())
    .filter((thread) => thread.studentId === profile.studentId && thread.name === profile.name)
    .map((thread) => ({
      ...thread,
      status: normalizeStatus(thread.status),
    }));

  response.json({ profile, threads });
});

app.post("/api/threads", async (request, response) => {
  const { studentId, name, title, content } = request.body || {};
  const profile = await ensureStudentSession(request.body || {});

  if (!profile || !title || !content) {
    response.status(400).json({ message: "Missing required inquiry fields" });
    return;
  }

  const now = new Date().toISOString();
  const thread = {
    id: crypto.randomUUID(),
    studentId: profile.studentId,
    name: profile.name,
    title: String(title).trim(),
    status: "미완료",
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: crypto.randomUUID(),
        author: "student",
        authorLabel: profile.name,
        time: timeLabel(),
        text: String(content).trim(),
      },
    ],
  };

  const threads = await enqueueThreadUpdate(async (currentThreads) => {
    currentThreads.unshift(thread);
    return currentThreads.filter(
      (item) => item.studentId === profile.studentId && item.name === profile.name,
    );
  });
  response.status(201).json({ thread, threads });
});

app.post("/api/threads/:id/messages", async (request, response) => {
  const { author, authorLabel, text } = request.body || {};

  if (!text || !["student", "admin"].includes(author)) {
    response.status(400).json({ message: "Invalid message" });
    return;
  }

  const profile =
    author === "student" ? await ensureStudentSession(request.body || {}) : null;

  const result = await enqueueThreadUpdate(async (threads) => {
    const thread = threads.find((item) => item.id === request.params.id);

    if (!thread) {
      return null;
    }

    if (
      author === "student" &&
      (!profile || thread.studentId !== profile.studentId || thread.name !== profile.name)
    ) {
      return "unauthorized";
    }

    thread.status = author === "admin" ? "진행중" : "미완료";
    thread.updatedAt = new Date().toISOString();
    thread.messages.push({
      id: crypto.randomUUID(),
      author,
      authorLabel: author === "admin" ? String(authorLabel || "학생회").trim() : thread.name,
      time: timeLabel(),
      text: String(text).trim(),
    });

    return {
      thread,
      threads:
        author === "student"
          ? threads.filter(
              (item) => item.studentId === profile.studentId && item.name === profile.name,
            )
          : threads,
    };
  });

  if (result === "unauthorized") {
    response.status(401).json({ message: "Invalid student credentials" });
    return;
  }

  if (!result) {
    response.status(404).json({ message: "Thread not found" });
    return;
  }

  const { thread, threads } = result;
  response.json({ thread, threads });
});

app.patch("/api/threads/:id/status", async (request, response) => {
  const status = normalizeStatus(request.body?.status);
  const result = await enqueueThreadUpdate(async (threads) => {
    const thread = threads.find((item) => item.id === request.params.id);

    if (!thread) {
      return null;
    }

    thread.status = status;
    thread.updatedAt = new Date().toISOString();
    return { thread, threads };
  });

  if (!result) {
    response.status(404).json({ message: "Thread not found" });
    return;
  }

  const { thread, threads } = result;
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
