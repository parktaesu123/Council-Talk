import { useState } from "react";

const initialThreads = [
  {
    id: 1,
    studentId: "24014567",
    name: "김민서",
    title: "축제 부스 신청 일정 문의",
    content: "동아리 부스 신청이 언제 열리는지 궁금합니다.",
    status: "답변중",
    lastActive: "방금 전",
    messages: [
      {
        id: 1,
        author: "student",
        authorLabel: "김민서",
        time: "10:02",
        text: "동아리 부스 신청이 언제 열리는지 궁금합니다.",
      },
      {
        id: 2,
        author: "admin",
        authorLabel: "학생회",
        time: "10:05",
        text: "이번 주 금요일 오후 6시에 공지될 예정입니다. 공지 채널도 함께 확인해 주세요.",
      },
    ],
  },
  {
    id: 2,
    studentId: "24017654",
    name: "박준호",
    title: "분실물 보관 장소",
    content: "중앙 계단 쪽에서 지갑을 잃어버렸는데 접수된 게 있을까요?",
    status: "대기중",
    lastActive: "12분 전",
    messages: [
      {
        id: 1,
        author: "student",
        authorLabel: "박준호",
        time: "09:44",
        text: "중앙 계단 쪽에서 지갑을 잃어버렸는데 접수된 게 있을까요?",
      },
    ],
  },
];

const emptyForm = {
  studentId: "",
  name: "",
  title: "",
  content: "",
};

