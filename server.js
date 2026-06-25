import express from "express";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import nodemailer from "nodemailer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const adminPassword = process.env.ADMIN_PASSWORD || "counciltalk";
const adminToken =
  process.env.ADMIN_TOKEN ||
  createHash("sha256").update(`council-talk:${adminPassword}`).digest("hex").slice(0, 32);
const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
const dataFile = path.join(dataDir, "threads.json");
const studentsFile = path.join(dataDir, "students.json");
const tagsFile = path.join(dataDir, "tags.json");
const profileRequestsFile = path.join(dataDir, "profile-requests.json");
const notificationEmailsFile = path.join(dataDir, "notification-emails.json");
const staticDir = path.join(__dirname, "dist");
let operationQueue = Promise.resolve();
let tagOperationQueue = Promise.resolve();
let studentOperationQueue = Promise.resolve();
let profileRequestOperationQueue = Promise.resolve();
let notificationEmailOperationQueue = Promise.resolve();

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

const readProfileRequests = async () => {
  try {
    const raw = await readFile(profileRequestsFile, "utf8");
    const requests = JSON.parse(raw);
    return Array.isArray(requests) ? requests : [];
  } catch {
    return [];
  }
};

const writeProfileRequests = async (requests) => {
  await mkdir(dataDir, { recursive: true });
  await writeFile(profileRequestsFile, JSON.stringify(requests, null, 2));
};

const readNotificationEmails = async () => {
  try {
    const raw = await readFile(notificationEmailsFile, "utf8");
    const emails = JSON.parse(raw);
    return Array.isArray(emails) ? emails : [];
  } catch {
    return [];
  }
};

const writeNotificationEmails = async (emails) => {
  await mkdir(dataDir, { recursive: true });
  await writeFile(notificationEmailsFile, JSON.stringify(emails, null, 2));
};

const readTags = async () => {
  try {
    const raw = await readFile(tagsFile, "utf8");
    const tags = JSON.parse(raw);
    return Array.isArray(tags) ? tags : [];
  } catch {
    return [];
  }
};

const writeTags = async (tags) => {
  await mkdir(dataDir, { recursive: true });
  await writeFile(tagsFile, JSON.stringify(tags, null, 2));
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

const enqueueTagUpdate = async (operation) => {
  const result = tagOperationQueue.then(async () => {
    const tags = await readTags();
    const value = await operation(tags);
    await writeTags(tags);
    return value;
  });

  tagOperationQueue = result.catch(() => {});
  return result;
};

const enqueueStudentUpdate = async (operation) => {
  const result = studentOperationQueue.then(async () => {
    const students = await readStudents();
    const value = await operation(students);
    await writeStudents(students);
    return value;
  });

  studentOperationQueue = result.catch(() => {});
  return result;
};

const enqueueProfileRequestUpdate = async (operation) => {
  const result = profileRequestOperationQueue.then(async () => {
    const requests = await readProfileRequests();
    const value = await operation(requests);
    await writeProfileRequests(requests);
    return value;
  });

  profileRequestOperationQueue = result.catch(() => {});
  return result;
};

const enqueueNotificationEmailUpdate = async (operation) => {
  const result = notificationEmailOperationQueue.then(async () => {
    const emails = await readNotificationEmails();
    const value = await operation(emails);
    await writeNotificationEmails(emails);
    return value;
  });

  notificationEmailOperationQueue = result.catch(() => {});
  return result;
};

const normalizeTagName = (name) => String(name || "").trim().slice(0, 24);
const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const getBaseUrl = (request) =>
  String(process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.get("host")}`).replace(/\/$/, "");

const getAdminThreadUrl = (thread, request) =>
  `${getBaseUrl(request)}/admin?token=${encodeURIComponent(adminToken)}&thread=${encodeURIComponent(thread.id)}`;

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const createTransporter = () => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendThreadCreatedNotification = async (thread, request) => {
  const emails = await readNotificationEmails();
  const recipients = emails.map((item) => item.email).filter(Boolean);

  if (recipients.length === 0) {
    return;
  }

  const transporter = createTransporter();
  const url = getAdminThreadUrl(thread, request);

  if (!transporter) {
    console.log(`[mail skipped] ${thread.title} -> ${recipients.join(", ")} ${url}`);
    return;
  }

  try {
    const safeTitle = escapeHtml(thread.title);
    const safeName = escapeHtml(thread.name);
    const safeStudentId = escapeHtml(thread.studentId);
    const safeStatus = escapeHtml(normalizeStatus(thread.status));
    const safeUrl = escapeHtml(url);

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipients,
      subject: `[Council Talk] 새 채팅방: ${thread.title}`,
      text: [
        "새 채팅방이 개설되었습니다.",
        "",
        `제목: ${thread.title}`,
        `학생: ${thread.name} (${thread.studentId})`,
        `상태: ${normalizeStatus(thread.status)}`,
        "",
        `바로 확인: ${url}`,
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#202123">
          <h2>새 채팅방이 개설되었습니다.</h2>
          <p><strong>제목</strong>: ${safeTitle}</p>
          <p><strong>학생</strong>: ${safeName} (${safeStudentId})</p>
          <p><strong>상태</strong>: ${safeStatus}</p>
          <p><a href="${safeUrl}" style="display:inline-block;padding:10px 14px;background:#171717;color:#fff;text-decoration:none;border-radius:7px">어드민에서 바로 확인</a></p>
        </div>
      `,
    });
  } catch (error) {
    console.error("[mail failed]", error.message);
  }
};

