import {
  ArrowLeft,
  ArrowUp,
  LockKeyhole,
  MessageCircle,
  Pencil,
  Plus,
  Reply,
  Send,
  Settings2,
  Smile,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import EmojiPicker from "./components/EmojiPicker.jsx";

const STORAGE_KEY = "council-talk-threads";
const STATUS_LABELS = ["미완료", "진행중", "완료"];
const FILTERS = [
  { label: "전체", value: "all" },
  { label: "미완료", value: "미완료" },
  { label: "진행중", value: "진행중" },
  { label: "완료", value: "완료" },
];
const ADMIN_SECTIONS = ["inquiries", "tags", "students", "requests", "daisu"];
const ADMIN_SECTION_PATHS = {
  daisu: "/admin/daisu",
  inquiries: "/admin/inquiries",
  tags: "/admin/tags",
  students: "/admin/students",
  requests: "/admin/requests",
};
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
  email: "",
};

const emptyProfileChangeForm = {
  studentId: "",
  name: "",
};
const emptyDaiSuDocumentForm = {
  title: "",
  category: "",
  tags: "",
  keywords: "",
  content: "",
  status: "draft",
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
const normalizeThread = (thread) => ({ ...thread, status: normalizeStatus(thread.status) });
const normalizeThreads = (threads) => (Array.isArray(threads) ? threads.map(normalizeThread) : []);
const getLatestMessagePreview = (thread) =>
  thread?.latestMessage ||
  (thread?.messages?.length
    ? {
        id: thread.messages.at(-1).id,
        author: thread.messages.at(-1).author,
        authorLabel: thread.messages.at(-1).authorLabel,
        text: thread.messages.at(-1).text,
        time: thread.messages.at(-1).time,
        createdAt: thread.messages.at(-1).createdAt,
      }
    : null);
const toThreadSummary = (thread) =>
  normalizeThread({
    id: thread.id,
    studentId: thread.studentId,
    name: thread.name,
    title: thread.title,
    tagId: thread.tagId || "",
    tagName: thread.tagName || "",
    status: thread.status,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messageCount: thread.messageCount ?? thread.messages?.length ?? 0,
    latestMessage: getLatestMessagePreview(thread),
  });
const toThreadSummaries = (threads) => (Array.isArray(threads) ? threads.map(toThreadSummary) : []);
const messageSignature = (threadId, text) => `${threadId}:${String(text || "").trim()}`;
const createReplyTarget = (message) => ({
  id: message.id,
  authorLabel: message.authorLabel,
  text: String(message.text || ""),
});
const createReactionActorKey = ({ author, authorLabel, profile }) =>
  author === "student"
    ? `student:${profile?.studentId || ""}:${profile?.name || ""}`
    : `admin:${String(authorLabel || "학생회").trim() || "학생회"}`;
const toggleReactionState = (message, emoji, reactorKey) => {
  const currentReactions = Array.isArray(message.reactions) ? message.reactions : [];
  const target = currentReactions.find((reaction) => reaction.emoji === emoji);
  const nextReactions = target
    ? currentReactions
        .map((reaction) =>
          reaction.emoji !== emoji
            ? reaction
            : {
                ...reaction,
                reactorKeys: (reaction.reactorKeys || []).includes(reactorKey)
                  ? (reaction.reactorKeys || []).filter((key) => key !== reactorKey)
                  : [...(reaction.reactorKeys || []), reactorKey],
              },
        )
        .filter((reaction) => (reaction.reactorKeys || []).length > 0)
    : [...currentReactions, { emoji, reactorKeys: [reactorKey] }];

  return {
    ...message,
    reactions: nextReactions.map((reaction) => ({
      ...reaction,
      count: (reaction.reactorKeys || []).length,
    })),
  };
};
const replaceOptimisticMessage = (messages, clientMessageId, nextMessage) =>
  (messages || []).map((message) =>
    message.clientMessageId === clientMessageId || message.id === clientMessageId
      ? nextMessage
      : message,
  );
const replaceMessageById = (messages, nextMessage) =>
  (messages || []).map((message) => (message.id === nextMessage.id ? nextMessage : message));
const mergeRealtimeMessageIntoDetail = (detail, message, threadSummary) => {
  if (!detail || !message) {
    return detail;
  }

  const existingIndex = (detail.messages || []).findIndex(
    (item) => item.id === message.id || item.clientMessageId === message.clientMessageId,
  );

  if (existingIndex >= 0) {
    return {
      ...detail,
      ...threadSummary,
      messages: replaceOptimisticMessage(detail.messages, message.clientMessageId || message.id, message),
    };
  }

  return {
    ...detail,
    ...threadSummary,
    messages: [...(detail.messages || []), message],
  };
};
const mergeUpdatedMessageIntoDetail = (detail, message, threadSummary) => {
  if (!detail || !message) {
    return detail;
  }

  return {
    ...detail,
    ...threadSummary,
    messages: replaceMessageById(detail.messages, message),
  };
};
const mergeThreadList = (threads, nextThread) => {
  const normalized = toThreadSummary(nextThread);
  const index = threads.findIndex((thread) => thread.id === normalized.id);

  if (index < 0) {
    return [normalized, ...threads];
  }

  const nextThreads = [...threads];
  nextThreads[index] = normalized;
  return nextThreads.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
};
const studentKey = (student) => `${student.studentId}:${student.name}`;
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
const decodePathPart = (value) => {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
};
const getAdminSectionFromPath = (path) => {
  const section = path.split("/")[2] || "inquiries";
  return ADMIN_SECTIONS.includes(section) ? section : "inquiries";
};
const getAdminThreadIdFromPath = (path) => {
  const [, , section, threadId] = path.split("/");
  return section === "inquiries" ? decodePathPart(threadId) : "";
};
const getSupportThreadIdFromPath = (path) => {
  const [, section, threadId] = path.split("/");
  return section === "support" ? decodePathPart(threadId) : "";
};
const getAdminThreadPath = (threadId) => `${ADMIN_SECTION_PATHS.inquiries}/${encodeURIComponent(threadId)}`;
const getSupportThreadPath = (threadId) => `/support/${encodeURIComponent(threadId)}`;
const getPublicViewFromPath = (path) => (path === "/mypage" ? "profile" : "home");

function App() {
  const [route, setRoute] = useState(() => window.location.pathname);
  const [threads, setThreads] = useState(loadThreads);
  const [tags, setTags] = useState([]);
  const [students, setStudents] = useState([]);
  const [profileRequests, setProfileRequests] = useState([]);
  const [daiSuAssistant, setDaiSuAssistant] = useState(null);
  const [daiSuDocuments, setDaiSuDocuments] = useState([]);
  const [daiSuAnswerLogs, setDaiSuAnswerLogs] = useState([]);
  const [daiSuDocumentForm, setDaiSuDocumentForm] = useState(emptyDaiSuDocumentForm);
  const [editingDaiSuDocumentId, setEditingDaiSuDocumentId] = useState("");
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [currentThreadDetail, setCurrentThreadDetail] = useState(null);
  const [currentThreadHasMore, setCurrentThreadHasMore] = useState(false);
  const [currentThreadNextCursor, setCurrentThreadNextCursor] = useState(null);
  const [isCurrentThreadLoading, setIsCurrentThreadLoading] = useState(false);
  const [selectedThreadDetail, setSelectedThreadDetail] = useState(null);
  const [selectedThreadHasMore, setSelectedThreadHasMore] = useState(false);
  const [selectedThreadNextCursor, setSelectedThreadNextCursor] = useState(null);
  const [isSelectedThreadLoading, setIsSelectedThreadLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [profileChangeForm, setProfileChangeForm] = useState(emptyProfileChangeForm);
  const [profileChangeMessage, setProfileChangeMessage] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [studentEmailMessage, setStudentEmailMessage] = useState("");
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const [publicView, setPublicView] = useState(() => getPublicViewFromPath(window.location.pathname));
  const [authTarget, setAuthTarget] = useState("support");
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
  const [studentReplyTarget, setStudentReplyTarget] = useState(null);
  const [createThreadError, setCreateThreadError] = useState("");
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminAuthed, setAdminAuthed] = useState(
    () => sessionStorage.getItem("council-talk-admin") === "true",
  );
  const [adminName, setAdminName] = useState(
    () => localStorage.getItem("council-talk-admin-name") || "학생회",
  );
  const [isStudentSending, setIsStudentSending] = useState(false);
  const [isAdminSending, setIsAdminSending] = useState(false);
  const adminClientIdRef = useRef(
    sessionStorage.getItem("council-talk-admin-client-id") || crypto.randomUUID(),
  );
  const adminSyncFallbackRef = useRef(null);
  const studentSendLockRef = useRef(false);
  const adminSendLockRef = useRef(false);
  const lastStudentSendRef = useRef("");
  const lastAdminSendRef = useRef("");
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [deepLinkedThreadId, setDeepLinkedThreadId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return getAdminThreadIdFromPath(window.location.pathname) || params.get("thread") || "";
  });
  const [adminReply, setAdminReply] = useState("");
  const [adminReplyTarget, setAdminReplyTarget] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [activeMessageMenuId, setActiveMessageMenuId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [banDialogStudent, setBanDialogStudent] = useState(null);
  const [adminFilter, setAdminFilter] = useState("all");
  const [adminTagFilter, setAdminTagFilter] = useState("all");
  const [adminTyping, setAdminTyping] = useState([]);
  const [emojiPickerTarget, setEmojiPickerTarget] = useState(null);
  const [messageEmojiTarget, setMessageEmojiTarget] = useState(null);
  const [emojiQuery, setEmojiQuery] = useState("");
  const [emojiResults, setEmojiResults] = useState([]);
  const [isEmojiLoading, setIsEmojiLoading] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState("idle");
  const [adminSection, setAdminSection] = useState(() => getAdminSectionFromPath(window.location.pathname));
  const [selectedStudentKey, setSelectedStudentKey] = useState("");
  const [adminStudentMessage, setAdminStudentMessage] = useState("");
  const [banReason, setBanReason] = useState("");
  const [tagName, setTagName] = useState("");
  const isAdminRoute = route.startsWith("/admin");
  const adminReplyHasText = Boolean(adminReply.trim());
  const studentComposeRef = useRef(null);
  const adminComposeRef = useRef(null);
  const currentThreadSummary = useMemo(
    () => threads.find((thread) => thread.id === currentThreadId) || null,
    [currentThreadId, threads],
  );
  const selectedThreadSummary = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || null,
    [selectedThreadId, threads],
  );

  const syncPageState = (path) => {
    setRoute(path);

    if (path.startsWith("/admin")) {
      setAdminSection(getAdminSectionFromPath(path));
      const threadId = getAdminThreadIdFromPath(path);
      if (threadId) {
        setSelectedThreadId(threadId);
        setDeepLinkedThreadId(threadId);
      }
      return;
    }

    setPublicView(getPublicViewFromPath(path));
    const supportThreadId = getSupportThreadIdFromPath(path);
    setIsSupportOpen(path === "/support" || Boolean(supportThreadId));
    if (path === "/support" || supportThreadId) {
      setSupportView("rooms");
      setAuthTarget("support");
      if (supportThreadId) {
        setCurrentThreadId(supportThreadId);
        setSupportView("chat");
      }
    }
    if (path === "/mypage") {
      setAuthTarget("profile");
    }
  };

  const navigateTo = (path) => {
    window.history.pushState({}, "", path);
    syncPageState(path);
  };

  useEffect(() => {
    syncPageState(window.location.pathname);
    const syncRoute = () => syncPageState(window.location.pathname);
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
      .then((data) => {
        setThreads(toThreadSummaries(data.threads));
        setStudentProfile((current) => {
          if (!current) {
            return current;
          }
          const banned = Boolean(data.profile?.banned);
          const banReason = data.profile?.banReason || "";
          if (current.banned === banned && current.banReason === banReason) {
            return current;
          }
          return { ...current, banned, banReason };
        });
      })
      .catch(() => resetStudentProfile());
  }, [isAdminRoute, studentProfile]);

  useEffect(() => {
    sessionStorage.setItem("council-talk-admin-client-id", adminClientIdRef.current);
  }, []);

  useEffect(() => {
    if (!adminAuthed || !isAdminRoute) {
      return;
    }

    loadAdminData();
  }, [adminAuthed, isAdminRoute]);

  useEffect(() => {
    const shouldConnect =
      (adminAuthed && isAdminRoute) || (!isAdminRoute && Boolean(studentProfile));

    if (!shouldConnect) {
      return undefined;
    }

    setRealtimeStatus("connecting");
    const events = new EventSource("/api/events");

    events.onopen = () => {
      setRealtimeStatus("connected");
    };

    events.addEventListener("sync", (event) => {
      try {
        const data = JSON.parse(event.data);
        setThreads(toThreadSummaries(data.threads));
      } catch {
        if (adminAuthed && isAdminRoute) {
          loadAdminData();
        } else {
          refreshStudentSession().catch(() => {});
        }
      }
    });

    events.addEventListener("thread", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.thread) {
          setThreads((current) => mergeThreadList(current, data.thread));
        }
      } catch {
        if (adminAuthed && isAdminRoute) {
          loadAdminData();
        } else {
          refreshStudentSession().catch(() => {});
        }
      }
    });

    events.addEventListener("thread-message", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data.thread || !data.message) {
          return;
        }

        setThreads((current) => mergeThreadList(current, data.thread));
        setCurrentThreadDetail((current) =>
          current?.id === data.threadId
            ? mergeRealtimeMessageIntoDetail(current, data.message, data.thread)
            : current,
        );
        setSelectedThreadDetail((current) =>
          current?.id === data.threadId
            ? mergeRealtimeMessageIntoDetail(current, data.message, data.thread)
            : current,
        );
      } catch {
        if (adminAuthed && isAdminRoute) {
          loadAdminData();
        } else {
          refreshStudentSession().catch(() => {});
        }
      }
    });

    events.addEventListener("thread-message-updated", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data.thread || !data.message) {
          return;
        }

        setThreads((current) => mergeThreadList(current, data.thread));
        setCurrentThreadDetail((current) =>
          current?.id === data.threadId
            ? mergeUpdatedMessageIntoDetail(current, data.message, data.thread)
            : current,
        );
        setSelectedThreadDetail((current) =>
          current?.id === data.threadId
            ? mergeUpdatedMessageIntoDetail(current, data.message, data.thread)
            : current,
        );
      } catch {
        if (adminAuthed && isAdminRoute) {
          loadAdminData();
        } else {
          refreshStudentSession().catch(() => {});
        }
      }
    });

    events.addEventListener("typing", (event) => {
      try {
        const data = JSON.parse(event.data);
        setAdminTyping(
          (data.typing || []).filter((item) => item.clientId !== adminClientIdRef.current),
        );
      } catch {
        setAdminTyping([]);
      }
    });

    events.onerror = () => {
      setRealtimeStatus("reconnecting");
      if (adminSyncFallbackRef.current) {
        return;
      }

      adminSyncFallbackRef.current = setTimeout(() => {
        if (adminAuthed && isAdminRoute) {
          loadAdminData();
        } else {
          refreshStudentSession().catch(() => {});
        }
        adminSyncFallbackRef.current = null;
      }, 4000);
    };

    return () => {
      if (adminSyncFallbackRef.current) {
        clearTimeout(adminSyncFallbackRef.current);
        adminSyncFallbackRef.current = null;
      }
      events.close();
      setRealtimeStatus("idle");
    };
  }, [adminAuthed, isAdminRoute, studentProfile]);

  useEffect(() => {
    if (!emojiPickerTarget && !messageEmojiTarget) {
      return;
    }

    let cancelled = false;
    setIsEmojiLoading(true);
    apiRequest(`/api/emojis?${new URLSearchParams({
      limit: "120",
      ...(emojiQuery.trim() ? { q: emojiQuery.trim() } : {}),
    }).toString()}`)
      .then((data) => {
        if (!cancelled) {
          setEmojiResults(data.emojis || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEmojiResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsEmojiLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [emojiPickerTarget, emojiQuery, messageEmojiTarget]);

  useEffect(() => {
    if (!studentProfile || supportView !== "chat" || !currentThreadId) {
      return;
    }

    const summary = threads.find((thread) => thread.id === currentThreadId);
    if (!summary) {
      return;
    }

    let cancelled = false;
    setIsCurrentThreadLoading(true);
    loadThreadMessages(currentThreadId)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setCurrentThreadDetail(buildThreadDetail(summary, data));
        setCurrentThreadHasMore(Boolean(data.hasMore));
        setCurrentThreadNextCursor(data.nextCursor || null);
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentThreadDetail((current) => (current?.id === currentThreadId ? current : summary));
          setCurrentThreadHasMore(false);
          setCurrentThreadNextCursor(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsCurrentThreadLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentThreadId, currentThreadSummary?.id, studentProfile, supportView]);

  useEffect(() => {
    if (!adminAuthed || !isAdminRoute || !selectedThreadId) {
      return;
    }

    const summary = threads.find((thread) => thread.id === selectedThreadId);
    if (!summary) {
      return;
    }

    let cancelled = false;
    setIsSelectedThreadLoading(true);
    loadThreadMessages(selectedThreadId)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setSelectedThreadDetail(buildThreadDetail(summary, data));
        setSelectedThreadHasMore(Boolean(data.hasMore));
        setSelectedThreadNextCursor(data.nextCursor || null);
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedThreadDetail((current) => (current?.id === selectedThreadId ? current : summary));
          setSelectedThreadHasMore(false);
          setSelectedThreadNextCursor(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSelectedThreadLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [adminAuthed, isAdminRoute, selectedThreadId, selectedThreadSummary?.id]);

  useEffect(() => {
    if (!adminAuthed || !isAdminRoute || !selectedThreadId) {
      return undefined;
    }

    const threadId = selectedThreadId;
    const active = adminReplyHasText;
    const sendTyping = (isActive) => {
      fetch(`/api/threads/${threadId}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: isActive,
          authorLabel: adminName.trim() || "학생회",
          clientId: adminClientIdRef.current,
        }),
      }).catch(() => {});
    };

    if (!active) {
      sendTyping(false);
      return undefined;
    }

    sendTyping(true);
    const interval = setInterval(() => sendTyping(true), 4000);

    return () => {
      clearInterval(interval);
      sendTyping(false);
    };
  }, [adminAuthed, adminName, adminReplyHasText, isAdminRoute, selectedThreadId]);

  useEffect(() => {
    if (!adminAuthed || !isAdminRoute || !selectedThreadId) {
      return undefined;
    }

    const threadId = selectedThreadId;
    return () => {
      fetch(`/api/threads/${threadId}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: false,
          authorLabel: adminName.trim() || "학생회",
          clientId: adminClientIdRef.current,
        }),
      }).catch(() => {});
    };
  }, [adminAuthed, adminName, isAdminRoute, selectedThreadId]);

  useEffect(() => {
    if (isAdminRoute) {
      return;
    }

    if (route === "/mypage" && !studentProfile) {
      setAuthTarget("profile");
      setAuthMode("login");
      setIdentityError("");
      setIsSupportOpen(true);
    }

    if (route === "/support" || getSupportThreadIdFromPath(route)) {
      setAuthTarget("support");
      setAuthMode("login");
      setSupportView(getSupportThreadIdFromPath(route) ? "chat" : "rooms");
      setIsSupportOpen(true);
    }
  }, [isAdminRoute, route, studentProfile]);

  useEffect(() => {
    if (!isAdminRoute || adminAuthed) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const threadId = getAdminThreadIdFromPath(window.location.pathname) || params.get("thread");

    if (!token) {
      return;
    }

    apiRequest("/api/admin/token", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(() => {
        sessionStorage.setItem("council-talk-admin", "true");
        setAdminAuthed(true);
        setAdminSection("inquiries");
        setDeepLinkedThreadId(threadId || "");
      })
      .catch(() => {
        setAdminError("어드민 토큰이 유효하지 않습니다.");
      });
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
      setProfileChangeForm({
        studentId: studentProfile.studentId,
        name: studentProfile.name,
      });
      setStudentEmail(studentProfile.email || "");
    }
  }, [studentProfile]);

  useEffect(() => {
    if (isAdminRoute && adminSection === "inquiries" && !selectedThreadId && threads.length > 0) {
      setSelectedThreadId(threads[0].id);
      if (!getAdminThreadIdFromPath(route)) {
        navigateTo(getAdminThreadPath(threads[0].id));
      }
    }
  }, [adminSection, isAdminRoute, route, selectedThreadId, threads]);

  useEffect(() => {
    if (!selectedStudentKey && students.length > 0) {
      setSelectedStudentKey(studentKey(students[0]));
    }
  }, [selectedStudentKey, students]);

  useEffect(() => {
    if (!isAdminRoute || adminSection !== "inquiries") {
      return;
    }

    const routeThreadId = getAdminThreadIdFromPath(route);
    if (routeThreadId) {
      return;
    }

    const visibleThreads = threads.filter((thread) => {
      const statusMatches = adminFilter === "all" || normalizeStatus(thread.status) === adminFilter;
      const tagMatches =
        adminTagFilter === "all" ||
        (adminTagFilter === "untagged" ? !thread.tagId : thread.tagId === adminTagFilter);

      return statusMatches && tagMatches;
    });
    const selectedIsVisible = visibleThreads.some((thread) => thread.id === selectedThreadId);

    if (!selectedIsVisible) {
      const nextThreadId = visibleThreads[0]?.id || null;
      setSelectedThreadId(nextThreadId);
      if (nextThreadId) {
        navigateTo(getAdminThreadPath(nextThreadId));
      }
    }
  }, [adminFilter, adminSection, adminTagFilter, isAdminRoute, route, selectedThreadId, threads]);

  const currentThread =
    currentThreadDetail?.id === currentThreadId
      ? currentThreadDetail
      : currentThreadSummary;
  const selectedThread =
    selectedThreadDetail?.id === selectedThreadId
      ? selectedThreadDetail
      : selectedThreadSummary;
  const selectedStudent = useMemo(
    () => students.find((student) => studentKey(student) === selectedStudentKey) || null,
    [selectedStudentKey, students],
  );
  const studentThreads = useMemo(
    () =>
      studentProfile
        ? threads.filter(
            (thread) =>
              thread.studentId === studentProfile.studentId && thread.name === studentProfile.name,
          )
        : [],
    [studentProfile, threads],
  );
  const filteredAdminThreads = useMemo(
    () =>
      threads.filter((thread) => {
        const statusMatches = adminFilter === "all" || normalizeStatus(thread.status) === adminFilter;
        const tagMatches =
          adminTagFilter === "all" ||
          (adminTagFilter === "untagged" ? !thread.tagId : thread.tagId === adminTagFilter);

        return statusMatches && tagMatches;
      }),
    [adminFilter, adminTagFilter, threads],
  );
  const typingThreadIds = useMemo(
    () => new Set(adminTyping.map((item) => item.threadId)),
    [adminTyping],
  );
  const selectedThreadTyping = useMemo(
    () =>
      selectedThreadSummary
        ? adminTyping.filter((item) => item.threadId === selectedThreadSummary.id)
        : [],
    [adminTyping, selectedThreadSummary],
  );
  
  useEffect(() => {
    if (studentReplyTarget && !currentThread?.messages?.some((message) => message.id === studentReplyTarget.id)) {
      setStudentReplyTarget(null);
    }
  }, [currentThread, studentReplyTarget]);

  useEffect(() => {
    if (adminReplyTarget && !selectedThread?.messages?.some((message) => message.id === adminReplyTarget.id)) {
      setAdminReplyTarget(null);
    }
  }, [adminReplyTarget, selectedThread]);

  const statusCounts = useMemo(
    () =>
      threads.reduce(
        (counts, thread) => {
          counts.all += 1;
          counts[normalizeStatus(thread.status)] += 1;
          return counts;
        },
        { all: 0, 미완료: 0, 진행중: 0, 완료: 0 },
      ),
    [threads],
  );
  const tagCounts = useMemo(
    () =>
      threads.reduce(
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
      ),
    [threads],
  );
  const pendingProfileRequests = useMemo(
    () => profileRequests.filter((request) => request.status === "대기"),
    [profileRequests],
  );
  const studentThreadCounts = useMemo(
    () =>
      threads.reduce((counts, thread) => {
        const key = studentKey(thread);
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      }, {}),
    [threads],
  );
  const saveThreadsFallback = (updater) => {
    setThreads((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const buildThreadDetail = (summary, payload) => ({
    ...(summary || {}),
    id: summary?.id || payload?.thread?.id,
    messageCount: payload?.thread?.messageCount ?? summary?.messageCount ?? payload?.messages?.length ?? 0,
    messages: payload?.messages || [],
    updatedAt: payload?.thread?.updatedAt || summary?.updatedAt || "",
  });

  const loadThreadMessages = async (threadId, before, limit = 30) =>
    apiRequest(
      `/api/threads/${threadId}/messages?${new URLSearchParams(
        Object.fromEntries(
          Object.entries({
            before,
            limit: String(limit),
          }).filter(([, value]) => Boolean(value)),
        ),
      ).toString()}`,
    );

  const loadAdminData = async () => {
    try {
      const [threadData, tagData, studentData, requestData, daiSuData, daiSuLogs] = await Promise.all([
        apiRequest("/api/thread-summaries"),
        apiRequest("/api/tags"),
        apiRequest("/api/students"),
        apiRequest("/api/profile-requests"),
        apiRequest("/api/daisu"),
        apiRequest("/api/daisu/answer-logs"),
      ]);
      const nextThreads = toThreadSummaries(threadData.threads);
      setThreads(nextThreads);
      setTags(normalizeTags(tagData.tags));
      setStudents(studentData.students || []);
      setProfileRequests(requestData.requests || []);
      setDaiSuAssistant(daiSuData.assistant || null);
      setDaiSuDocuments(daiSuData.documents || []);
      setDaiSuAnswerLogs(daiSuLogs.answerLogs || []);

      if (deepLinkedThreadId && nextThreads.some((thread) => thread.id === deepLinkedThreadId)) {
        setSelectedThreadId(deepLinkedThreadId);
        setAdminSection("inquiries");
      }
    } catch {
      setThreads(loadThreads());
    }
  };

  const refreshStudentSession = async (profile = studentProfile) => {
    if (!profile) {
      return;
    }

    const data = await apiRequest("/api/students/session", {
      method: "POST",
      body: JSON.stringify(profile),
    });
    setThreads(toThreadSummaries(data.threads));
    setStudentProfile((current) => (current ? { ...current, ...data.profile } : current));
  };

  const completeStudentAuth = (profile, data) => {
    const nextProfile = { ...profile, ...data.profile };
    setStudentProfile(nextProfile);
    setThreads(toThreadSummaries(data.threads));
    apiRequest("/api/tags")
      .then((tagData) => setTags(normalizeTags(tagData.tags)))
      .catch(() => {});
    setForm((current) => ({ ...current, studentId: nextProfile.studentId, name: nextProfile.name }));
    setIdentityError("");
    if (authTarget === "profile") {
      navigateTo("/mypage");
      return;
    }

    const routeThreadId = getSupportThreadIdFromPath(window.location.pathname);
    if (routeThreadId && data.threads.some((thread) => thread.id === routeThreadId)) {
      setCurrentThreadId(routeThreadId);
      setSupportView("chat");
      navigateTo(getSupportThreadPath(routeThreadId));
      return;
    }

    setSupportView("rooms");
    navigateTo("/support");
  };

  const handleIdentifyStudent = (event) => {
    event.preventDefault();
    const studentId = identityForm.studentId.trim();
    const name = identityForm.name.trim();
    const pin = identityForm.pin.trim();
    const email = identityForm.email.trim();
    const isSignup = authMode === "signup";

    if (!name || !/^\d{4}$/.test(pin) || (isSignup && (!/^\d{4}$/.test(studentId) || !isValidEmail(email)))) {
      setIdentityError(
        isSignup
          ? "학번, 이름, 4자리 비밀번호, 이메일을 확인해주세요."
          : "이름과 4자리 비밀번호를 확인해주세요.",
      );
      return;
    }

    setIdentityError("");
    const profile = isSignup ? { studentId, name, pin, email } : { name, pin };
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
    setAuthTarget("support");
    navigateTo("/support");
  };

  const openProfilePage = () => {
    setIdentityError("");
    setAuthMode("login");
    setAuthTarget("profile");

    if (!studentProfile) {
      navigateTo("/mypage");
      return;
    }

    navigateTo("/mypage");
  };

  const closeSupport = () => {
    if (route === "/support" || getSupportThreadIdFromPath(route) || (route === "/mypage" && !studentProfile)) {
      navigateTo("/");
      return;
    }

    setIsSupportOpen(false);
  };

  const resetStudentProfile = () => {
    sessionStorage.removeItem("council-talk-student");
    setStudentProfile(null);
    setCurrentThreadId(null);
    setIdentityForm(emptyIdentity);
    setProfileChangeForm(emptyProfileChangeForm);
    setProfileChangeMessage("");
    setStudentEmail("");
    setStudentEmailMessage("");
    navigateTo("/");
    setIdentityError("");
    setAuthMode("login");
    setSupportView("rooms");
  };

  const handleProfileChangeRequest = async (event) => {
    event.preventDefault();
    const nextStudentId = profileChangeForm.studentId.trim();
    const nextName = profileChangeForm.name.trim();

    if (!studentProfile || !/^\d{4}$/.test(nextStudentId) || !nextName) {
      setProfileChangeMessage("학번은 4자리 숫자, 이름은 빈칸 없이 입력해주세요.");
      return;
    }

    if (studentProfile.studentId === nextStudentId && studentProfile.name === nextName) {
      setProfileChangeMessage("현재 정보와 같아서 변경 신청할 내용이 없습니다.");
      return;
    }

    try {
      const data = await apiRequest("/api/students/profile-change", {
        method: "POST",
        body: JSON.stringify({
          studentId: studentProfile.studentId,
          name: studentProfile.name,
          pin: studentProfile.pin,
          newStudentId: nextStudentId,
          newName: nextName,
        }),
      });
      setProfileRequests(data.requests || []);
      setProfileChangeMessage("변경 신청이 접수되었습니다. 관리자가 승인하면 새 정보로 로그인할 수 있습니다.");
    } catch {
      setProfileChangeMessage("이미 사용 중인 정보이거나 입력값을 다시 확인해주세요.");
    }
  };

  const handleStudentEmailUpdate = async (event) => {
    event.preventDefault();

    if (!studentProfile) {
      return;
    }

    const nextEmail = studentEmail.trim();

    if (!isValidEmail(nextEmail)) {
      setStudentEmailMessage("답변 알림을 받을 이메일을 정확히 입력해주세요.");
      return;
    }

    try {
      const data = await apiRequest("/api/students/email", {
        method: "PATCH",
        body: JSON.stringify({
          studentId: studentProfile.studentId,
          name: studentProfile.name,
          pin: studentProfile.pin,
          email: nextEmail,
        }),
      });
      const nextProfile = { ...studentProfile, ...data.profile };
      setStudentProfile(nextProfile);
      setStudentEmail(nextProfile.email || "");
      setStudentEmailMessage("답변 알림 이메일이 저장되었습니다.");
    } catch {
      setStudentEmailMessage("이메일 형식을 확인해주세요.");
    }
  };

  const handleCreateThread = async (event) => {
    event.preventDefault();
    if (isCreatingThread) {
      return;
    }

    setCreateThreadError("");
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
      setIsCreatingThread(true);
      const data = await apiRequest("/api/threads", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      thread = data.thread;
      setThreads((current) => mergeThreadList(current, thread));
      setCurrentThreadDetail(thread);
      setCurrentThreadHasMore(false);
      setCurrentThreadNextCursor(null);
    } catch {
      setCreateThreadError("문의방을 만들지 못했습니다. 잠시 후 다시 시도해주세요.");
      setIsCreatingThread(false);
      return;
    }

    setStudentProfile((current) => ({
      ...(current || {}),
      studentId: payload.studentId,
      name: payload.name,
      pin: payload.pin,
    }));
    setCurrentThreadId(thread.id);
    setSelectedThreadId(thread.id);
    setSupportView("chat");
    navigateTo(getSupportThreadPath(thread.id));
    setForm(emptyForm);
    setIsCreatingThread(false);
  };

  const handleStudentSend = async () => {
    const text = studentMessage.trim();
    const signature = currentThread ? messageSignature(currentThread.id, text) : "";

    if (
      studentSendLockRef.current ||
      lastStudentSendRef.current === signature ||
      !currentThread ||
      normalizeStatus(currentThread.status) === "완료" ||
      !text
    ) {
      return;
    }

    studentSendLockRef.current = true;
    lastStudentSendRef.current = signature;
    setIsStudentSending(true);
    const clientMessageId = crypto.randomUUID();
    const optimisticMessage = {
      id: clientMessageId,
      clientMessageId,
      author: "student",
      authorLabel: studentProfile?.name || currentThread?.name || "",
      createdAt: new Date().toISOString(),
      time: getTimeLabel(),
      text,
      ...(studentReplyTarget ? { replyTo: studentReplyTarget } : {}),
    };
    const optimisticUpdatedAt = new Date().toISOString();
    setStudentMessage("");
    setCurrentThreadDetail((current) =>
      current
        ? {
            ...current,
            status: "미완료",
            updatedAt: optimisticUpdatedAt,
            messageCount: (current.messageCount || current.messages?.length || 0) + 1,
            messages: [...(current.messages || []), optimisticMessage],
          }
        : current,
    );
    setThreads((current) =>
      mergeThreadList(current, {
        ...(current.find((thread) => thread.id === currentThread.id) || currentThread),
        status: "미완료",
        updatedAt: optimisticUpdatedAt,
        messageCount:
          ((current.find((thread) => thread.id === currentThread.id) || currentThread)?.messageCount || 0) + 1,
        latestMessage: optimisticMessage,
      }),
    );

    try {
      const data = await apiRequest(`/api/threads/${currentThread.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          author: "student",
          studentId: studentProfile?.studentId,
          name: studentProfile?.name,
          pin: studentProfile?.pin,
          text,
          clientMessageId,
          replyTo: studentReplyTarget,
        }),
      });
      setThreads((current) => mergeThreadList(current, data.thread));
      setCurrentThreadDetail((current) =>
        current
          ? {
              ...current,
              status: data.thread?.status || current.status,
              updatedAt: data.thread?.updatedAt || current.updatedAt,
              messageCount: data.thread?.messageCount || current.messageCount,
              messages: data.duplicate
                ? current.messages
                : replaceOptimisticMessage(current.messages, clientMessageId, data.message || optimisticMessage),
            }
          : current,
      );
      setCurrentThreadHasMore(false);
      setCurrentThreadNextCursor(null);
      setStudentReplyTarget(null);
    } catch {
      lastStudentSendRef.current = "";
      setStudentMessage(text);
      setCurrentThreadDetail((current) =>
        current
          ? {
              ...current,
              messageCount: Math.max(0, (current.messageCount || 1) - 1),
              messages: (current.messages || []).filter((message) => message.clientMessageId !== clientMessageId),
            }
          : current,
      );
      if (currentThread) {
        setThreads((current) =>
          current.map((thread) =>
            thread.id === currentThread.id
              ? {
                  ...thread,
                  messageCount: Math.max(0, (thread.messageCount || 1) - 1),
                  latestMessage:
                    thread.latestMessage?.clientMessageId === clientMessageId ? null : thread.latestMessage,
                }
              : thread,
          ),
        );
      }
    } finally {
      studentSendLockRef.current = false;
      setIsStudentSending(false);
    }
  };

  const handleStudentMessageChange = (value) => {
    if (currentThread && messageSignature(currentThread.id, value) !== lastStudentSendRef.current) {
      lastStudentSendRef.current = "";
    }
    setStudentMessage(value);
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
      if (window.location.pathname === "/admin" && !window.location.search) {
        navigateTo(ADMIN_SECTION_PATHS.inquiries);
      }
      await loadAdminData();
    } catch {
      setAdminError("비밀번호가 틀렸습니다.");
      setAdminPassword("");
    }
  };

  const handleAdminReply = async () => {
    const text = adminReply.trim();
    const signature = selectedThread ? messageSignature(selectedThread.id, text) : "";

    if (adminSendLockRef.current || lastAdminSendRef.current === signature || !selectedThread || !text) {
      return;
    }

    adminSendLockRef.current = true;
    lastAdminSendRef.current = signature;
    setIsAdminSending(true);
    const authorLabel = adminName.trim() || "학생회";
    const clientMessageId = crypto.randomUUID();
    const optimisticMessage = {
      id: clientMessageId,
      clientMessageId,
      author: "admin",
      authorLabel,
      createdAt: new Date().toISOString(),
      time: getTimeLabel(),
      text,
      ...(adminReplyTarget ? { replyTo: adminReplyTarget } : {}),
    };
    const optimisticUpdatedAt = new Date().toISOString();
    setAdminReply("");
    setSelectedThreadDetail((current) =>
      current
        ? {
            ...current,
            status: "진행중",
            updatedAt: optimisticUpdatedAt,
            messageCount: (current.messageCount || current.messages?.length || 0) + 1,
            messages: [...(current.messages || []), optimisticMessage],
          }
        : current,
    );
    setThreads((current) =>
      mergeThreadList(current, {
        ...(current.find((thread) => thread.id === selectedThread.id) || selectedThread),
        status: "진행중",
        updatedAt: optimisticUpdatedAt,
        messageCount:
          ((current.find((thread) => thread.id === selectedThread.id) || selectedThread)?.messageCount || 0) + 1,
        latestMessage: optimisticMessage,
      }),
    );

    try {
      const data = await apiRequest(`/api/threads/${selectedThread.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          author: "admin",
          authorLabel,
          text,
          clientMessageId,
          replyTo: adminReplyTarget,
        }),
      });
      setThreads((current) => mergeThreadList(current, data.thread));
      setSelectedThreadDetail((current) =>
        current
          ? {
              ...current,
              status: data.thread?.status || current.status,
              updatedAt: data.thread?.updatedAt || current.updatedAt,
              messageCount: data.thread?.messageCount || current.messageCount,
              messages: data.duplicate
                ? current.messages
                : replaceOptimisticMessage(current.messages, clientMessageId, data.message || optimisticMessage),
            }
          : current,
      );
      setSelectedThreadHasMore(false);
      setSelectedThreadNextCursor(null);
      setAdminReplyTarget(null);
      fetch(`/api/threads/${selectedThread.id}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: false,
          authorLabel,
          clientId: adminClientIdRef.current,
        }),
      }).catch(() => {});
    } catch {
      lastAdminSendRef.current = "";
      setAdminReply(text);
      setSelectedThreadDetail((current) =>
        current
          ? {
              ...current,
              messageCount: Math.max(0, (current.messageCount || 1) - 1),
              messages: (current.messages || []).filter((message) => message.clientMessageId !== clientMessageId),
            }
          : current,
      );
      if (selectedThread) {
        setThreads((current) =>
          current.map((thread) =>
            thread.id === selectedThread.id
              ? {
                  ...thread,
                  messageCount: Math.max(0, (thread.messageCount || 1) - 1),
                  latestMessage:
                    thread.latestMessage?.clientMessageId === clientMessageId ? null : thread.latestMessage,
                }
              : thread,
          ),
        );
      }
    } finally {
      adminSendLockRef.current = false;
      setIsAdminSending(false);
    }
  };

  const handleAdminReplyChange = (value) => {
    if (selectedThread && messageSignature(selectedThread.id, value) !== lastAdminSendRef.current) {
      lastAdminSendRef.current = "";
    }
    setAdminReply(value);
  };

  const handleMessageEditStart = (message) => {
    setMessageEmojiTarget(null);
    setEditingMessageId(message.id);
    setEditingText(message.text);
  };

  const handleMessageEditCancel = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const handleStudentReplyStart = (message) => {
    setActiveMessageMenuId(null);
    setMessageEmojiTarget(null);
    setEditingMessageId(null);
    setEditingText("");
    setStudentReplyTarget(createReplyTarget(message));
    studentComposeRef.current?.focus();
  };

  const handleAdminReplyStart = (message) => {
    setActiveMessageMenuId(null);
    setMessageEmojiTarget(null);
    setEditingMessageId(null);
    setEditingText("");
    setAdminReplyTarget(createReplyTarget(message));
    adminComposeRef.current?.focus();
  };

  const handleEmojiPick = (emoji) => {
    if (!emoji?.emoji) {
      return;
    }

    if (emojiPickerTarget === "student") {
      setStudentMessage((current) => `${current}${emoji.emoji}`);
      studentComposeRef.current?.focus();
    }

    if (emojiPickerTarget === "admin") {
      handleAdminReplyChange(`${adminReply}${emoji.emoji}`);
      adminComposeRef.current?.focus();
    }

    setEmojiPickerTarget(null);
    setEmojiQuery("");
  };

  const handleLoadOlderStudentMessages = async () => {
    if (!currentThreadId || !currentThreadNextCursor || isCurrentThreadLoading) {
      return;
    }

    try {
      setIsCurrentThreadLoading(true);
      const data = await loadThreadMessages(currentThreadId, currentThreadNextCursor);
      setCurrentThreadDetail((current) =>
        current
          ? {
              ...current,
              messageCount: data.thread?.messageCount ?? current.messageCount,
              messages: [...(data.messages || []), ...(current.messages || [])],
            }
          : current,
      );
      setCurrentThreadHasMore(Boolean(data.hasMore));
      setCurrentThreadNextCursor(data.nextCursor || null);
    } finally {
      setIsCurrentThreadLoading(false);
    }
  };

  const handleLoadOlderAdminMessages = async () => {
    if (!selectedThreadId || !selectedThreadNextCursor || isSelectedThreadLoading) {
      return;
    }

    try {
      setIsSelectedThreadLoading(true);
      const data = await loadThreadMessages(selectedThreadId, selectedThreadNextCursor);
      setSelectedThreadDetail((current) =>
        current
          ? {
              ...current,
              messageCount: data.thread?.messageCount ?? current.messageCount,
              messages: [...(data.messages || []), ...(current.messages || [])],
            }
          : current,
      );
      setSelectedThreadHasMore(Boolean(data.hasMore));
      setSelectedThreadNextCursor(data.nextCursor || null);
    } finally {
      setIsSelectedThreadLoading(false);
    }
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
      : { author, authorLabel: adminName.trim() || "학생회", ...extra };

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
      setThreads((current) => mergeThreadList(current, data.thread));
      if (author === "student") {
        setCurrentThreadDetail(data.thread);
      } else {
        setSelectedThreadDetail(data.thread);
      }
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
      setThreads((current) => mergeThreadList(current, data.thread));
      if (author === "student") {
        setCurrentThreadDetail(data.thread);
      } else {
        setSelectedThreadDetail(data.thread);
      }
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

  const handleMessageReaction = async (thread, message, author, emoji) => {
    if (!thread || !message || !emoji) {
      return;
    }

    const reactorKey = createReactionActorKey({
      author,
      authorLabel: adminName.trim() || "학생회",
      profile: studentProfile,
    });
    const optimisticMessage = toggleReactionState(message, emoji, reactorKey);

    setThreads((current) => mergeThreadList(current, thread));
    if (author === "student") {
      setCurrentThreadDetail((current) =>
        current?.id === thread.id ? mergeUpdatedMessageIntoDetail(current, optimisticMessage) : current,
      );
    } else {
      setSelectedThreadDetail((current) =>
        current?.id === thread.id ? mergeUpdatedMessageIntoDetail(current, optimisticMessage) : current,
      );
    }

    try {
      const data = await apiRequest(`/api/threads/${thread.id}/messages/${message.id}/reactions`, {
        method: "POST",
        body: JSON.stringify(getMessagePayload(author, { emoji })),
      });
      setThreads((current) => mergeThreadList(current, data.thread));
      if (author === "student") {
        setCurrentThreadDetail(data.thread);
      } else {
        setSelectedThreadDetail(data.thread);
      }
      setActiveMessageMenuId(null);
      setMessageEmojiTarget(null);
      setEmojiQuery("");
    } catch {
      if (author === "student") {
        setCurrentThreadDetail((current) =>
          current?.id === thread.id ? mergeUpdatedMessageIntoDetail(current, message) : current,
        );
      } else {
        setSelectedThreadDetail((current) =>
          current?.id === thread.id ? mergeUpdatedMessageIntoDetail(current, message) : current,
        );
      }
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

  const handleDaiSuSettingsChange = async (patch) => {
    const current = daiSuAssistant || {};
    const next = { ...current, ...patch };
    setDaiSuAssistant(next);

    try {
      const data = await apiRequest("/api/daisu/settings", {
        method: "PUT",
        body: JSON.stringify(next),
      });
      setDaiSuAssistant(data.assistant || next);
    } catch {
      setDaiSuAssistant(current);
    }
  };

  const handleDaiSuDocumentSubmit = async (event) => {
    event.preventDefault();

    const payload = {
      title: daiSuDocumentForm.title.trim(),
      category: daiSuDocumentForm.category.trim(),
      tags: daiSuDocumentForm.tags,
      keywords: daiSuDocumentForm.keywords,
      content: daiSuDocumentForm.content.trim(),
      status: daiSuDocumentForm.status,
    };

    if (!payload.title || !payload.content) {
      return;
    }

    const path = editingDaiSuDocumentId
      ? `/api/daisu/documents/${editingDaiSuDocumentId}`
      : "/api/daisu/documents";
    const method = editingDaiSuDocumentId ? "PATCH" : "POST";

    const data = await apiRequest(path, {
      method,
      body: JSON.stringify(payload),
    });

    setDaiSuDocuments(data.documents || []);
    setDaiSuDocumentForm(emptyDaiSuDocumentForm);
    setEditingDaiSuDocumentId("");
  };

  const handleDaiSuDocumentEdit = (document) => {
    setEditingDaiSuDocumentId(document.id);
    setDaiSuDocumentForm({
      title: document.title || "",
      category: document.category || "",
      tags: (document.tags || []).join(", "),
      keywords: (document.keywords || []).join(", "),
      content: document.content || "",
      status: document.status || "draft",
    });
  };

  const handleDaiSuDocumentDelete = async (documentId) => {
    const data = await apiRequest(`/api/daisu/documents/${documentId}`, {
      method: "DELETE",
    });
    setDaiSuDocuments(data.documents || []);
    if (editingDaiSuDocumentId === documentId) {
      setEditingDaiSuDocumentId("");
      setDaiSuDocumentForm(emptyDaiSuDocumentForm);
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

  const handleProfileRequestReview = async (requestId, status) => {
    try {
      const data = await apiRequest(`/api/profile-requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setProfileRequests(data.requests || []);
      setStudents(data.students || []);
      setThreads(toThreadSummaries(data.threads));
    } catch {
      await loadAdminData();
    }
  };

  const handleCreateStudentChat = async (event) => {
    event.preventDefault();

    if (!selectedStudent || !adminStudentMessage.trim()) {
      return;
    }

    try {
      const data = await apiRequest("/api/admin/student-chat", {
        method: "POST",
        body: JSON.stringify({
          studentId: selectedStudent.studentId,
          name: selectedStudent.name,
          authorLabel: adminName.trim() || "학생회",
          message: adminStudentMessage.trim(),
        }),
      });
      setThreads((current) => mergeThreadList(current, data.thread));
      setSelectedThreadDetail(data.thread);
      setSelectedThreadHasMore(false);
      setSelectedThreadNextCursor(null);
      setSelectedThreadId(data.thread.id);
      navigateTo(getAdminThreadPath(data.thread.id));
      setAdminStudentMessage("");
    } catch {
      setAdminStudentMessage("");
    }
  };

  const handleToggleBan = async (student, banned) => {
    if (!student) {
      return;
    }

    try {
      const data = await apiRequest("/api/admin/students/ban", {
        method: "POST",
        body: JSON.stringify({
          studentId: student.studentId,
          name: student.name,
          banned,
          reason: banned ? banReason.trim() : "",
        }),
      });
      setStudents(data.students || []);
      setBanReason("");
    } catch {
      // keep the reason input so the admin can retry
    }
  };

  const openConfirmDialog = ({ title, message, confirmLabel = "예", onConfirm }) => {
    setConfirmDialog({ title, message, confirmLabel, onConfirm });
  };

  const closeConfirmDialog = () => setConfirmDialog(null);

  const openBanDialog = (student) => {
    setBanReason("");
    setBanDialogStudent(student);
  };

  const closeBanDialog = () => setBanDialogStudent(null);

  const confirmBan = () => {
    if (banDialogStudent) {
      handleToggleBan(banDialogStudent, true);
    }
    setBanDialogStudent(null);
  };

  const confirmUnban = (student) => {
    openConfirmDialog({
      title: "차단 해제",
      message: `${student.name} 학생의 차단을 해제하시겠습니까?`,
      confirmLabel: "차단 해제",
      onConfirm: () => handleToggleBan(student, false),
    });
  };

  const confirmTagDelete = (tag) => {
    openConfirmDialog({
      title: "태그 삭제",
      message: `"${tag.name}"을 삭제하시겠습니까? 삭제해도 기존 문의의 태그명은 기록으로 남습니다.`,
      confirmLabel: "삭제",
      onConfirm: () => handleDeleteTag(tag.id),
    });
  };

  const handleReopenThread = async (thread) => {
    try {
      const data = await apiRequest(`/api/threads/${thread.id}/reopen`, {
        method: "POST",
        body: JSON.stringify({
          studentId: studentProfile?.studentId,
          name: studentProfile?.name,
          pin: studentProfile?.pin,
        }),
      });
      setThreads((current) => mergeThreadList(current, data.thread));
      setCurrentThreadDetail((current) =>
        current?.id === data.thread.id ? { ...current, status: data.thread.status } : current,
      );
    } catch {
      saveThreadsFallback((current) =>
        current.map((item) =>
          item.id === thread.id ? { ...item, status: "진행중", updatedAt: new Date().toISOString() } : item,
        ),
      );
    }
  };

  const confirmReopenThread = (thread) => {
    openConfirmDialog({
      title: "대화를 다시 이어갈까요?",
      message: "완료된 문의를 다시 진행중으로 바꾸고 대화를 이어갈 수 있습니다.",
      confirmLabel: "예, 이어갈게요",
      onConfirm: () => handleReopenThread(thread),
    });
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
      setThreads((current) => mergeThreadList(current, data.thread));
      setSelectedThreadDetail((current) =>
        current?.id === data.thread.id ? { ...current, status: data.thread.status } : current,
      );
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
      <>
        <AdminScreen
          adminAuthed={adminAuthed}
          adminError={adminError}
          adminFilter={adminFilter}
          adminName={adminName}
          adminPassword={adminPassword}
          adminReply={adminReply}
          adminReplyTarget={adminReplyTarget}
          adminSection={adminSection}
          adminTagFilter={adminTagFilter}
          adminStudentMessage={adminStudentMessage}
          handleCreateTag={handleCreateTag}
          handleAdminLogin={handleAdminLogin}
          handleAdminReply={handleAdminReply}
          handleAdminStatusChange={handleAdminStatusChange}
          handleAdminReplyStart={handleAdminReplyStart}
          handleLoadOlderMessages={handleLoadOlderAdminMessages}
          handleEmojiPick={handleEmojiPick}
          handleCreateStudentChat={handleCreateStudentChat}
          onOpenBanDialog={openBanDialog}
          onUnban={confirmUnban}
          handleDeleteTag={handleDeleteTag}
          handleDaiSuDocumentDelete={handleDaiSuDocumentDelete}
          handleDaiSuDocumentEdit={handleDaiSuDocumentEdit}
          handleDaiSuDocumentSubmit={handleDaiSuDocumentSubmit}
          handleDaiSuSettingsChange={handleDaiSuSettingsChange}
          handleMessageDelete={handleMessageDelete}
          handleMessageEditCancel={handleMessageEditCancel}
          handleMessageEditStart={handleMessageEditStart}
          handleMessageUpdate={handleMessageUpdate}
          handleProfileRequestReview={handleProfileRequestReview}
          editingMessageId={editingMessageId}
          editingText={editingText}
          activeMessageMenuId={activeMessageMenuId}
          isAdminSending={isAdminSending}
          isEmojiLoading={isEmojiLoading}
          isLoadingMessages={isSelectedThreadLoading}
          pendingProfileRequests={pendingProfileRequests}
          navigateTo={navigateTo}
          realtimeStatus={realtimeStatus}
          emojiPickerTarget={emojiPickerTarget}
          emojiQuery={emojiQuery}
          emojiResults={emojiResults}
          messageEmojiTarget={messageEmojiTarget}
          daiSuAnswerLogs={daiSuAnswerLogs}
          daiSuAssistant={daiSuAssistant}
          daiSuDocumentForm={daiSuDocumentForm}
          daiSuDocuments={daiSuDocuments}
          selectedThreadTyping={selectedThreadTyping}
          selectedThread={selectedThread}
          selectedThreadId={selectedThreadId}
          selectedStudent={selectedStudent}
          selectedStudentKey={selectedStudentKey}
          hasMoreMessages={selectedThreadHasMore}
          adminComposeRef={adminComposeRef}
          setAdminFilter={setAdminFilter}
          setAdminName={setAdminName}
          setAdminPassword={setAdminPassword}
          setAdminReply={handleAdminReplyChange}
          setAdminReplyTarget={setAdminReplyTarget}
          setAdminSection={setAdminSection}
          setAdminTagFilter={setAdminTagFilter}
          setAdminStudentMessage={setAdminStudentMessage}
          setActiveMessageMenuId={setActiveMessageMenuId}
          setEditingText={setEditingText}
          setEmojiPickerTarget={setEmojiPickerTarget}
          setEmojiQuery={setEmojiQuery}
          setMessageEmojiTarget={setMessageEmojiTarget}
          setDaiSuDocumentForm={setDaiSuDocumentForm}
          setEditingDaiSuDocumentId={setEditingDaiSuDocumentId}
          setSelectedThreadId={setSelectedThreadId}
          setSelectedStudentKey={setSelectedStudentKey}
          setTagName={setTagName}
          statusCounts={statusCounts}
          studentThreadCounts={studentThreadCounts}
          students={students}
          tagCounts={tagCounts}
          tagName={tagName}
          tags={tags}
          editingDaiSuDocumentId={editingDaiSuDocumentId}
          onRequestDeleteTag={confirmTagDelete}
          profileRequests={profileRequests}
          threads={filteredAdminThreads}
          typingThreadIds={typingThreadIds}
        />
        {confirmDialog && (
          <ConfirmDialog
            confirmLabel={confirmDialog.confirmLabel}
            message={confirmDialog.message}
            onCancel={closeConfirmDialog}
            onConfirm={() => {
              confirmDialog.onConfirm();
              closeConfirmDialog();
            }}
            title={confirmDialog.title}
          />
        )}
        {banDialogStudent && (
          <BanDialog
            student={banDialogStudent}
            reason={banReason}
            setReason={setBanReason}
            onCancel={closeBanDialog}
            onConfirm={confirmBan}
          />
        )}
      </>
    );
  }

  return (
    <main className="public-page">
      <header className="public-header">
        <button className="public-brand" onClick={() => navigateTo("/")} type="button">
          <span className="wordmark-symbol" aria-hidden="true">C</span>
          <strong>Council Talk</strong>
        </button>
        <nav aria-label="사용자 메뉴">
          <button className={route === "/" ? "active" : ""} onClick={() => navigateTo("/")} type="button">
            홈
          </button>
          <button className={route.startsWith("/support") ? "active" : ""} onClick={openSupport} type="button">
            문의하기
          </button>
          <button className={route === "/mypage" ? "active" : ""} onClick={openProfilePage} type="button">
            마이페이지
          </button>
        </nav>
      </header>

      {publicView === "home" ? (
        <section className="logo-stage" aria-label="Council Talk">
          <div className="wordmark">
            <span className="wordmark-symbol" aria-hidden="true">C</span>
            <h1>Council Talk</h1>
          </div>
          <button className="support-launcher" onClick={openSupport} type="button">
            <MessageCircle size={18} />
            문의하기
          </button>
        </section>
      ) : (
        <ProfilePage
          handleStudentEmailUpdate={handleStudentEmailUpdate}
          handleProfileChangeRequest={handleProfileChangeRequest}
          profileChangeForm={profileChangeForm}
          profileChangeMessage={profileChangeMessage}
          resetStudentProfile={resetStudentProfile}
          setProfileChangeForm={setProfileChangeForm}
          setStudentEmail={setStudentEmail}
          studentEmail={studentEmail}
          studentEmailMessage={studentEmailMessage}
          studentProfile={studentProfile}
          studentThreads={studentThreads}
        />
      )}

      {isSupportOpen && !studentProfile && (
        <StudentAuthModal
          authTarget={authTarget}
          authMode={authMode}
          handleIdentifyStudent={handleIdentifyStudent}
          identityError={identityError}
          identityForm={identityForm}
          setAuthMode={setAuthMode}
          setIdentityError={setIdentityError}
          setIdentityForm={setIdentityForm}
          setIsSupportOpen={closeSupport}
        />
      )}

      {isSupportOpen && studentProfile && (
        <SupportPanel
          currentThread={currentThread}
          editingMessageId={editingMessageId}
          editingText={editingText}
          form={form}
          handleCreateThread={handleCreateThread}
          createThreadError={createThreadError}
          handleMessageDelete={handleMessageDelete}
          handleMessageEditCancel={handleMessageEditCancel}
          handleMessageEditStart={handleMessageEditStart}
          handleMessageUpdate={handleMessageUpdate}
          handleStudentReplyStart={handleStudentReplyStart}
          handleLoadOlderMessages={handleLoadOlderStudentMessages}
          handleEmojiPick={handleEmojiPick}
          activeMessageMenuId={activeMessageMenuId}
          onRequestReopenThread={confirmReopenThread}
          emojiPickerTarget={emojiPickerTarget}
          emojiQuery={emojiQuery}
          emojiResults={emojiResults}
          messageEmojiTarget={messageEmojiTarget}
          handleStudentSend={handleStudentSend}
          isEmojiLoading={isEmojiLoading}
          isLoadingMessages={isCurrentThreadLoading}
          isStudentSending={isStudentSending}
          navigateTo={navigateTo}
          resetStudentProfile={resetStudentProfile}
          setActiveMessageMenuId={setActiveMessageMenuId}
          setCurrentThreadId={setCurrentThreadId}
          setEditingText={setEditingText}
          setForm={setForm}
          setIsSupportOpen={closeSupport}
          setSupportView={setSupportView}
          setEmojiPickerTarget={setEmojiPickerTarget}
          setEmojiQuery={setEmojiQuery}
          setMessageEmojiTarget={setMessageEmojiTarget}
          setStudentMessage={handleStudentMessageChange}
          setStudentReplyTarget={setStudentReplyTarget}
          isCreatingThread={isCreatingThread}
          studentProfile={studentProfile}
          studentReplyTarget={studentReplyTarget}
          studentThreads={studentThreads}
          studentMessage={studentMessage}
          studentComposeRef={studentComposeRef}
          hasMoreMessages={currentThreadHasMore}
          supportView={supportView}
          tags={tags}
        />
      )}

      {studentProfile && !studentProfile.email && (
        <RequiredEmailModal
          handleStudentEmailUpdate={handleStudentEmailUpdate}
          resetStudentProfile={resetStudentProfile}
          setStudentEmail={setStudentEmail}
          studentEmail={studentEmail}
          studentEmailMessage={studentEmailMessage}
          studentProfile={studentProfile}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          confirmLabel={confirmDialog.confirmLabel}
          message={confirmDialog.message}
          onCancel={closeConfirmDialog}
          onConfirm={() => {
            confirmDialog.onConfirm();
            closeConfirmDialog();
          }}
          title={confirmDialog.title}
        />
      )}
    </main>
  );
}

function ProfilePage({
  handleStudentEmailUpdate,
  handleProfileChangeRequest,
  profileChangeForm,
  profileChangeMessage,
  resetStudentProfile,
  setProfileChangeForm,
  setStudentEmail,
  studentEmail,
  studentEmailMessage,
  studentProfile,
  studentThreads,
}) {
  return (
    <section className="profile-page" aria-label="마이페이지">
      <div className="profile-hero">
        <p>My Page</p>
        <h2>내 정보 관리</h2>
        <span>이름과 학번 변경은 학생회 승인 후 적용됩니다.</span>
      </div>

      <div className="profile-layout">
        <section className="profile-big-card">
          <span>현재 로그인</span>
          <strong>{studentProfile?.name}</strong>
          <p>{studentProfile?.studentId}</p>
          <div>
            <small>문의방</small>
            <b>{studentThreads.length}개</b>
          </div>
        </section>

        <form className="profile-change-card" onSubmit={handleProfileChangeRequest}>
          <div>
            <p>Profile Change</p>
            <h3>이름·학번 변경 신청</h3>
          </div>

          <label>
            변경할 이름
            <input
              value={profileChangeForm.name}
              onChange={(event) =>
                setProfileChangeForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="홍길동"
            />
          </label>

          <label>
            변경할 학번
            <input
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              value={profileChangeForm.studentId}
              onChange={(event) =>
                setProfileChangeForm((current) => ({
                  ...current,
                  studentId: event.target.value.replace(/\D/g, "").slice(0, 4),
                }))
              }
              placeholder="3105"
            />
          </label>

          {profileChangeMessage && <p className="profile-message">{profileChangeMessage}</p>}

          <div className="profile-actions">
            <button className="black-button" type="submit">
              변경 신청하기
            </button>
            <button className="ghost-button" onClick={resetStudentProfile} type="button">
              로그아웃
            </button>
          </div>
        </form>

        <form className="profile-email-card" onSubmit={handleStudentEmailUpdate}>
          <div>
            <p>Reply Notification</p>
            <h3>답변 알림 이메일</h3>
            <span>학생회 답변이 오면 등록한 이메일로 알려드립니다.</span>
          </div>

          <label>
            이메일
            <input
              required
              type="email"
              value={studentEmail}
              onChange={(event) => setStudentEmail(event.target.value)}
              placeholder="student@example.com"
            />
          </label>

          {studentEmailMessage && <p className="profile-message">{studentEmailMessage}</p>}

          <div className="profile-actions">
            <button className="black-button" type="submit">
              이메일 저장
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function RequiredEmailModal({
  handleStudentEmailUpdate,
  resetStudentProfile,
  setStudentEmail,
  studentEmail,
  studentEmailMessage,
  studentProfile,
}) {
  return (
    <div className="modal-backdrop required-email-backdrop" role="presentation">
      <form className="student-auth-modal required-email-modal" onSubmit={handleStudentEmailUpdate}>
        <header>
          <div>
            <span className="mini-logo">C</span>
            <h2>이메일 등록 안내</h2>
          </div>
        </header>

        <p>
          {studentProfile.name}님, 학생회 답변 알림을 받을 이메일을 등록해주세요.
          앞으로 문의 답변이 오면 이 이메일로 알림을 보내드립니다.
        </p>

        <label>
          이메일
          <input
            autoFocus
            required
            type="email"
            value={studentEmail}
            onChange={(event) => setStudentEmail(event.target.value)}
            placeholder="student@example.com"
          />
        </label>

        {studentEmailMessage && <p className="profile-message">{studentEmailMessage}</p>}

        <div className="auth-actions">
          <button className="ghost-button" onClick={resetStudentProfile} type="button">
            로그아웃
          </button>
          <button className="black-button" type="submit">
            이메일 저장
          </button>
        </div>
      </form>
    </div>
  );
}

function StudentAuthModal({
  authTarget,
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
            ? "처음 이용하는 경우 학번, 이메일, 4자리 비밀번호를 등록해주세요."
            : authTarget === "profile"
              ? "이름과 비밀번호를 입력하면 마이페이지로 이동합니다."
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

        {isSignup && (
          <label className="auth-field-enter">
            이메일
            <input
              required
              type="email"
              value={identityForm.email}
              onChange={(event) =>
                setIdentityForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="student@example.com"
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

        <div className="auth-switch-copy">
          <span>{isSignup ? "이미 계정이 있다면" : "처음 이용한다면"}</span>
          <button
            className="auth-mode-button"
            onClick={() => switchMode(isSignup ? "login" : "signup")}
            type="button"
          >
            {isSignup ? "로그인으로 돌아가기" : "회원가입하기"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmDialog({ confirmLabel, message, onCancel, onConfirm, title }) {
  return (
    <div className="modal-backdrop confirm-backdrop" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <p>{message}</p>
        <div>
          <button className="ghost-button" onClick={onCancel} type="button">
            아니요
          </button>
          <button className="black-button" onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function BanDialog({ student, reason, setReason, onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop confirm-backdrop" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-label="학생 차단">
        <h2>학생을 차단할까요?</h2>
        <p>
          {student.name} ({student.studentId}) 학생을 차단하면 새 문의 작성과 메시지 전송이
          제한됩니다. 기존 문의 내용은 계속 볼 수 있습니다.
        </p>
        <label className="ban-dialog-reason">
          차단 사유
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="차단 사유를 입력하세요 (학생에게 표시됩니다)"
            rows={3}
          />
        </label>
        <div>
          <button className="ghost-button" onClick={onCancel} type="button">
            취소
          </button>
          <button className="danger-button" onClick={onConfirm} type="button">
            차단하기
          </button>
        </div>
      </section>
    </div>
  );
}

function SupportPanel({
  createThreadError,
  currentThread,
  editingMessageId,
  emojiPickerTarget,
  emojiQuery,
  emojiResults,
  messageEmojiTarget,
  editingText,
  activeMessageMenuId,
  handleEmojiPick,
  handleLoadOlderMessages,
  handleStudentReplyStart,
  form,
  handleCreateThread,
  handleMessageDelete,
  handleMessageEditCancel,
  handleMessageEditStart,
  handleMessageUpdate,
  handleStudentSend,
  hasMoreMessages,
  isEmojiLoading,
  isLoadingMessages,
  isCreatingThread,
  isStudentSending,
  navigateTo,
  onRequestReopenThread,
  resetStudentProfile,
  setActiveMessageMenuId,
  setCurrentThreadId,
  setEditingText,
  setEmojiPickerTarget,
  setEmojiQuery,
  setMessageEmojiTarget,
  setForm,
  setIsSupportOpen,
  setSupportView,
  setStudentMessage,
  setStudentReplyTarget,
  studentProfile,
  studentReplyTarget,
  studentThreads,
  studentMessage,
  studentComposeRef,
  supportView,
  tags,
}) {
  const isBanned = Boolean(studentProfile?.banned);
  const banReason = studentProfile?.banReason || "";

  const openNewInquiry = () => {
    setCurrentThreadId(null);
    setStudentReplyTarget(null);
    // Do NOT navigate to "/support" here. The panel is already open on this view,
    // and changing the route would re-trigger the route-sync effect that forces
    // supportView back to "rooms", preventing the new-inquiry form from opening.
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
            onClick={() => {
              setCurrentThreadId(null);
              setStudentReplyTarget(null);
              setSupportView("rooms");
              navigateTo("/support");
            }}
            type="button"
          >
            <ArrowLeft size={22} />
          </button>
        )}
        <button
          aria-label="닫기"
          className="icon-button"
          onClick={() => {
            setStudentReplyTarget(null);
            setIsSupportOpen(false);
          }}
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
                  setStudentReplyTarget(null);
                  setCurrentThreadId(thread.id);
                  setSupportView("chat");
                  navigateTo(getSupportThreadPath(thread.id));
                }}
                type="button"
              >
                <strong>{thread.title}</strong>
                <span>{thread.latestMessage?.text || "문의 내용 없음"}</span>
                <small>{thread.status}</small>
              </button>
            ))}
          </div>

          {isBanned ? (
            <div className="ban-notice">
              <strong>관리자에 의해 차단되었습니다.</strong>
              <span>새 문의 작성과 메시지 전송이 제한됩니다. 기존 문의 내용은 계속 확인할 수 있습니다.</span>
              {banReason && <em>사유: {banReason}</em>}
            </div>
          ) : (
            <button className="new-room-button" onClick={openNewInquiry} type="button">
              <Plus size={18} />
              새 문의하기
            </button>
          )}
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

          <button className="black-button" disabled={isCreatingThread} type="submit">
            {isCreatingThread ? "문의방 만드는 중..." : "문의 등록"}
          </button>
          {createThreadError && <p className="form-error">{createThreadError}</p>}
        </form>
      )}

      {supportView === "chat" && currentThread && (
        <>
          <div className="conversation-title">
            <button
              className="back-to-rooms"
              onClick={() => {
                setStudentReplyTarget(null);
                setSupportView("rooms");
              }}
              type="button"
            >
              문의방 목록
            </button>
            <strong>{currentThread.title}</strong>
            <span>{currentThread.status}</span>
            {currentThread.tagName && <em>{currentThread.tagName}</em>}
          </div>

          {normalizeStatus(currentThread.status) === "완료" && !isBanned && (
            <div className="completed-chat-notice">
              <strong>완료된 채팅입니다.</strong>
              <span>학생회에서 문의를 완료 처리했습니다. 이어서 대화하려면 다시 열어주세요.</span>
              <button onClick={() => onRequestReopenThread(currentThread)} type="button">
                대화 다시 하기
              </button>
            </div>
          )}

          <div className="messages">
            {hasMoreMessages && (
              <button
                className="load-more-messages"
                disabled={isLoadingMessages}
                onClick={handleLoadOlderMessages}
                type="button"
              >
                {isLoadingMessages ? "이전 메시지 불러오는 중..." : "이전 메시지 더 보기"}
              </button>
            )}
            {(currentThread.messages || []).map((message) => (
              <MessageBubble
                actor="student"
                canManage={!isBanned}
                editingMessageId={editingMessageId}
                editingText={editingText}
                key={message.id}
                message={message}
                activeMessageMenuId={activeMessageMenuId}
                activeReactionPickerId={messageEmojiTarget}
                onCancelEdit={handleMessageEditCancel}
                onChangeEdit={setEditingText}
                onDelete={() => handleMessageDelete(currentThread, message, "student")}
                onReact={(emoji) => handleMessageReaction(currentThread, message, "student", emoji)}
                onReply={() => handleStudentReplyStart(message)}
                onSaveEdit={() => handleMessageUpdate(currentThread, message, "student")}
                setActiveMessageMenuId={setActiveMessageMenuId}
                setMessageEmojiTarget={setMessageEmojiTarget}
                onStartEdit={() => handleMessageEditStart(message)}
                emojiResults={emojiResults}
                isEmojiLoading={isEmojiLoading}
                onEmojiQueryChange={setEmojiQuery}
                emojiQuery={emojiQuery}
                reactionActorKey={createReactionActorKey({
                  author: "student",
                  profile: studentProfile,
                })}
              />
            ))}
          </div>

          {isBanned ? (
            <div className="support-compose locked">
              차단되어 메시지를 보낼 수 없습니다.{banReason && ` (사유: ${banReason})`}
            </div>
          ) : normalizeStatus(currentThread.status) === "완료" ? (
            <div className="support-compose locked">
              완료된 채팅이라 메시지를 보낼 수 없습니다.
            </div>
          ) : (
            <div className="support-compose">
              {studentReplyTarget && (
                <ReplyPreviewBar
                  replyTarget={studentReplyTarget}
                  onClear={() => setStudentReplyTarget(null)}
                />
              )}
              <button
                aria-label="이모지"
                className="plus-button"
                onClick={() => {
                  setEmojiQuery("");
                  setEmojiPickerTarget(emojiPickerTarget === "student" ? null : "student");
                }}
                type="button"
              >
                <Smile size={18} />
              </button>
              {emojiPickerTarget === "student" && (
                <EmojiPicker
                  emojis={emojiResults}
                  isLoading={isEmojiLoading}
                  onPick={handleEmojiPick}
                  onQueryChange={setEmojiQuery}
                  query={emojiQuery}
                />
              )}
              <textarea
                ref={studentComposeRef}
                value={studentMessage}
                onChange={(event) => setStudentMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (!isStudentSending) {
                      handleStudentSend();
                    }
                  }
                }}
                disabled={isStudentSending}
                placeholder="추가 문의를 입력하세요..."
                rows={1}
              />
              <button
                aria-label="전송"
                className="round-send"
                disabled={isStudentSending || !studentMessage.trim()}
                onClick={handleStudentSend}
                type="button"
              >
                <ArrowUp size={22} />
              </button>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function TagAdminPanel({
  handleCreateTag,
  handleDeleteTag,
  onRequestDeleteTag,
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
            <button onClick={() => onRequestDeleteTag(tag)} type="button">
              <Trash2 size={15} />
              삭제
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}

function StudentAdminPanel({
  adminName,
  adminStudentMessage,
  handleCreateStudentChat,
  onOpenBanDialog,
  onUnban,
  selectedStudent,
  setAdminStudentMessage,
  studentThreadCount,
  students,
}) {
  return (
    <div className="student-admin-page">
      <header>
        <div>
          <p>Student Manager</p>
          <h2>학생 관리</h2>
        </div>
        <span>{students.length}명</span>
      </header>

      {selectedStudent ? (
        <section className="student-detail-card">
          <div className="student-detail-head">
            <div>
              <span>선택한 학생</span>
              <h3>
                {selectedStudent.name}
                {selectedStudent.banned && <em className="ban-badge">차단됨</em>}
              </h3>
              <p>{selectedStudent.studentId} · {studentThreadCount}개 대화</p>
              {selectedStudent.banned && (
                <p className="ban-current-reason">
                  차단 사유: {selectedStudent.banReason || "사유 없음"}
                </p>
              )}
            </div>
            {selectedStudent.banned ? (
              <button
                className="text-ban-button"
                onClick={() => onUnban(selectedStudent)}
                type="button"
              >
                차단 해제
              </button>
            ) : (
              <button
                className="text-ban-button danger"
                onClick={() => onOpenBanDialog(selectedStudent)}
                type="button"
              >
                차단하기
              </button>
            )}
          </div>

          <form onSubmit={handleCreateStudentChat}>
            <label>
              1:1 대화 시작 메시지
              <textarea
                value={adminStudentMessage}
                onChange={(event) => setAdminStudentMessage(event.target.value)}
                placeholder={`${adminName || "학생회"} 이름으로 먼저 말을 걸 수 있습니다.`}
                rows={5}
              />
            </label>
            <button className="black-button" type="submit">
              1:1 채팅 만들기
            </button>
          </form>
        </section>
      ) : (
        <div className="empty-conversation">학생을 선택하세요.</div>
      )}
    </div>
  );
}

function ProfileRequestAdminPanel({ handleProfileRequestReview, profileRequests }) {
  const pending = profileRequests.filter((request) => request.status === "대기");
  const reviewed = profileRequests.filter((request) => request.status !== "대기");

  return (
    <div className="profile-request-page">
      <header>
        <div>
          <p>Profile Requests</p>
          <h2>이름·학번 변경 신청</h2>
        </div>
        <span>{pending.length}건 대기</span>
      </header>

      <section className="request-card-list">
        {pending.length === 0 && <p className="empty-copy">대기 중인 변경 신청이 없습니다.</p>}
        {pending.map((request) => (
          <article className="request-card" key={request.id}>
            <div>
              <strong>{request.name}</strong>
              <span>{request.studentId}</span>
            </div>
            <p>
              {request.newName} · {request.newStudentId} 으로 변경을 신청했습니다.
            </p>
            <div>
              <button onClick={() => handleProfileRequestReview(request.id, "거절")} type="button">
                거절
              </button>
              <button onClick={() => handleProfileRequestReview(request.id, "승인")} type="button">
                승인
              </button>
            </div>
          </article>
        ))}
      </section>

      {reviewed.length > 0 && (
        <section className="reviewed-request-list">
          <h3>처리된 신청</h3>
          {reviewed.slice(0, 8).map((request) => (
            <p key={request.id}>
              <strong>{request.status}</strong>
              {request.name} · {request.studentId} → {request.newName} · {request.newStudentId}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

function NotificationAdminPanel({
}) {
  return null;
}

function DaiSuAdminPanel({
  answerLogs,
  assistant,
  documentForm,
  documents,
  editingDocumentId,
  handleDocumentDelete,
  handleDocumentEdit,
  handleDocumentSubmit,
  handleSettingsChange,
  setDocumentForm,
  setEditingDocumentId,
}) {
  return (
    <div className="daisu-admin-page">
      <section className="daisu-card">
        <header>
          <div>
            <p>DaiSu Assistant</p>
            <h2>따이수 설정</h2>
          </div>
        </header>
        <label>
          이름
          <input
            value={assistant?.name || ""}
            onChange={(event) => handleSettingsChange({ name: event.target.value })}
          />
        </label>
        <label>
          소개
          <textarea
            rows={2}
            value={assistant?.description || ""}
            onChange={(event) => handleSettingsChange({ description: event.target.value })}
          />
        </label>
        <label>
          말투
          <textarea
            rows={2}
            value={assistant?.tone || ""}
            onChange={(event) => handleSettingsChange({ tone: event.target.value })}
          />
        </label>
        <label>
          fallback 답변
          <textarea
            rows={3}
            value={assistant?.fallbackMessage || ""}
            onChange={(event) => handleSettingsChange({ fallbackMessage: event.target.value })}
          />
        </label>
        <label className="toggle-line">
          <input
            checked={Boolean(assistant?.autoReplyEnabled)}
            onChange={(event) => handleSettingsChange({ autoReplyEnabled: event.target.checked })}
            type="checkbox"
          />
          자동응답 사용
        </label>
        <label>
          자동응답 태그 필터
          <input
            value={(assistant?.autoReplyTags || []).join(", ")}
            onChange={(event) => handleSettingsChange({ autoReplyTags: event.target.value })}
            placeholder="예: 학사, 장학, tag-id"
          />
        </label>
        <label>
          최소 신뢰도
          <input
            max="50"
            min="1"
            type="number"
            value={assistant?.confidenceThreshold || 6}
            onChange={(event) => handleSettingsChange({ confidenceThreshold: Number(event.target.value) })}
          />
        </label>
        <label>
          답변 가드레일
          <textarea
            rows={4}
            value={(assistant?.guardrails || []).join("\n")}
            onChange={(event) => handleSettingsChange({ guardrails: event.target.value })}
            placeholder="한 줄에 하나씩 입력"
          />
        </label>
      </section>

      <section className="daisu-card">
        <header>
          <div>
            <p>Knowledge Base</p>
            <h2>지식 문서</h2>
          </div>
        </header>
        <form className="daisu-document-form" onSubmit={handleDocumentSubmit}>
          <label>
            제목
            <input
              value={documentForm.title}
              onChange={(event) => setDocumentForm((current) => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label>
            카테고리
            <input
              value={documentForm.category}
              onChange={(event) => setDocumentForm((current) => ({ ...current, category: event.target.value }))}
            />
          </label>
          <label>
            태그
            <input
              value={documentForm.tags}
              onChange={(event) => setDocumentForm((current) => ({ ...current, tags: event.target.value }))}
              placeholder="쉼표로 구분"
            />
          </label>
          <label>
            키워드
            <input
              value={documentForm.keywords}
              onChange={(event) => setDocumentForm((current) => ({ ...current, keywords: event.target.value }))}
              placeholder="쉼표로 구분"
            />
          </label>
          <label>
            상태
            <select
              value={documentForm.status}
              onChange={(event) => setDocumentForm((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <label>
            본문
            <textarea
              rows={8}
              value={documentForm.content}
              onChange={(event) => setDocumentForm((current) => ({ ...current, content: event.target.value }))}
            />
          </label>
          <div className="daisu-form-actions">
            <button className="black-button" type="submit">
              {editingDocumentId ? "문서 수정" : "문서 추가"}
            </button>
            {editingDocumentId && (
              <button
                className="ghost-button"
                onClick={() => {
                  setEditingDocumentId("");
                  setDocumentForm(emptyDaiSuDocumentForm);
                }}
                type="button"
              >
                취소
              </button>
            )}
          </div>
        </form>

        <div className="daisu-document-list">
          {documents.map((document) => (
            <article className="daisu-document-item" key={document.id}>
              <div>
                <strong>{document.title}</strong>
                <span>
                  {document.category || "미분류"} · {document.status}
                </span>
                <p>{document.content}</p>
              </div>
              <div className="daisu-document-actions">
                <button onClick={() => handleDocumentEdit(document)} type="button">
                  수정
                </button>
                <button onClick={() => handleDocumentDelete(document.id)} type="button">
                  삭제
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="daisu-card">
        <header>
          <div>
            <p>Answer Log</p>
            <h2>자동응답 기록</h2>
          </div>
        </header>
        <div className="daisu-log-list">
          {answerLogs.length === 0 && <p className="empty-copy">아직 따이수 답변 기록이 없습니다.</p>}
          {answerLogs.map((log) => (
            <article className="daisu-log-item" key={log.id}>
              <strong>{log.mode}</strong>
              <span>thread: {log.threadId}</span>
              <span>score: {log.score}</span>
              <small>{log.matchedDocumentIds.join(", ") || "근거 문서 없음"}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReplyPreviewBar({ onClear, replyTarget }) {
  return (
    <div className="reply-preview-bar">
      <div>
        <strong>{replyTarget.authorLabel}에게 답장</strong>
        <span>{replyTarget.text}</span>
      </div>
      <button aria-label="답장 취소" onClick={onClear} type="button">
        <X size={15} />
      </button>
    </div>
  );
}

const areMessageBubblePropsEqual = (previousProps, nextProps) =>
  previousProps.actor === nextProps.actor &&
  previousProps.message === nextProps.message &&
  previousProps.editingMessageId === nextProps.editingMessageId &&
  previousProps.editingText === nextProps.editingText &&
  previousProps.activeMessageMenuId === nextProps.activeMessageMenuId &&
  previousProps.activeReactionPickerId === nextProps.activeReactionPickerId &&
  previousProps.emojiQuery === nextProps.emojiQuery &&
  previousProps.isEmojiLoading === nextProps.isEmojiLoading &&
  previousProps.reactionActorKey === nextProps.reactionActorKey;

const MessageBubble = memo(function MessageBubble({
  actor,
  activeMessageMenuId,
  activeReactionPickerId,
  canManage = true,
  editingMessageId,
  emojiQuery,
  emojiResults,
  editingText,
  isEmojiLoading,
  message,
  onCancelEdit,
  onChangeEdit,
  onDelete,
  onEmojiQueryChange,
  onReact,
  onReply,
  onSaveEdit,
  onStartEdit,
  reactionActorKey,
  setActiveMessageMenuId,
  setMessageEmojiTarget,
}) {
  const isOwnMessage = message.author === actor;
  const isEditing = editingMessageId === message.id;
  const isMenuOpen = activeMessageMenuId === message.id;
  const isReactionPickerOpen = activeReactionPickerId === message.id;

  return (
    <article className={`bubble ${message.author} ${message.assistant ? "assistant-bubble" : ""}`} key={message.id}>
      {!isEditing && onReply && isOwnMessage && (
        <button
          aria-label="답장"
          className={`message-reply-trigger ${canManage ? "with-menu" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onReply();
          }}
          type="button"
        >
          <Reply size={14} />
        </button>
      )}
      {!isOwnMessage && !isEditing && (
        <div className="message-menu-wrap guest-menu">
          <button
            aria-label="메시지 옵션"
            className="message-menu-trigger"
            onClick={(event) => {
              event.stopPropagation();
              setActiveMessageMenuId(isMenuOpen ? null : message.id);
              setMessageEmojiTarget(null);
            }}
            type="button"
          >
            <Settings2 size={14} />
          </button>
          {isMenuOpen && (
            <div className="message-menu message-action-menu" onClick={(event) => event.stopPropagation()}>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveMessageMenuId(null);
                  setMessageEmojiTarget(null);
                  onReply();
                }}
                type="button"
              >
                답장
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setMessageEmojiTarget(isReactionPickerOpen ? null : message.id);
                }}
                type="button"
              >
                이모지
              </button>
              {isReactionPickerOpen && (
                <div className="message-menu-emoji">
                  <EmojiPicker
                    emojis={emojiResults}
                    isLoading={isEmojiLoading}
                    onPick={(emoji) => onReact(emoji.emoji)}
                    onQueryChange={onEmojiQueryChange}
                    query={emojiQuery}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {isOwnMessage && canManage && !isEditing && (
        <div className="message-menu-wrap">
          <button
            aria-label="메시지 옵션"
            className="message-menu-trigger"
            onClick={(event) => {
              event.stopPropagation();
              setMessageEmojiTarget(null);
              setActiveMessageMenuId(isMenuOpen ? null : message.id);
            }}
            type="button"
          >
            <Pencil size={14} />
          </button>
          {isMenuOpen && (
            <div className="message-menu" onClick={(event) => event.stopPropagation()}>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveMessageMenuId(null);
                  onStartEdit();
                }}
                type="button"
              >
                수정
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveMessageMenuId(null);
                  onDelete();
                }}
                type="button"
              >
                삭제
              </button>
            </div>
          )}
        </div>
      )}
      <div className="message-meta">
        <strong>
          {message.authorLabel}
          {message.assistant && <em className="assistant-badge">따이수</em>}
        </strong>
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
            onClick={(event) => event.stopPropagation()}
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
            <button
              onClick={(event) => {
                event.stopPropagation();
                onCancelEdit();
              }}
              type="button"
            >
              취소
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onSaveEdit();
              }}
              type="button"
            >
              저장
            </button>
          </div>
        </div>
      ) : (
        <>
          {message.replyTo && (
            <div className="message-reply-context">
              <strong>{message.replyTo.authorLabel}</strong>
              <span>{message.replyTo.text}</span>
            </div>
          )}
          <p>{message.text}</p>
          {message.assistant && (
            <small className="assistant-meta">
              신뢰도 {message.assistant.confidence || 0}
              {Array.isArray(message.assistant.matchedDocumentIds) &&
                message.assistant.matchedDocumentIds.length > 0 &&
                ` · 근거 ${message.assistant.matchedDocumentIds.length}건`}
            </small>
          )}
          {Array.isArray(message.reactions) && message.reactions.length > 0 && (
            <div className="message-reactions" onClick={(event) => event.stopPropagation()}>
              {message.reactions.map((reaction) => {
                const isActive = (reaction.reactorKeys || []).includes(reactionActorKey);
                return (
                  <button
                    className={`message-reaction-chip ${isActive ? "active" : ""}`}
                    key={`${message.id}:${reaction.emoji}`}
                    onClick={() => onReact(reaction.emoji)}
                    type="button"
                  >
                    <span>{reaction.emoji}</span>
                    <strong>{reaction.count || (reaction.reactorKeys || []).length}</strong>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </article>
  );
}, areMessageBubblePropsEqual);

function AdminScreen({
  adminAuthed,
  adminComposeRef,
  adminError,
  adminFilter,
  adminName,
  adminPassword,
  adminReply,
  adminReplyTarget,
  adminSection,
  adminTagFilter,
  adminStudentMessage,
  daiSuAnswerLogs,
  daiSuAssistant,
  daiSuDocumentForm,
  daiSuDocuments,
  emojiPickerTarget,
  emojiQuery,
  emojiResults,
  messageEmojiTarget,
  handleCreateTag,
  handleAdminLogin,
  handleEmojiPick,
  handleLoadOlderMessages,
  handleAdminReply,
  handleAdminReplyStart,
  handleAdminStatusChange,
  handleCreateStudentChat,
  handleDaiSuDocumentDelete,
  handleDaiSuDocumentEdit,
  handleDaiSuDocumentSubmit,
  handleDaiSuSettingsChange,
  onOpenBanDialog,
  onUnban,
  handleDeleteTag,
  handleMessageDelete,
  handleMessageEditCancel,
  handleMessageEditStart,
  handleMessageUpdate,
  handleProfileRequestReview,
  hasMoreMessages,
  editingMessageId,
  editingDaiSuDocumentId,
  editingText,
  activeMessageMenuId,
  isAdminSending,
  isEmojiLoading,
  isLoadingMessages,
  navigateTo,
  onRequestDeleteTag,
  pendingProfileRequests,
  realtimeStatus,
  selectedThreadTyping,
  selectedThread,
  selectedThreadId,
  selectedStudent,
  selectedStudentKey,
  setAdminFilter,
  setAdminName,
  setAdminPassword,
  setAdminReply,
  setAdminReplyTarget,
  setAdminSection,
  setAdminTagFilter,
  setAdminStudentMessage,
  setActiveMessageMenuId,
  setEditingText,
  setDaiSuDocumentForm,
  setEditingDaiSuDocumentId,
  setEmojiPickerTarget,
  setEmojiQuery,
  setMessageEmojiTarget,
  setSelectedThreadId,
  setSelectedStudentKey,
  setTagName,
  statusCounts,
  studentThreadCounts,
  students,
  tagCounts,
  tagName,
  tags,
  profileRequests,
  threads,
  typingThreadIds,
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
      <header className="admin-topbar">
        <div className="admin-wordmark">
          <span className="wordmark-symbol" aria-hidden="true">C</span>
          <h1>Council Talk</h1>
          <span>{statusCounts.all} inquiries</span>
        </div>
        <nav className="admin-nav" aria-label="어드민 메뉴">
          <button
            className={adminSection === "inquiries" ? "active" : ""}
            onClick={() => navigateTo(ADMIN_SECTION_PATHS.inquiries)}
            type="button"
          >
            문의 관리
          </button>
          <button
            className={adminSection === "tags" ? "active" : ""}
            onClick={() => navigateTo(ADMIN_SECTION_PATHS.tags)}
            type="button"
          >
            태그 관리
          </button>
          <button
            className={adminSection === "students" ? "active" : ""}
            onClick={() => navigateTo(ADMIN_SECTION_PATHS.students)}
            type="button"
          >
            학생 관리
          </button>
          <button
            className={adminSection === "requests" ? "active" : ""}
            onClick={() => navigateTo(ADMIN_SECTION_PATHS.requests)}
            type="button"
          >
            변경 신청
            {pendingProfileRequests.length > 0 && <span>{pendingProfileRequests.length}</span>}
          </button>
          <button
            className={adminSection === "daisu" ? "active" : ""}
            onClick={() => navigateTo(ADMIN_SECTION_PATHS.daisu)}
            type="button"
          >
            따이수 관리
          </button>
        </nav>
        <label className="admin-name">
          <span className={`realtime-pill ${realtimeStatus}`}>
            {realtimeStatus === "connected"
              ? "실시간 연결됨"
              : realtimeStatus === "reconnecting"
                ? "재연결 중"
                : "실시간 대기"}
          </span>
          <UserRound size={17} />
          <input
            value={adminName}
            onChange={(event) => setAdminName(event.target.value)}
            placeholder="답변자 이름"
          />
        </label>
      </header>

      <aside className="inbox">
        <header className="inbox-context-head">
          <div>
            <strong>
              {adminSection === "inquiries"
                ? "문의 목록"
                : adminSection === "students"
                  ? "학생 목록"
                : adminSection === "requests"
                    ? "변경 신청"
                    : adminSection === "daisu"
                      ? "따이수 관리"
                    : adminSection === "tags"
                      ? "태그 관리"
                      : ""}
            </strong>
            <span>
              {adminSection === "inquiries"
                ? `${threads.length}개 표시`
                : adminSection === "students"
                  ? `${students.length}명`
                  : adminSection === "requests"
                    ? `${pendingProfileRequests.length}건 대기`
                    : adminSection === "daisu"
                      ? `${daiSuDocuments.length}개 문서`
                    : adminSection === "tags"
                      ? `${tags.length}개 태그`
                      : ""}
            </span>
          </div>
        </header>

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
                  className={[
                    "thread-item",
                    thread.id === selectedThreadId ? "active" : "",
                    typingThreadIds.has(thread.id) ? "typing" : "",
                    thread.latestMessage?.author === "admin" ? "recent-admin" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={thread.id}
                  onClick={() => navigateTo(getAdminThreadPath(thread.id))}
                  type="button"
                >
                  <strong>{thread.title}</strong>
                  <span>
                    {thread.name} · {thread.studentId}
                  </span>
                  {thread.tagName && <em>{thread.tagName}</em>}
                  <small>
                    {typingThreadIds.has(thread.id)
                      ? "답변 작성 중"
                      : thread.latestMessage?.author === "admin"
                        ? "최근 답변됨"
                        : normalizeStatus(thread.status)}
                  </small>
                </button>
              ))}
            </div>
          </>
        )}

        {adminSection === "students" && (
          <div className="student-admin-list">
            {students.length === 0 && <p className="empty-copy">가입한 학생이 없습니다.</p>}
            {students.map((student) => (
              <button
                className={selectedStudentKey === studentKey(student) ? "active" : ""}
                key={studentKey(student)}
                onClick={() => setSelectedStudentKey(studentKey(student))}
                type="button"
              >
                <strong>
                  {student.name}
                  {student.banned && <em className="ban-badge">차단됨</em>}
                </strong>
                <span>{student.studentId}</span>
                <small>{studentThreadCounts[studentKey(student)] || 0}개 대화</small>
              </button>
            ))}
          </div>
        )}

        {adminSection === "requests" && (
          <div className="request-mini-list">
            {pendingProfileRequests.length === 0 && <p className="empty-copy">대기 중인 변경 신청이 없습니다.</p>}
            {pendingProfileRequests.map((request) => (
              <button key={request.id} type="button">
                <strong>{request.name}</strong>
                <span>
                  {request.studentId} → {request.newStudentId}
                </span>
              </button>
            ))}
          </div>
        )}

        {adminSection === "tags" && (
          <section className="section-sidebar-card">
            <strong>분류 설정</strong>
            <p>
              학생이 문의 등록 시 선택할 태그를 관리합니다.
            </p>
          </section>
        )}
      </aside>

      <section className="admin-conversation">
        {adminSection === "tags" ? (
          <TagAdminPanel
            handleCreateTag={handleCreateTag}
            handleDeleteTag={handleDeleteTag}
            onRequestDeleteTag={onRequestDeleteTag}
            setTagName={setTagName}
            tagCounts={tagCounts}
            tagName={tagName}
            tags={tags}
          />
        ) : adminSection === "students" ? (
          <StudentAdminPanel
            adminName={adminName}
            adminStudentMessage={adminStudentMessage}
            handleCreateStudentChat={handleCreateStudentChat}
            onOpenBanDialog={onOpenBanDialog}
            onUnban={onUnban}
            selectedStudent={selectedStudent}
            setAdminStudentMessage={setAdminStudentMessage}
            studentThreadCount={selectedStudent ? studentThreadCounts[studentKey(selectedStudent)] || 0 : 0}
            students={students}
          />
        ) : adminSection === "requests" ? (
          <ProfileRequestAdminPanel
            handleProfileRequestReview={handleProfileRequestReview}
            profileRequests={profileRequests}
          />
        ) : adminSection === "daisu" ? (
          <DaiSuAdminPanel
            answerLogs={daiSuAnswerLogs}
            assistant={daiSuAssistant}
            documentForm={daiSuDocumentForm}
            documents={daiSuDocuments}
            editingDocumentId={editingDaiSuDocumentId}
            handleDocumentDelete={handleDaiSuDocumentDelete}
            handleDocumentEdit={handleDaiSuDocumentEdit}
            handleDocumentSubmit={handleDaiSuDocumentSubmit}
            handleSettingsChange={handleDaiSuSettingsChange}
            setDocumentForm={setDaiSuDocumentForm}
            setEditingDocumentId={setEditingDaiSuDocumentId}
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

            {selectedThreadTyping.length > 0 && (
              <div className="typing-presence">
                <span />
                {selectedThreadTyping.map((item) => item.authorLabel).join(", ")}님이 답변을 작성 중입니다.
              </div>
            )}

            <div className="messages admin-messages">
              {hasMoreMessages && (
                <button
                  className="load-more-messages"
                  disabled={isLoadingMessages}
                  onClick={handleLoadOlderMessages}
                  type="button"
                >
                  {isLoadingMessages ? "이전 메시지 불러오는 중..." : "이전 메시지 더 보기"}
                </button>
              )}
              {(selectedThread.messages || []).map((message) => (
                <MessageBubble
                  actor="admin"
                  activeMessageMenuId={activeMessageMenuId}
                  editingMessageId={editingMessageId}
                  editingText={editingText}
                  key={message.id}
                  message={message}
                  activeReactionPickerId={messageEmojiTarget}
                  onCancelEdit={handleMessageEditCancel}
                  onChangeEdit={setEditingText}
                  onDelete={() => handleMessageDelete(selectedThread, message, "admin")}
                  onReact={(emoji) => handleMessageReaction(selectedThread, message, "admin", emoji)}
                  onReply={() => handleAdminReplyStart(message)}
                  onSaveEdit={() => handleMessageUpdate(selectedThread, message, "admin")}
                  setActiveMessageMenuId={setActiveMessageMenuId}
                  setMessageEmojiTarget={setMessageEmojiTarget}
                  onStartEdit={() => handleMessageEditStart(message)}
                  emojiResults={emojiResults}
                  isEmojiLoading={isEmojiLoading}
                  onEmojiQueryChange={setEmojiQuery}
                  emojiQuery={emojiQuery}
                  reactionActorKey={createReactionActorKey({
                    author: "admin",
                    authorLabel: adminName.trim() || "학생회",
                  })}
                />
              ))}
            </div>

            <footer className="admin-reply">
              {adminReplyTarget && (
                <ReplyPreviewBar
                  replyTarget={adminReplyTarget}
                  onClear={() => setAdminReplyTarget(null)}
                />
              )}
              {emojiPickerTarget === "admin" && (
                <EmojiPicker
                  emojis={emojiResults}
                  isLoading={isEmojiLoading}
                  onPick={handleEmojiPick}
                  onQueryChange={setEmojiQuery}
                  query={emojiQuery}
                />
              )}
              <textarea
                ref={adminComposeRef}
                value={adminReply}
                onChange={(event) => setAdminReply(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (!isAdminSending) {
                      handleAdminReply();
                    }
                  }
                }}
                disabled={isAdminSending}
                placeholder={`${adminName || "학생회"} 이름으로 답변하기`}
                rows={4}
              />
              <button
                aria-label="이모지"
                className="plus-button admin-emoji-button"
                onClick={() => {
                  setEmojiQuery("");
                  setEmojiPickerTarget(emojiPickerTarget === "admin" ? null : "admin");
                }}
                type="button"
              >
                <Smile size={18} />
              </button>
              <button
                aria-label="답변 보내기"
                className="black-icon-button"
                disabled={isAdminSending || !adminReply.trim()}
                onClick={handleAdminReply}
                type="button"
              >
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
