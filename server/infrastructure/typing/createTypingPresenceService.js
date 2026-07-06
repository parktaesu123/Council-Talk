export const createTypingPresenceService = ({ heartbeatTtlMs = 8000, sseHub }) => {
  const cleanupGraceMs = 500;
  const typingStates = new Map();

  const serialize = () => ({
    typing: Array.from(typingStates.values()).filter(
      (item) => Date.now() - item.updatedAt < heartbeatTtlMs,
    ),
  });

  const broadcast = () => {
    sseHub.broadcast("typing", serialize());
  };

  return {
    snapshot() {
      return serialize();
    },

    update(threadId, { active, authorLabel, clientId }) {
      if (!clientId) {
        return false;
      }

      const key = `${threadId}:${clientId}`;

      if (active) {
        const updatedAt = Date.now();
        typingStates.set(key, {
          threadId,
          clientId,
          authorLabel,
          updatedAt,
        });

        setTimeout(() => {
          const current = typingStates.get(key);
          if (current?.updatedAt === updatedAt) {
            typingStates.delete(key);
            broadcast();
          }
        }, heartbeatTtlMs + cleanupGraceMs);
      } else {
        typingStates.delete(key);
      }

      broadcast();
      return true;
    },

    clearThread(threadId) {
      let changed = false;

      for (const [key, value] of typingStates.entries()) {
        if (value.threadId === threadId) {
          typingStates.delete(key);
          changed = true;
        }
      }

      if (changed) {
        broadcast();
      }
    },
  };
};
