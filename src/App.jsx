import { ArrowUp, LockKeyhole, MessageCircle, Plus, RotateCcw, Send, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "council-talk-threads";

const emptyForm = {
  studentId: "",
  name: "",
  title: "",
  content: "",
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

function App() {
  const [route, setRoute] = useState(() => window.location.pathname);
  const [threads, setThreads] = useState(loadThreads);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const [studentProfile, setStudentProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("council-talk-student") || "null") || null;
    } catch {
      return null;
    }
  });
  const [supportView, setSupportView] = useState("rooms");
  const [studentMessage, setStudentMessage] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminAuthed, setAdminAuthed] = useState(
    () => sessionStorage.getItem("council-talk-admin") === "true",
  );
  const [adminName, setAdminName] = useState(
    () => localStorage.getItem("council-talk-admin-name") || "학생회",
  );
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [adminReply, setAdminReply] = useState("");

  useEffect(() => {
    const syncRoute = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    apiRequest("/api/threads")
      .then((data) => setThreads(data.threads))
      .catch(() => {
        setThreads(loadThreads());
      });
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  }, [threads]);

  useEffect(() => {
    localStorage.setItem("council-talk-admin-name", adminName);
  }, [adminName]);

  useEffect(() => {
    if (studentProfile) {
      localStorage.setItem("council-talk-student", JSON.stringify(studentProfile));
    }
  }, [studentProfile]);

  useEffect(() => {
    if (!selectedThreadId && threads.length > 0) {
      setSelectedThreadId(threads[0].id);
    }
  }, [selectedThreadId, threads]);

  const currentThread = threads.find((thread) => thread.id === currentThreadId);
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId);
  const studentThreads = studentProfile
    ? threads.filter(
        (thread) =>
          thread.studentId === studentProfile.studentId && thread.name === studentProfile.name,
      )
    : [];
  const isAdminRoute = route.startsWith("/admin");

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

  const handleCreateThread = async (event) => {
    event.preventDefault();
    if (
      !/^\d{4}$/.test(form.studentId.trim()) ||
      !form.name.trim() ||
      !form.title.trim() ||
      !form.content.trim()
    ) {
      return;
    }

    const payload = {
      studentId: form.studentId.trim(),
      name: form.name.trim(),
      title: form.title.trim(),
      content: form.content.trim(),
    };

    let thread;
    try {
      const data = await apiRequest("/api/threads", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      thread = data.thread;
      setThreads(data.threads);
    } catch {
      thread = {
        id: crypto.randomUUID(),
        ...payload,
        status: "대기중",
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

    setStudentProfile({ studentId: payload.studentId, name: payload.name });
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
        body: JSON.stringify({ author: "student", text }),
      });
      setThreads(data.threads);
    } catch {
      saveThreadsFallback((current) =>
        current.map((thread) =>
          thread.id === currentThread.id
            ? {
                ...thread,
                status: "대기중",
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
    try {
      await apiRequest("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: adminPassword }),
      });
      sessionStorage.setItem("council-talk-admin", "true");
      setAdminAuthed(true);
      setAdminPassword("");
      const data = await apiRequest("/api/threads");
      setThreads(data.threads);
    } catch {
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
      setThreads(data.threads);
    } catch {
      saveThreadsFallback((current) =>
        current.map((thread) =>
          thread.id === selectedThread.id
            ? {
                ...thread,
                status: "답변완료",
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

  if (isAdminRoute) {
    return (
      <AdminScreen
        adminAuthed={adminAuthed}
        adminName={adminName}
        adminPassword={adminPassword}
        adminReply={adminReply}
        handleAdminLogin={handleAdminLogin}
        handleAdminReply={handleAdminReply}
        selectedThread={selectedThread}
        selectedThreadId={selectedThreadId}
        setAdminName={setAdminName}
        setAdminPassword={setAdminPassword}
        setAdminReply={setAdminReply}
        setSelectedThreadId={setSelectedThreadId}
        threads={threads}
      />
    );
  }

  return (
    <main className="public-page">
      <section className="logo-stage" aria-label="Council Talk">
        <div className="wordmark">
          <span className="wordmark-symbol">C</span>
          <h1>Council Talk</h1>
        </div>
      </section>

      <button className="support-launcher" onClick={() => setIsSupportOpen(true)} type="button">
        <MessageCircle size={18} />
        문의하기
      </button>

      {isSupportOpen && (
        <SupportPanel
          currentThread={currentThread}
          form={form}
          handleCreateThread={handleCreateThread}
          handleStudentSend={handleStudentSend}
          setCurrentThreadId={setCurrentThreadId}
          setForm={setForm}
          setIsSupportOpen={setIsSupportOpen}
          setSupportView={setSupportView}
          setStudentMessage={setStudentMessage}
          studentProfile={studentProfile}
          studentThreads={studentThreads}
          studentMessage={studentMessage}
          supportView={supportView}
        />
      )}
    </main>
  );
}

function SupportPanel({
  currentThread,
  form,
  handleCreateThread,
  handleStudentSend,
  setCurrentThreadId,
  setForm,
  setIsSupportOpen,
  setSupportView,
  setStudentMessage,
  studentProfile,
  studentThreads,
  studentMessage,
  supportView,
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
    }));
  };

  return (
    <aside className="support-panel" aria-label="문의하기">
      <header className="support-header">
        <button
          aria-label="문의 목록"
          className="icon-button"
          onClick={() => setSupportView("rooms")}
          type="button"
        >
          <RotateCcw size={21} />
        </button>
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
            <p>문의마다 대화방이 따로 만들어집니다.</p>
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
        </div>
      )}

      {supportView === "new" && (
        <form className="support-form" onSubmit={handleCreateThread}>
          <div className="support-title">
            <h2>문의하기</h2>
            <p>학생회가 확인할 수 있도록 필요한 정보만 남겨주세요.</p>
          </div>

          <div className="field-row">
            <label>
              학번
              <input
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]{4}"
                value={form.studentId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    studentId: event.target.value.replace(/\D/g, "").slice(0, 4),
                  }))
                }
                placeholder="3105"
              />
            </label>
            <label>
              이름
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="홍길동"
              />
            </label>
          </div>

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
          </div>

          <div className="messages">
            {currentThread.messages.map((message) => (
              <article className={`bubble ${message.author}`} key={message.id}>
                <div>
                  <strong>{message.authorLabel}</strong>
                  <span>{message.time}</span>
                </div>
                <p>{message.text}</p>
              </article>
            ))}
          </div>

          <div className="support-compose">
            <button aria-label="첨부" className="plus-button" type="button">
              +
            </button>
            <input
              value={studentMessage}
              onChange={(event) => setStudentMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleStudentSend();
                }
              }}
              placeholder="추가 문의를 입력하세요..."
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

