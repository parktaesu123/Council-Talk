import { readJsonFile, writeJsonFileAtomic } from "./atomicFile.js";

const defaultSnapshot = (initialState) => ({
  lastSequence: 0,
  updatedAt: null,
  state: initialState,
});

const mergeStateDefaults = (initialState, state) => ({
  ...structuredClone(initialState),
  ...(state && typeof state === "object" ? structuredClone(state) : {}),
});

export const createStateStore = ({
  eventStore,
  evolve,
  initialState,
  snapshotFilePath,
}) => {
  let queue = Promise.resolve();
  let cache = null;

  const load = async () => {
    if (cache) {
      return cache;
    }

    const snapshot = await readJsonFile(
      snapshotFilePath,
      defaultSnapshot(structuredClone(initialState)),
    );
    const baseState = mergeStateDefaults(initialState, snapshot.state ?? initialState);
    const lastSequence = Number(snapshot.lastSequence || 0);
    const events = await eventStore.readAll();
    const pendingEvents = events.filter((event) => event.sequence > lastSequence);
    const state = pendingEvents.reduce(
      (current, event) => evolve(current, event),
      baseState,
    );

    cache = {
      lastSequence: pendingEvents.at(-1)?.sequence || lastSequence,
      state,
    };

    if (pendingEvents.length > 0) {
      await writeJsonFileAtomic(snapshotFilePath, {
        lastSequence: cache.lastSequence,
        updatedAt: new Date().toISOString(),
        state: cache.state,
      });
    }

    return cache;
  };

  return {
    async read() {
      const current = await load();
      return structuredClone(current.state);
    },

    async transact(decide) {
      const operation = queue.then(async () => {
        const current = await load();
        const stateView = structuredClone(current.state);
        const outcome = (await decide(stateView)) || {};
        const domainEvents = Array.isArray(outcome.events) ? outcome.events : [];
        const persistedEvents = await eventStore.append(domainEvents, current.lastSequence);
        const nextState = persistedEvents.reduce(
          (state, event) => evolve(state, event),
          structuredClone(current.state),
        );

        cache = {
          lastSequence: persistedEvents.at(-1)?.sequence || current.lastSequence,
          state: nextState,
        };

        await writeJsonFileAtomic(snapshotFilePath, {
          lastSequence: cache.lastSequence,
          updatedAt: new Date().toISOString(),
          state: cache.state,
        });

        return {
          ...outcome,
          events: persistedEvents,
          state: structuredClone(cache.state),
        };
      });

      queue = operation.catch(() => {});
      return operation;
    },
  };
};