const publicStudent = (student) => ({
  studentId: student.studentId,
  name: student.name,
  createdAt: student.createdAt,
  updatedAt: student.updatedAt,
});

const listPublicStudents = async () =>
  Object.values(await readStudents())
    .map(publicStudent)
    .sort((a, b) => `${a.studentId}${a.name}`.localeCompare(`${b.studentId}${b.name}`, "ko-KR"));

const resolveStudentByNameAndPin = async ({ name, pin }) => {
  const cleanName = String(name || "").trim();
  const cleanPin = String(pin || "").trim();

  if (!cleanName || !/^\d{4}$/.test(cleanPin)) {
    return null;
  }

  const students = await readStudents();
  const saved = Object.values(students).find(
    (student) => student.name === cleanName && student.pinHash === hashPin(cleanPin),
  );

  return saved ? normalizeStudent(saved) : null;
};

const ensureStudentSession = async ({ studentId, name, pin }, { createIfMissing = false } = {}) => {
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

  if (!saved && !createIfMissing) {
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

const studentExists = async ({ studentId, name }) => {
  const profile = normalizeStudent({ studentId, name });
  const students = await readStudents();
  return Boolean(students[studentKey(profile)]);
};

const getVisibleThreads = (threads, profile) =>
  threads.filter((item) => item.studentId === profile.studentId && item.name === profile.name);

const canUseThreadAsStudent = (thread, profile) =>
  profile && thread.studentId === profile.studentId && thread.name === profile.name;

const canManageMessage = (message, author) =>
  (author === "admin" && message.author === "admin") ||
  (author === "student" && message.author === "student");

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

app.get("/api/tags", async (_request, response) => {
  response.json({ tags: await readTags() });
});

app.get("/api/notification-emails", async (_request, response) => {
  response.json({ emails: await readNotificationEmails() });
});

app.post("/api/notification-emails", async (request, response) => {
  const email = normalizeEmail(request.body?.email);

  if (!isValidEmail(email)) {
    response.status(400).json({ message: "Invalid email" });
    return;
  }

  const emails = await enqueueNotificationEmailUpdate(async (currentEmails) => {
    const exists = currentEmails.some((item) => item.email === email);

    if (!exists) {
      currentEmails.push({
        id: crypto.randomUUID(),
        email,
        createdAt: new Date().toISOString(),
      });
    }

    return currentEmails;
  });

  response.status(201).json({ emails });
});

app.delete("/api/notification-emails/:id", async (request, response) => {
  const emails = await enqueueNotificationEmailUpdate(async (currentEmails) => {
    const index = currentEmails.findIndex((email) => email.id === request.params.id);

    if (index >= 0) {
      currentEmails.splice(index, 1);
    }

    return currentEmails;
  });

  response.json({ emails });
});

app.post("/api/tags", async (request, response) => {
  const name = normalizeTagName(request.body?.name);

  if (!name) {
    response.status(400).json({ message: "Missing tag name" });
    return;
  }

  const tags = await enqueueTagUpdate(async (currentTags) => {
    const existing = currentTags.find((tag) => tag.name === name);

    if (existing) {
      return currentTags;
    }

    currentTags.push({
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    });
    return currentTags;
  });

  response.status(201).json({ tags });
});

app.delete("/api/tags/:id", async (request, response) => {
  const tags = await enqueueTagUpdate(async (currentTags) => {
    const index = currentTags.findIndex((tag) => tag.id === request.params.id);

    if (index >= 0) {
      currentTags.splice(index, 1);
    }

    return currentTags;
  });

  response.json({ tags });
});

app.post("/api/students/session", async (request, response) => {
  const profile = request.body?.studentId
    ? await ensureStudentSession(request.body || {})
    : await resolveStudentByNameAndPin(request.body || {});

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

app.post("/api/students/signup", async (request, response) => {
  if (await studentExists(request.body || {})) {
    response.status(409).json({ message: "Student already exists" });
    return;
  }

  const profile = await ensureStudentSession(request.body || {}, { createIfMissing: true });

  if (!profile) {
    response.status(400).json({ message: "Invalid student credentials" });
    return;
  }

  response.status(201).json({ profile, threads: [] });
});

app.get("/api/students", async (_request, response) => {
  response.json({ students: await listPublicStudents() });
});

app.post("/api/students/profile-change", async (request, response) => {
  const profile = await ensureStudentSession(request.body || {});
  const nextProfile = normalizeStudent({
    studentId: request.body?.newStudentId,
    name: request.body?.newName,
  });

  if (!profile || !/^\d{4}$/.test(nextProfile.studentId) || !nextProfile.name) {
    response.status(400).json({ message: "Invalid profile change request" });
    return;
  }

  if (profile.studentId === nextProfile.studentId && profile.name === nextProfile.name) {
    response.status(400).json({ message: "No profile changes requested" });
    return;
  }

  const students = await readStudents();
  const nextKey = studentKey(nextProfile);

  if (students[nextKey]) {
    response.status(409).json({ message: "Requested profile already exists" });
    return;
  }

  const requests = await enqueueProfileRequestUpdate(async (currentRequests) => {
    const duplicate = currentRequests.find(
      (item) =>
        item.status === "대기" &&
        item.studentId === profile.studentId &&
        item.name === profile.name,
    );

    if (duplicate) {
      duplicate.newStudentId = nextProfile.studentId;
      duplicate.newName = nextProfile.name;
      duplicate.updatedAt = new Date().toISOString();
      return currentRequests;
    }

    currentRequests.unshift({
      id: crypto.randomUUID(),
      studentId: profile.studentId,
      name: profile.name,
      newStudentId: nextProfile.studentId,
      newName: nextProfile.name,
      status: "대기",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return currentRequests;
  });

  response.status(201).json({ requests });
});

app.get("/api/profile-requests", async (_request, response) => {
  response.json({ requests: await readProfileRequests() });
});

app.patch("/api/profile-requests/:id", async (request, response) => {
  const nextStatus = request.body?.status;

  if (!["승인", "거절"].includes(nextStatus)) {
    response.status(400).json({ message: "Invalid request status" });
    return;
  }

  const result = await enqueueProfileRequestUpdate(async (requests) => {
    const profileRequest = requests.find((item) => item.id === request.params.id);

    if (!profileRequest) {
      return null;
    }

    if (profileRequest.status !== "대기") {
      return { requests, profileRequest, students: await listPublicStudents() };
    }

    if (nextStatus === "승인") {
      const students = await readStudents();
      const oldKey = studentKey(profileRequest);
      const nextProfile = normalizeStudent({
        studentId: profileRequest.newStudentId,
        name: profileRequest.newName,
      });
      const nextKey = studentKey(nextProfile);
      const savedStudent = students[oldKey];

      if (!savedStudent || (students[nextKey] && nextKey !== oldKey)) {
        return "conflict";
      }

      delete students[oldKey];
      students[nextKey] = {
        ...savedStudent,
        ...nextProfile,
        updatedAt: new Date().toISOString(),
      };
      await writeStudents(students);

      await enqueueThreadUpdate(async (threads) => {
        threads.forEach((thread) => {
          if (thread.studentId === profileRequest.studentId && thread.name === profileRequest.name) {
            thread.studentId = nextProfile.studentId;
            thread.name = nextProfile.name;
            thread.updatedAt = new Date().toISOString();
            thread.messages.forEach((message) => {
              if (message.author === "student") {
                message.authorLabel = nextProfile.name;
              }
            });
          }
        });
        return threads;
      });
    }

    profileRequest.status = nextStatus;
    profileRequest.reviewedAt = new Date().toISOString();
    profileRequest.updatedAt = new Date().toISOString();

    return { requests, profileRequest, students: await listPublicStudents() };
  });

  if (result === "conflict") {
    response.status(409).json({ message: "Profile change cannot be approved" });
    return;
  }

  if (!result) {
    response.status(404).json({ message: "Profile request not found" });
    return;
  }

  const threads = (await readThreads()).map((thread) => ({
    ...thread,
    status: normalizeStatus(thread.status),
  }));

  response.json({ ...result, threads });
});

app.post("/api/threads", async (request, response) => {
  const { title, content, tagId } = request.body || {};
  const profile = await ensureStudentSession(request.body || {});

  if (!profile || !title || !content) {
    response.status(400).json({ message: "Missing required inquiry fields" });
    return;
  }

  const now = new Date().toISOString();
  const tags = await readTags();
  const selectedTag = tags.find((tag) => tag.id === tagId);
  const thread = {
    id: crypto.randomUUID(),
    studentId: profile.studentId,
    name: profile.name,
    title: String(title).trim(),
    tagId: selectedTag?.id || "",
    tagName: selectedTag?.name || "",
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
  await sendThreadCreatedNotification(thread, request);
  response.status(201).json({ thread, threads });
});

app.post("/api/admin/student-chat", async (request, response) => {
  const profile = normalizeStudent(request.body || {});
  const students = await readStudents();

  if (!students[studentKey(profile)]) {
    response.status(404).json({ message: "Student not found" });
    return;
  }

  const now = new Date().toISOString();
  const authorLabel = String(request.body?.authorLabel || "학생회").trim();
  const title = String(request.body?.title || "학생회 1:1 대화").trim();
  const message = String(request.body?.message || "학생회에서 대화를 시작했습니다.").trim();
  const thread = {
    id: crypto.randomUUID(),
    studentId: profile.studentId,
    name: profile.name,
    title,
    tagId: "",
    tagName: "",
    status: "진행중",
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: crypto.randomUUID(),
        author: "admin",
        authorLabel,
        time: timeLabel(),
        text: message,
      },
    ],
  };

  const threads = await enqueueThreadUpdate(async (currentThreads) => {
    currentThreads.unshift(thread);
    return currentThreads;
  });

  await sendThreadCreatedNotification(thread, request);
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

    if (author === "student" && normalizeStatus(thread.status) === "완료") {
      return "completed";
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

  if (result === "completed") {
    response.status(409).json({ message: "Completed thread is closed" });
    return;
  }

  if (!result) {
    response.status(404).json({ message: "Thread not found" });
    return;
  }

  const { thread, threads } = result;
  response.json({ thread, threads });
});

app.patch("/api/threads/:id/messages/:messageId", async (request, response) => {
  const { author, text } = request.body || {};

  if (!text || !["student", "admin"].includes(author)) {
    response.status(400).json({ message: "Invalid message update" });
    return;
  }

  const profile = author === "student" ? await ensureStudentSession(request.body || {}) : null;

  const result = await enqueueThreadUpdate(async (threads) => {
    const thread = threads.find((item) => item.id === request.params.id);

    if (!thread) return null;
    if (author === "student" && !canUseThreadAsStudent(thread, profile)) return "unauthorized";

    const message = thread.messages.find((item) => item.id === request.params.messageId);
    if (!message) return null;
    if (!canManageMessage(message, author)) return "unauthorized";

    message.text = String(text).trim();
    message.editedAt = new Date().toISOString();
    thread.updatedAt = new Date().toISOString();

    return {
      thread,
      threads: author === "student" ? getVisibleThreads(threads, profile) : threads,
    };
  });

  if (result === "unauthorized") {
    response.status(401).json({ message: "Unauthorized message update" });
    return;
  }

  if (!result) {
    response.status(404).json({ message: "Message not found" });
    return;
  }

  response.json(result);
});

app.delete("/api/threads/:id/messages/:messageId", async (request, response) => {
  const { author } = request.body || {};

  if (!["student", "admin"].includes(author)) {
    response.status(400).json({ message: "Invalid message delete" });
    return;
  }

  const profile = author === "student" ? await ensureStudentSession(request.body || {}) : null;

  const result = await enqueueThreadUpdate(async (threads) => {
    const thread = threads.find((item) => item.id === request.params.id);

    if (!thread) return null;
    if (author === "student" && !canUseThreadAsStudent(thread, profile)) return "unauthorized";

    const index = thread.messages.findIndex((item) => item.id === request.params.messageId);
    if (index < 0) return null;
    if (!canManageMessage(thread.messages[index], author)) return "unauthorized";

    thread.messages.splice(index, 1);
    thread.updatedAt = new Date().toISOString();

    return {
      thread,
      threads: author === "student" ? getVisibleThreads(threads, profile) : threads,
    };
  });

  if (result === "unauthorized") {
    response.status(401).json({ message: "Unauthorized message delete" });
    return;
  }

  if (!result) {
    response.status(404).json({ message: "Message not found" });
    return;
  }

  response.json(result);
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

app.post("/api/threads/:id/reopen", async (request, response) => {
  const profile = await ensureStudentSession(request.body || {});

  if (!profile) {
    response.status(401).json({ message: "Invalid student credentials" });
    return;
  }

  const result = await enqueueThreadUpdate(async (threads) => {
    const thread = threads.find((item) => item.id === request.params.id);

    if (!thread) {
      return null;
    }

    if (!canUseThreadAsStudent(thread, profile)) {
      return "unauthorized";
    }

    thread.status = "진행중";
    thread.updatedAt = new Date().toISOString();
    return { thread, threads: getVisibleThreads(threads, profile) };
  });

  if (result === "unauthorized") {
    response.status(401).json({ message: "Invalid student credentials" });
    return;
  }

  if (!result) {
    response.status(404).json({ message: "Thread not found" });
    return;
  }

  response.json(result);
});

app.post("/api/admin/login", (request, response) => {
  if (request.body?.password !== adminPassword) {
    response.status(401).json({ message: "Invalid password" });
    return;
  }

  response.json({ ok: true });
});

app.post("/api/admin/token", (request, response) => {
  if (request.body?.token !== adminToken) {
    response.status(401).json({ message: "Invalid admin token" });
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
