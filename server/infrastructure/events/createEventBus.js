export const createEventBus = () => {
  const listeners = new Set();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async publish(events) {
      if (!Array.isArray(events) || events.length === 0) {
        return;
      }

      await Promise.allSettled(
        [...listeners].map((listener) => listener(events)),
      );
    },
  };
};