function App() {
  const [mode, setMode] = useState("user");
  const [threads, setThreads] = useState(initialThreads);
  const [selectedThreadId, setSelectedThreadId] = useState(initialThreads[0].id);
  const [form, setForm] = useState(emptyForm);
  const [userChat, setUserChat] = useState("");
  const [adminReply, setAdminReply] = useState("");

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? threads[0];

  const handleCreateThread = () => {
    if (!form.studentId || !form.name || !form.title || !form.content) {
      return;
    }

    const newThread = {
      id: Date.now(),
      studentId: form.studentId,
      name: form.name,
      title: form.title,
      content: form.content,
      status: "대기중",
      lastActive: "방금 전",
      messages: [
        {
          id: 1,
          author: "student",
          authorLabel: form.name,
          time: "지금",
          text: form.content,
        },
      ],
    };

    setThreads((current) => [newThread, ...current]);
    setSelectedThreadId(newThread.id);
    setForm(emptyForm);
    setMode("user");
  };

  const handleUserChatSend = () => {
    if (!userChat.trim() || !selectedThread) {
      return;
    }

    setThreads((current) =>
      current.map((thread) =>
        thread.id === selectedThread.id
          ? {
              ...thread,
              status: "답변중",
              lastActive: "방금 전",
              messages: [
                ...thread.messages,
                {
                  id: Date.now(),
                  author: "student",
                  authorLabel: thread.name,
                  time: "지금",
                  text: userChat.trim(),
                },
              ],
            }
          : thread,
      ),
    );
    setUserChat("");
  };

  const handleAdminReply = () => {
    if (!adminReply.trim() || !selectedThread) {
      return;
    }

    setThreads((current) =>
      current.map((thread) =>
        thread.id === selectedThread.id
          ? {
              ...thread,
              status: "답변완료",
              lastActive: "방금 전",
              messages: [
                ...thread.messages,
                {
                  id: Date.now(),
                  author: "admin",
                  authorLabel: "학생회",
                  time: "지금",
                  text: adminReply.trim(),
                },
              ],
            }
          : thread,
      ),
    );
    setAdminReply("");
  };

  return (
    <div className="app-shell">
      <aside className="global-sidebar">
        <div className="brand">
          <div className="brand-mark">CT</div>
          <div>
            <p>Council Talk</p>
            <span>학생회 문의 채널</span>
          </div>
        </div>

        <nav className="mode-nav">
          <button
            className={mode === "user" ? "active" : ""}
            onClick={() => setMode("user")}
            type="button"
          >
            일반 학생
          </button>
          <button
            className={mode === "admin" ? "active" : ""}
            onClick={() => setMode("admin")}
            type="button"
          >
            어드민
          </button>
        </nav>

        <div className="sidebar-card">
          <p>운영 상태</p>
          <strong>{threads.length}건의 문의가 접수됨</strong>
          <span>실시간 상담과 공지 대응을 한 화면에서 관리합니다.</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <h1>{mode === "user" ? "학생 문의 접수" : "학생회 상담 어드민"}</h1>
            <p>
              {mode === "user"
                ? "질문 제목, 내용, 학번, 이름을 입력하고 바로 대화를 이어갈 수 있습니다."
                : "문의 목록을 확인하고 학생에게 답변을 남겨 주세요."}
            </p>
          </div>
          <div className="header-pill">Channel-like Monotone UI</div>
        </header>

        {mode === "user" ? (
          <section className="content-grid">
            <div className="panel form-panel">
              <div className="panel-head">
                <h2>문의 작성</h2>
                <span>새 상담 시작</span>
              </div>
              <div className="form-grid">
                <label>
                  <span>학번</span>
                  <input
                    value={form.studentId}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, studentId: event.target.value }))
                    }
                    placeholder="예: 24014567"
                  />
                </label>
                <label>
                  <span>이름</span>
                  <input
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="이름을 입력하세요"
                  />
                </label>
                <label className="full">
                  <span>질문 제목</span>
                  <input
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, title: event.target.value }))
                    }
                    placeholder="무엇이 궁금한가요?"
                  />
                </label>
                <label className="full">
                  <span>질문 내용</span>
                  <textarea
                    value={form.content}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, content: event.target.value }))
                    }
                    placeholder="문의 내용을 자세히 작성해 주세요"
                    rows={6}
                  />
                </label>
              </div>
              <button className="primary-button" onClick={handleCreateThread} type="button">
                문의 등록하기
              </button>
            </div>

            <div className="panel chat-panel">
              <div className="panel-head">
                <h2>내 문의 대화</h2>
                <span>{selectedThread?.status ?? "대기중"}</span>
              </div>

              {selectedThread ? (
                <>
                  <div className="thread-summary">
                    <strong>{selectedThread.title}</strong>
                    <p>
                      {selectedThread.name} · {selectedThread.studentId}
                    </p>
                  </div>
                  <div className="message-list">
                    {selectedThread.messages.map((message) => (
                      <article
                        className={`message-bubble ${message.author === "admin" ? "admin" : "student"}`}
                        key={message.id}
                      >
                        <div className="message-meta">
                          <strong>{message.authorLabel}</strong>
                          <span>{message.time}</span>
                        </div>
                        <p>{message.text}</p>
                      </article>
                    ))}
                  </div>
                  <div className="chat-input-row">
                    <input
                      value={userChat}
                      onChange={(event) => setUserChat(event.target.value)}
                      placeholder="추가로 질문을 남겨보세요"
                    />
                    <button className="send-button" onClick={handleUserChatSend} type="button">
                      전송
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty-state">등록된 문의가 없어요.</div>
              )}
            </div>
          </section>
        ) : (
          <section className="content-grid admin-grid">
            <div className="panel inbox-panel">
              <div className="panel-head">
                <h2>문의함</h2>
                <span>전체 {threads.length}</span>
              </div>
              <div className="inbox-list">
                {threads.map((thread) => (
                  <button
                    className={`thread-card ${thread.id === selectedThread?.id ? "selected" : ""}`}
                    key={thread.id}
                    onClick={() => setSelectedThreadId(thread.id)}
                    type="button"
                  >
                    <div className="thread-card-top">
                      <strong>{thread.title}</strong>
                      <span>{thread.status}</span>
                    </div>
                    <p>
                      {thread.name} · {thread.studentId}
                    </p>
                    <small>{thread.lastActive}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="panel admin-chat-panel">
              {selectedThread ? (
                <>
                  <div className="panel-head">
                    <div>
                      <h2>{selectedThread.title}</h2>
                      <span>
                        {selectedThread.name} · {selectedThread.studentId}
                      </span>
                    </div>
                    <div className={`status-badge ${selectedThread.status}`}>
                      {selectedThread.status}
                    </div>
                  </div>
                  <div className="message-list">
                    {selectedThread.messages.map((message) => (
                      <article
                        className={`message-bubble ${message.author === "admin" ? "admin" : "student"}`}
                        key={message.id}
                      >
                        <div className="message-meta">
                          <strong>{message.authorLabel}</strong>
                          <span>{message.time}</span>
                        </div>
                        <p>{message.text}</p>
                      </article>
                    ))}
                  </div>
                  <div className="chat-input-stack">
                    <textarea
                      value={adminReply}
                      onChange={(event) => setAdminReply(event.target.value)}
                      placeholder="학생에게 보낼 답변을 입력하세요"
                      rows={5}
                    />
                    <button className="primary-button" onClick={handleAdminReply} type="button">
                      답변 보내기
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty-state">선택된 문의가 없습니다.</div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
