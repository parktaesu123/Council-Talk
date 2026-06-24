import {
  ArrowLeft,
  ArrowUp,
  LockKeyhole,
  MessageCircle,
  Plus,
  Send,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "council-talk-threads";
const STATUS_LABELS = ["미완료", "진행중", "완료"];
const FILTERS = [
  { label: "전체", value: "all" },
  { label: "미완료", value: "미완료" },
  { label: "진행중", value: "진행중" },
  { label: "완료", value: "완료" },
];
const EMOJIS = ["👍", "❤️", "😂", "😮", "🙏"];

const emptyForm = {
  studentId: "",
  name: "",
  title: "",
  content: "",
  tagId: "",
};

const emptyIdentity = {
  studentId: "",
  name: "",
  pin: "",
};

const getTimeLabel = () =>
  new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

const loadThreads = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

const apiRequest = async (path, options) => {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
};

const normalizeStatus = (status) => {
  if (status === "답변완료") return "완료";
  if (status === "답변중") return "진행중";
  if (status === "대기중") return "미완료";
  return STATUS_LABELS.includes(status) ? status : "미완료";
};

const normalizeTags = (tags) => (Array.isArray(tags) ? tags : []);

function App() {
  const [route, setRoute] = useState(() => window.location.pathname);
  const [threads, setThreads] = useState(loadThreads);
  const [tags, setTags] = useState([]);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const [studentProfile, setStudentProfile] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("council-talk-student") || "null") || null;
    } catch {
      return null;
    }
  });
  const [identityForm, setIdentityForm] = useState(emptyIdentity);
  const [identityError, setIdentityError] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [supportView, setSupportView] = useState("rooms");
  const [studentMessage, setStudentMessage] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminAuthed, setAdminAuthed] = useState(
    () => sessionStorage.getItem("council-talk-admin") === "true",
  );
  const [adminName, setAdminName] = useState(
    () => localStorage.getItem("council-talk-admin-name") || "학생회",
  );
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [adminReply, setAdminReply] = useState("");
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [adminFilter, setAdminFilter] = useState("all");
  const [adminTagFilter, setAdminTagFilter] = useState("all");
  const [adminSection, setAdminSection] = useState("inquiries");
  const [tagName, setTagName] = useState("");
  const isAdminRoute = route.startsWith("/admin");

  useEffect(() => {
    const syncRoute = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    apiRequest("/api/tags")
      .then((data) => setTags(normalizeTags(data.tags)))
      .catch(() => setTags([]));
  }, []);

  useEffect(() => {
    if (!studentProfile || isAdminRoute) {
      return;
    }

    apiRequest("/api/students/session", {
      method: "POST",
      body: JSON.stringify(studentProfile),
    })
      .then((data) => setThreads(data.threads.map((thread) => ({ ...thread, status: normalizeStatus(thread.status) }))))
      .catch(() => resetStudentProfile());
  }, [isAdminRoute, studentProfile]);

  useEffect(() => {
    if (!adminAuthed || !isAdminRoute) {
      return;
    }

    apiRequest("/api/threads")
      .then((data) => setThreads(data.threads.map((thread) => ({ ...thread, status: normalizeStatus(thread.status) }))))
      .catch(() => setThreads(loadThreads()));
  }, [adminAuthed, isAdminRoute]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  }, [threads]);

  useEffect(() => {
    localStorage.setItem("council-talk-admin-name", adminName);
  }, [adminName]);

  useEffect(() => {
    if (studentProfile) {
      sessionStorage.setItem("council-talk-student", JSON.stringify(studentProfile));
    }
  }, [studentProfile]);

  useEffect(() => {
    if (!selectedThreadId && threads.length > 0) {
      setSelectedThreadId(threads[0].id);
    }
  }, [selectedThreadId, threads]);

  useEffect(() => {
    const visibleThreads = threads.filter((thread) => {
      const statusMatches = adminFilter === "all" || normalizeStatus(thread.status) === adminFilter;
      const tagMatches =
        adminTagFilter === "all" ||
        (adminTagFilter === "untagged" ? !thread.tagId : thread.tagId === adminTagFilter);

      return statusMatches && tagMatches;
    });
    const selectedIsVisible = visibleThreads.some((thread) => thread.id === selectedThreadId);

    if (!selectedIsVisible) {
      setSelectedThreadId(visibleThreads[0]?.id || null);
    }
  }, [adminFilter, adminTagFilter, selectedThreadId, threads]);

  const currentThread = threads.find((thread) => thread.id === currentThreadId);
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId);
  const studentThreads = studentProfile
    ? threads.filter(
        (thread) =>
          thread.studentId === studentProfile.studentId && thread.name === studentProfile.name,
      )
    : [];
  const filteredAdminThreads =
    threads.filter((thread) => {
      const statusMatches = adminFilter === "all" || normalizeStatus(thread.status) === adminFilter;
      const tagMatches =
        adminTagFilter === "all" ||
        (adminTagFilter === "untagged" ? !thread.tagId : thread.tagId === adminTagFilter);

      return statusMatches && tagMatches;
    });
  const statusCounts = threads.reduce(
    (counts, thread) => {
      counts.all += 1;
      counts[normalizeStatus(thread.status)] += 1;
      return counts;
    },
    { all: 0, 미완료: 0, 진행중: 0, 완료: 0 },
  );
  const tagCounts = threads.reduce(
    (counts, thread) => {
      counts.all += 1;

      if (thread.tagId) {
        counts[thread.tagId] = (counts[thread.tagId] || 0) + 1;
      } else {
        counts.untagged += 1;
      }

      return counts;
    },
    { all: 0, untagged: 0 },
  );
  const goTo = (path) => {
    window.history.pushState({}, "", path);
    setRoute(path);
  };

  const saveThreadsFallback = (updater) => {
    setThreads((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const completeStudentAuth = (profile, data) => {
    const nextProfile = { ...profile, ...data.profile };
    setStudentProfile(nextProfile);
    setThreads(data.threads.map((thread) => ({ ...thread, status: normalizeStatus(thread.status) })));
    apiRequest("/api/tags")
      .then((tagData) => setTags(normalizeTags(tagData.tags)))
      .catch(() => {});
    setForm((current) => ({ ...current, studentId: nextProfile.studentId, name: nextProfile.name }));
    setIdentityError("");
    setSupportView("rooms");
    setIsSupportOpen(true);
  };

  const handleIdentifyStudent = (event) => {
    event.preventDefault();
    const studentId = identityForm.studentId.trim();
    const name = identityForm.name.trim();
    const pin = identityForm.pin.trim();
    const isSignup = authMode === "signup";

    if (!name || !/^\d{4}$/.test(pin) || (isSignup && !/^\d{4}$/.test(studentId))) {
      setIdentityError(isSignup ? "학번, 이름, 4자리 비밀번호를 확인해주세요." : "이름과 4자리 비밀번호를 확인해주세요.");
      return;
    }

    setIdentityError("");
    const profile = isSignup ? { studentId, name, pin } : { name, pin };
    apiRequest(isSignup ? "/api/students/signup" : "/api/students/session", {
      method: "POST",
      body: JSON.stringify(profile),
    })
      .then((data) => completeStudentAuth(profile, data))
      .catch(() => {
        setIdentityError(
          authMode === "signup"
            ? "이미 가입된 정보이거나 입력값을 확인해주세요."
            : "가입 정보가 없거나 비밀번호가 틀렸습니다.",
        );
        setIdentityForm((current) => ({ ...current, pin: "" }));
      });
  };

  const openSupport = () => {
    setIdentityError("");
    setAuthMode("login");
    setSupportView("rooms");
    setIsSupportOpen(true);
  };

  const resetStudentProfile = () => {
    sessionStorage.removeItem("council-talk-student");
    setStudentProfile(null);
    setCurrentThreadId(null);
    setIdentityForm(emptyIdentity);
    setIdentityError("");
    setAuthMode("login");
    setSupportView("rooms");
  };

  const handleCreateThread = async (event) => {
    event.preventDefault();
    const payload = {
      studentId: studentProfile?.studentId || form.studentId.trim(),
      name: studentProfile?.name || form.name.trim(),
      pin: studentProfile?.pin,
      title: form.title.trim(),
      content: form.content.trim(),
      tagId: form.tagId,
    };

    if (
      !/^\d{4}$/.test(payload.studentId) ||
      !payload.name ||
      !/^\d{4}$/.test(payload.pin || "") ||
      !payload.title ||
      !payload.content
    ) {
      return;
    }

    let thread;
    try {
      const data = await apiRequest("/api/threads", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      thread = data.thread;
      setThreads(data.threads.map((item) => ({ ...item, status: normalizeStatus(item.status) })));
    } catch {
      thread = {
        id: crypto.randomUUID(),
        ...payload,
        tagName: tags.find((tag) => tag.id === payload.tagId)?.name || "",
        status: "미완료",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
          {
            id: crypto.randomUUID(),
            author: "student",
            authorLabel: payload.name,
            time: getTimeLabel(),
            text: payload.content,
          },
        ],
      };
      saveThreadsFallback((current) => [thread, ...current]);
    }

    setStudentProfile({ studentId: payload.studentId, name: payload.name, pin: payload.pin });
    setCurrentThreadId(thread.id);
    setSelectedThreadId(thread.id);
    setSupportView("chat");
    setForm(emptyForm);
  };

  const handleStudentSend = async () => {
    if (!currentThread || !studentMessage.trim()) {
      return;
    }

    const text = studentMessage.trim();
    try {
      const data = await apiRequest(`/api/threads/${currentThread.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          author: "student",
          studentId: studentProfile?.studentId,
          name: studentProfile?.name,
          pin: studentProfile?.pin,
          text,
        }),
      });
      setThreads(data.threads.map((thread) => ({ ...thread, status: normalizeStatus(thread.status) })));
    } catch {
      saveThreadsFallback((current) =>
        current.map((thread) =>
          thread.id === currentThread.id
            ? {
                ...thread,
                status: "미완료",
                updatedAt: new Date().toISOString(),
                messages: [
                  ...thread.messages,
                  {
                    id: crypto.randomUUID(),
                    author: "student",
                    authorLabel: thread.name,
                    time: getTimeLabel(),
                    text,
                  },
                ],
              }
            : thread,
        ),
      );
    }
    setStudentMessage("");
  };

  const handleAdminLogin = async (event) => {
    event.preventDefault();
    setAdminError("");
    try {
      await apiRequest("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: adminPassword }),
      });
      sessionStorage.setItem("council-talk-admin", "true");
      setAdminAuthed(true);
      setAdminPassword("");
      const data = await apiRequest("/api/threads");
      setThreads(data.threads.map((thread) => ({ ...thread, status: normalizeStatus(thread.status) })));
      const tagData = await apiRequest("/api/tags");
      setTags(normalizeTags(tagData.tags));
    } catch {
      setAdminError("비밀번호가 틀렸습니다.");
      setAdminPassword("");
    }
  };

  const handleAdminReply = async () => {
    if (!selectedThread || !adminReply.trim()) {
      return;
    }

    const text = adminReply.trim();
    const authorLabel = adminName.trim() || "학생회";

    try {
      const data = await apiRequest(`/api/threads/${selectedThread.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ author: "admin", authorLabel, text }),
      });
      setThreads(data.threads.map((thread) => ({ ...thread, status: normalizeStatus(thread.status) })));
    } catch {
      saveThreadsFallback((current) =>
        current.map((thread) =>
          thread.id === selectedThread.id
            ? {
                ...thread,
                status: "진행중",
                updatedAt: new Date().toISOString(),
                messages: [
                  ...thread.messages,
                  {
                    id: crypto.randomUUID(),
                    author: "admin",
                    authorLabel,
                    time: getTimeLabel(),
                    text,
                  },
                ],
              }
            : thread,
        ),
      );
    }
    setAdminReply("");
  };

  const handleMessageEditStart = (message) => {
    setEditingMessageId(message.id);
    setEditingText(message.text);
  };

  const handleMessageEditCancel = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const getMessagePayload = (author, extra = {}) =>
    author === "student"
      ? {
          author,
          studentId: studentProfile?.studentId,
          name: studentProfile?.name,
          pin: studentProfile?.pin,
          ...extra,
        }
      : { author, ...extra };

  const handleMessageUpdate = async (thread, message, author) => {
    const text = editingText.trim();

    if (!text) {
      return;
    }

    try {
      const data = await apiRequest(`/api/threads/${thread.id}/messages/${message.id}`, {
        method: "PATCH",
        body: JSON.stringify(getMessagePayload(author, { text })),
      });
      setThreads(data.threads.map((item) => ({ ...item, status: normalizeStatus(item.status) })));
    } catch {
      saveThreadsFallback((current) =>
        current.map((item) =>
          item.id === thread.id
            ? {
                ...item,
                messages: item.messages.map((target) =>
                  target.id === message.id ? { ...target, text, editedAt: new Date().toISOString() } : target,
                ),
              }
            : item,
        ),
      );
    }

    handleMessageEditCancel();
  };

  const handleMessageDelete = async (thread, message, author) => {
    try {
      const data = await apiRequest(`/api/threads/${thread.id}/messages/${message.id}`, {
        method: "DELETE",
        body: JSON.stringify(getMessagePayload(author)),
      });
      setThreads(data.threads.map((item) => ({ ...item, status: normalizeStatus(item.status) })));
    } catch {
      saveThreadsFallback((current) =>
        current.map((item) =>
          item.id === thread.id
            ? { ...item, messages: item.messages.filter((target) => target.id !== message.id) }
            : item,
        ),
      );
    }
  };

  const handleMessageEmoji = async (thread, message, author, emoji) => {
    try {
      const data = await apiRequest(`/api/threads/${thread.id}/messages/${message.id}/emoji`, {
        method: "PATCH",
        body: JSON.stringify(getMessagePayload(author, { emoji })),
      });
      setThreads(data.threads.map((item) => ({ ...item, status: normalizeStatus(item.status) })));
    } catch {
      saveThreadsFallback((current) =>
        current.map((item) =>
          item.id === thread.id
            ? {
                ...item,
                messages: item.messages.map((target) =>
                  target.id === message.id
                    ? { ...target, emoji: target.emoji === emoji ? "" : emoji }
                    : target,
                ),
              }
            : item,
        ),
      );
    }
  };

  const handleCreateTag = async (event) => {
    event.preventDefault();
    const name = tagName.trim();

    if (!name) {
      return;
    }

    try {
      const data = await apiRequest("/api/tags", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setTags(normalizeTags(data.tags));
      setTagName("");
    } catch {
      setTagName("");
    }
  };

  const handleDeleteTag = async (tagId) => {
    try {
      const data = await apiRequest(`/api/tags/${tagId}`, {
        method: "DELETE",
      });
      setTags(normalizeTags(data.tags));
      setForm((current) => (current.tagId === tagId ? { ...current, tagId: "" } : current));
    } catch {
      setTags((current) => current.filter((tag) => tag.id !== tagId));
    }
  };

  const handleAdminStatusChange = async (status) => {
    if (!selectedThread) {
      return;
    }

    try {
      const data = await apiRequest(`/api/threads/${selectedThread.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setThreads(data.threads.map((thread) => ({ ...thread, status: normalizeStatus(thread.status) })));
    } catch {
      saveThreadsFallback((current) =>
        current.map((thread) =>
          thread.id === selectedThread.id
            ? { ...thread, status, updatedAt: new Date().toISOString() }
            : thread,
        ),
      );
    }
  };

  if (isAdminRoute) {
    return (
      <AdminScreen
        adminAuthed={adminAuthed}
        adminError={adminError}
        adminFilter={adminFilter}
        adminName={adminName}
        adminPassword={adminPassword}
        adminReply={adminReply}
        adminSection={adminSection}
        adminTagFilter={adminTagFilter}
        handleCreateTag={handleCreateTag}
        handleAdminLogin={handleAdminLogin}
        handleAdminReply={handleAdminReply}
        handleAdminStatusChange={handleAdminStatusChange}
        handleDeleteTag={handleDeleteTag}
        handleMessageDelete={handleMessageDelete}
        handleMessageEditCancel={handleMessageEditCancel}
        handleMessageEditStart={handleMessageEditStart}
        handleMessageEmoji={handleMessageEmoji}
        handleMessageUpdate={handleMessageUpdate}
        editingMessageId={editingMessageId}
        editingText={editingText}
        selectedThread={selectedThread}
        selectedThreadId={selectedThreadId}
        setAdminFilter={setAdminFilter}
        setAdminName={setAdminName}
        setAdminPassword={setAdminPassword}
        setAdminReply={setAdminReply}
        setAdminSection={setAdminSection}
        setAdminTagFilter={setAdminTagFilter}
        setEditingText={setEditingText}
        setSelectedThreadId={setSelectedThreadId}
        setTagName={setTagName}
        statusCounts={statusCounts}
        tagCounts={tagCounts}
        tagName={tagName}
        tags={tags}
        threads={filteredAdminThreads}
      />
    );
  }

  return (
    <main className="public-page">
      <section className="logo-stage" aria-label="Council Talk">
        <div className="wordmark">
          <span className="wordmark-symbol" aria-hidden="true">C</span>
          <h1>Council Talk</h1>
        </div>
      </section>

      <button className="support-launcher" onClick={openSupport} type="button">
        <MessageCircle size={18} />
        문의하기
      </button>

      {isSupportOpen && !studentProfile && (
        <StudentAuthModal
          authMode={authMode}
          handleIdentifyStudent={handleIdentifyStudent}
          identityError={identityError}
          identityForm={identityForm}
          setAuthMode={setAuthMode}
          setIdentityError={setIdentityError}
          setIdentityForm={setIdentityForm}
          setIsSupportOpen={setIsSupportOpen}
        />
      )}

      {isSupportOpen && studentProfile && (
        <SupportPanel
          currentThread={currentThread}
          editingMessageId={editingMessageId}
          editingText={editingText}
          form={form}
          handleCreateThread={handleCreateThread}
          handleMessageDelete={handleMessageDelete}
          handleMessageEditCancel={handleMessageEditCancel}
          handleMessageEditStart={handleMessageEditStart}
          handleMessageEmoji={handleMessageEmoji}
          handleMessageUpdate={handleMessageUpdate}
          handleStudentSend={handleStudentSend}
          resetStudentProfile={resetStudentProfile}
          setCurrentThreadId={setCurrentThreadId}
          setEditingText={setEditingText}
          setForm={setForm}
          setIsSupportOpen={setIsSupportOpen}
          setSupportView={setSupportView}
          setStudentMessage={setStudentMessage}
          studentProfile={studentProfile}
          studentThreads={studentThreads}
          studentMessage={studentMessage}
          supportView={supportView}
          tags={tags}
        />
      )}
    </main>
  );
}

function StudentAuthModal({
  authMode,
  handleIdentifyStudent,
  identityError,
  identityForm,
  setAuthMode,
  setIdentityError,
  setIdentityForm,
  setIsSupportOpen,
}) {
  const isSignup = authMode === "signup";

  const switchMode = (mode) => {
    setAuthMode(mode);
    setIdentityError("");
    setIdentityForm((current) => ({ ...current, pin: "" }));
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="student-auth-modal" onSubmit={handleIdentifyStudent}>
        <header>
          <div>
            <span className="mini-logo">C</span>
            <h2>{isSignup ? "회원가입" : "로그인"}</h2>
          </div>
          <button
            aria-label="닫기"
            className="icon-button"
            onClick={() => setIsSupportOpen(false)}
            type="button"
          >
            <X size={20} />
          </button>
        </header>

        <p>
          {isSignup
            ? "처음 이용하는 경우 학번과 비밀번호를 등록해주세요."
            : "이름과 비밀번호만 입력하면 문의방으로 이동합니다."}
        </p>

        <label>
          이름
          <input
            autoFocus
            value={identityForm.name}
            onChange={(event) =>
              setIdentityForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="홍길동"
          />
        </label>

        {isSignup && (
          <label className="auth-field-enter">
            학번
            <input
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              value={identityForm.studentId}
              onChange={(event) =>
                setIdentityForm((current) => ({
                  ...current,
                  studentId: event.target.value.replace(/\D/g, "").slice(0, 4),
                }))
              }
              placeholder="3105"
            />
          </label>
        )}

        <label>
          4자리 비밀번호
          <input
            inputMode="numeric"
            maxLength={4}
            pattern="[0-9]{4}"
            type="password"
            value={identityForm.pin}
            onChange={(event) =>
              setIdentityForm((current) => ({
                ...current,
                pin: event.target.value.replace(/\D/g, "").slice(0, 4),
              }))
            }
            placeholder="1234"
          />
        </label>

        {identityError && <p className="form-error">{identityError}</p>}

        <div className="auth-actions">
          <button className="ghost-button" onClick={() => setIsSupportOpen(false)} type="button">
            취소
          </button>
          <button className="black-button" type="submit">
            {isSignup ? "가입 완료" : "로그인"}
          </button>
        </div>

        <button
          className="auth-mode-button"
          onClick={() => switchMode(isSignup ? "login" : "signup")}
          type="button"
        >
          {isSignup ? "이미 계정이 있어요" : "회원가입"}
        </button>
      </form>
    </div>
  );
}

function SupportPanel({
  currentThread,
  editingMessageId,
  editingText,
  form,
  handleCreateThread,
  handleMessageDelete,
  handleMessageEditCancel,
  handleMessageEditStart,
  handleMessageEmoji,
  handleMessageUpdate,
  handleStudentSend,
  resetStudentProfile,
  setCurrentThreadId,
  setEditingText,
  setForm,
  setIsSupportOpen,
  setSupportView,
  setStudentMessage,
  studentProfile,
  studentThreads,
  studentMessage,
  supportView,
  tags,
}) {
  const openNewInquiry = () => {
    setCurrentThreadId(null);
    setSupportView("new");
    setForm((current) => ({
      ...current,
      studentId: studentProfile?.studentId || current.studentId,
      name: studentProfile?.name || current.name,
      title: "",
      content: "",
      tagId: "",
    }));
  };

  return (
    <aside className="support-panel" aria-label="문의하기">
      <header className="support-header">
        {supportView !== "rooms" && (
          <button
            aria-label="문의방 목록으로 돌아가기"
            className="icon-button back-icon-button"
            onClick={() => setSupportView("rooms")}
            type="button"
          >
            <ArrowLeft size={22} />
          </button>
        )}
        <button
          aria-label="닫기"
          className="icon-button"
          onClick={() => setIsSupportOpen(false)}
          type="button"
        >
          <X size={22} />
        </button>
      </header>

      {supportView === "rooms" && (
        <div className="rooms-view">
          <div className="support-title rooms-title">
            <h2>문의방</h2>
            <p>
              {studentProfile?.name} · {studentProfile?.studentId}
            </p>
          </div>

          <div className="student-room-list">
            {studentThreads.length === 0 && (
              <p className="empty-room-copy">아직 만든 문의방이 없습니다.</p>
            )}
            {studentThreads.map((thread) => (
              <button
                className="student-room"
                key={thread.id}
                onClick={() => {
                  setCurrentThreadId(thread.id);
                  setSupportView("chat");
                }}
                type="button"
              >
                <strong>{thread.title}</strong>
                <span>{thread.messages.at(-1)?.text || "문의 내용 없음"}</span>
                <small>{thread.status}</small>
              </button>
            ))}
          </div>

          <button className="new-room-button" onClick={openNewInquiry} type="button">
            <Plus size={18} />
            새 문의하기
          </button>
          <button className="switch-student-button" onClick={resetStudentProfile} type="button">
            로그아웃
          </button>
        </div>
      )}

      {supportView === "new" && (
        <form className="support-form" onSubmit={handleCreateThread}>
          <div className="support-title">
            <h2>문의하기</h2>
            <p>
              {studentProfile?.name} · {studentProfile?.studentId}
            </p>
          </div>

          <label>
            문의 태그
            <select
              value={form.tagId}
              onChange={(event) =>
                setForm((current) => ({ ...current, tagId: event.target.value }))
              }
            >
              <option value="">태그 선택</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            제목
            <input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="무엇이 궁금한가요?"
            />
          </label>

          <label>
            내용
            <textarea
              value={form.content}
              onChange={(event) =>
                setForm((current) => ({ ...current, content: event.target.value }))
              }
              placeholder="문의 내용을 입력해주세요."
              rows={6}
            />
          </label>

          <button className="black-button" type="submit">
            문의 등록
          </button>
        </form>
      )}

      {supportView === "chat" && currentThread && (
        <>
          <div className="conversation-title">
            <button className="back-to-rooms" onClick={() => setSupportView("rooms")} type="button">
              문의방 목록
            </button>
            <strong>{currentThread.title}</strong>
            <span>{currentThread.status}</span>
            {currentThread.tagName && <em>{currentThread.tagName}</em>}
          </div>

          <div className="messages">
            {currentThread.messages.map((message) => (
              <MessageBubble
                actor="student"
                editingMessageId={editingMessageId}
                editingText={editingText}
                key={message.id}
                message={message}
                onCancelEdit={handleMessageEditCancel}
                onChangeEdit={setEditingText}
                onDelete={() => handleMessageDelete(currentThread, message, "student")}
                onEmoji={(emoji) => handleMessageEmoji(currentThread, message, "student", emoji)}
                onSaveEdit={() => handleMessageUpdate(currentThread, message, "student")}
                onStartEdit={() => handleMessageEditStart(message)}
              />
            ))}
          </div>

          <div className="support-compose">
            <button aria-label="첨부" className="plus-button" type="button">
              +
            </button>
            <textarea
              value={studentMessage}
              onChange={(event) => setStudentMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleStudentSend();
                }
              }}
              placeholder="추가 문의를 입력하세요..."
              rows={1}
            />
            <button aria-label="전송" className="round-send" onClick={handleStudentSend} type="button">
              <ArrowUp size={22} />
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

function TagAdminPanel({
  handleCreateTag,
  handleDeleteTag,
  setTagName,
  tagCounts,
  tagName,
  tags,
}) {
  return (
    <div className="tag-admin-page">
      <header>
        <div>
          <p>Tag Manager</p>
          <h2>문의 태그 관리</h2>
        </div>
        <span>{tags.length}개 태그</span>
      </header>

      <form className="tag-create-card" onSubmit={handleCreateTag}>
        <div>
          <strong>새 태그 만들기</strong>
          <p>학생이 문의를 등록할 때 선택할 수 있는 분류를 추가합니다.</p>
        </div>
        <div>
          <input
            maxLength={24}
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
            placeholder="예: 급식, 시설, 행사"
          />
          <button className="black-button" type="submit">
            생성
          </button>
        </div>
      </form>

      <section className="tag-admin-grid">
        {tags.length === 0 && (
          <p className="empty-copy">아직 생성된 태그가 없습니다.</p>
        )}
        {tags.map((tag) => (
          <article className="tag-admin-card" key={tag.id}>
            <div>
              <span className="tag-chip">{tag.name}</span>
              <strong>{tagCounts[tag.id] || 0}건</strong>
            </div>
            <p>이 태그로 접수된 문의 수입니다. 삭제해도 기존 문의의 태그명은 기록으로 남습니다.</p>
            <button onClick={() => handleDeleteTag(tag.id)} type="button">
              <Trash2 size={15} />
              삭제
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}

function MessageBubble({
  actor,
  editingMessageId,
  editingText,
  message,
  onCancelEdit,
  onChangeEdit,
  onDelete,
  onEmoji,
  onSaveEdit,
  onStartEdit,
}) {
  const isOwnMessage = message.author === actor;
  const isEditing = editingMessageId === message.id;

  return (
    <article className={`bubble ${message.author}`} key={message.id}>
      <div className="message-meta">
        <strong>{message.authorLabel}</strong>
        <span>
          {message.time}
          {message.editedAt ? " · 수정됨" : ""}
        </span>
      </div>

      {isEditing ? (
        <div className="message-edit-box">
          <textarea
            autoFocus
            value={editingText}
            onChange={(event) => onChangeEdit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSaveEdit();
              }

              if (event.key === "Escape") {
                onCancelEdit();
              }
            }}
            rows={3}
          />
          <div>
            <button onClick={onCancelEdit} type="button">
              취소
            </button>
            <button onClick={onSaveEdit} type="button">
              저장
            </button>
          </div>
        </div>
      ) : (
        <p>{message.text}</p>
      )}

      {message.emoji && <span className="message-emoji">{message.emoji}</span>}

      <div className="message-actions">
        {EMOJIS.map((emoji) => (
          <button
            className={message.emoji === emoji ? "active" : ""}
            key={emoji}
            onClick={() => onEmoji(emoji)}
            type="button"
          >
            {emoji}
          </button>
        ))}
        {isOwnMessage && !isEditing && (
          <>
            <button onClick={onStartEdit} type="button">
              수정
            </button>
            <button onClick={onDelete} type="button">
              삭제
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function AdminScreen({
  adminAuthed,
  adminError,
  adminFilter,
  adminName,
  adminPassword,
  adminReply,
  adminSection,
  adminTagFilter,
  handleCreateTag,
  handleAdminLogin,
  handleAdminReply,
  handleAdminStatusChange,
  handleDeleteTag,
  handleMessageDelete,
  handleMessageEditCancel,
  handleMessageEditStart,
  handleMessageEmoji,
  handleMessageUpdate,
  editingMessageId,
  editingText,
  selectedThread,
  selectedThreadId,
  setAdminFilter,
  setAdminName,
  setAdminPassword,
  setAdminReply,
  setAdminSection,
  setAdminTagFilter,
  setEditingText,
  setSelectedThreadId,
  setTagName,
  statusCounts,
  tagCounts,
  tagName,
  tags,
  threads,
}) {
  if (!adminAuthed) {
    return (
      <main className="admin-login-page">
        <form className="login-box" onSubmit={handleAdminLogin}>
          <LockKeyhole size={25} />
          <h1>Admin</h1>
          <input
            autoFocus
            type="password"
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
            placeholder="비밀번호"
          />
          {adminError && <p className="form-error">{adminError}</p>}
          <button className="black-button" type="submit">
            접속
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <aside className="inbox">
        <header>
          <div className="admin-wordmark">
            <span className="wordmark-symbol" aria-hidden="true">C</span>
            <h1>Council Talk</h1>
          </div>
          <span>{statusCounts.all} inquiries</span>
        </header>

        <nav className="admin-nav" aria-label="어드민 메뉴">
          <button
            className={adminSection === "inquiries" ? "active" : ""}
            onClick={() => setAdminSection("inquiries")}
            type="button"
          >
            문의 관리
          </button>
          <button
            className={adminSection === "tags" ? "active" : ""}
            onClick={() => setAdminSection("tags")}
            type="button"
          >
            태그 관리
          </button>
        </nav>

        <label className="admin-name">
          <UserRound size={17} />
          <input
            value={adminName}
            onChange={(event) => setAdminName(event.target.value)}
            placeholder="답변자 이름"
          />
        </label>

        {adminSection === "inquiries" && (
          <>
            <div className="status-filters">
              {FILTERS.map((filter) => (
                <button
                  className={adminFilter === filter.value ? "active" : ""}
                  key={filter.value}
                  onClick={() => setAdminFilter(filter.value)}
                  type="button"
                >
                  {filter.label}
                  <span>{statusCounts[filter.value]}</span>
                </button>
              ))}
            </div>

            <section className="tag-filter-panel" aria-label="태그별 문의 조회">
              <strong>태그별 조회</strong>
              <div>
                <button
                  className={adminTagFilter === "all" ? "active" : ""}
                  onClick={() => setAdminTagFilter("all")}
                  type="button"
                >
                  전체
                  <span>{tagCounts.all}</span>
                </button>
                <button
                  className={adminTagFilter === "untagged" ? "active" : ""}
                  onClick={() => setAdminTagFilter("untagged")}
                  type="button"
                >
                  태그 없음
                  <span>{tagCounts.untagged}</span>
                </button>
                {tags.map((tag) => (
                  <button
                    className={adminTagFilter === tag.id ? "active" : ""}
                    key={tag.id}
                    onClick={() => setAdminTagFilter(tag.id)}
                    type="button"
                  >
                    {tag.name}
                    <span>{tagCounts[tag.id] || 0}</span>
                  </button>
                ))}
              </div>
            </section>

            <div className="thread-list">
              {threads.length === 0 && <p className="empty-copy">조건에 맞는 문의가 없습니다.</p>}
              {threads.map((thread) => (
                <button
                  className={thread.id === selectedThreadId ? "thread-item active" : "thread-item"}
                  key={thread.id}
                  onClick={() => setSelectedThreadId(thread.id)}
                  type="button"
                >
                  <strong>{thread.title}</strong>
                  <span>
                    {thread.name} · {thread.studentId}
                  </span>
                  {thread.tagName && <em>{thread.tagName}</em>}
                  <small>{normalizeStatus(thread.status)}</small>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      <section className="admin-conversation">
        {adminSection === "tags" ? (
          <TagAdminPanel
            handleCreateTag={handleCreateTag}
            handleDeleteTag={handleDeleteTag}
            setTagName={setTagName}
            tagCounts={tagCounts}
            tagName={tagName}
            tags={tags}
          />
        ) : selectedThread ? (
          <>
            <header className="conversation-head">
              <div>
                <h2>{selectedThread.title}</h2>
                <p>
                  {selectedThread.name} · {selectedThread.studentId}
                </p>
                {selectedThread.tagName && <span className="tag-chip">{selectedThread.tagName}</span>}
              </div>
              <span>{normalizeStatus(selectedThread.status)}</span>
            </header>

            <div className="status-actions">
              {STATUS_LABELS.map((status) => (
                <button
                  className={normalizeStatus(selectedThread.status) === status ? "active" : ""}
                  key={status}
                  onClick={() => handleAdminStatusChange(status)}
                  type="button"
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="messages admin-messages">
              {selectedThread.messages.map((message) => (
                <MessageBubble
                  actor="admin"
                  editingMessageId={editingMessageId}
                  editingText={editingText}
                  key={message.id}
                  message={message}
                  onCancelEdit={handleMessageEditCancel}
                  onChangeEdit={setEditingText}
                  onDelete={() => handleMessageDelete(selectedThread, message, "admin")}
                  onEmoji={(emoji) => handleMessageEmoji(selectedThread, message, "admin", emoji)}
                  onSaveEdit={() => handleMessageUpdate(selectedThread, message, "admin")}
                  onStartEdit={() => handleMessageEditStart(message)}
                />
              ))}
            </div>

            <footer className="admin-reply">
              <textarea
                value={adminReply}
                onChange={(event) => setAdminReply(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleAdminReply();
                  }
                }}
                placeholder={`${adminName || "학생회"} 이름으로 답변하기`}
                rows={4}
              />
              <button aria-label="답변 보내기" className="black-icon-button" onClick={handleAdminReply} type="button">
                <Send size={19} />
              </button>
            </footer>
          </>
        ) : (
          <div className="empty-conversation">문의를 선택하세요.</div>
        )}
      </section>
    </main>
  );
}

export default App;