function AdminScreen({
  adminAuthed,
  adminName,
  adminPassword,
  adminReply,
  handleAdminLogin,
  handleAdminReply,
  selectedThread,
  selectedThreadId,
  setAdminName,
  setAdminPassword,
  setAdminReply,
  setSelectedThreadId,
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
          <h1>Council Talk</h1>
          <span>{threads.length} inquiries</span>
        </header>

        <label className="admin-name">
          <UserRound size={17} />
          <input
            value={adminName}
            onChange={(event) => setAdminName(event.target.value)}
            placeholder="답변자 이름"
          />
        </label>

        <div className="thread-list">
          {threads.length === 0 && <p className="empty-copy">아직 접수된 문의가 없습니다.</p>}
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
              <small>{thread.status}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="admin-conversation">
        {selectedThread ? (
          <>
            <header className="conversation-head">
              <div>
                <h2>{selectedThread.title}</h2>
                <p>
                  {selectedThread.name} · {selectedThread.studentId}
                </p>
              </div>
              <span>{selectedThread.status}</span>
            </header>

            <div className="messages admin-messages">
              {selectedThread.messages.map((message) => (
                <article className={`bubble ${message.author}`} key={message.id}>
                  <div>
                    <strong>{message.authorLabel}</strong>
                    <span>{message.time}</span>
                  </div>
                  <p>{message.text}</p>
                </article>
              ))}
            </div>

            <footer className="admin-reply">
              <textarea
                value={adminReply}
                onChange={(event) => setAdminReply(event.target.value)}
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
