const serializeSseEvent = ({ event, id, payload }) =>
  [`id: ${id}`, `event: ${event}`, `data: ${JSON.stringify(payload)}`, "", ""].join("\n");

export const createSseHub = ({ heartbeatMs = 15000, snapshotProvider }) => {
  const clients = new Set();
  let sequence = 0;

  const broadcast = (event, payload) => {
    sequence += 1;
    const body = serializeSseEvent({ event, id: sequence, payload });

    for (const client of clients) {
      try {
        client.write(body);
      } catch {
        clients.delete(client);
      }
    }
  };

  return {
    async handleConnection(request, response) {
      response.setHeader("Content-Type", "text/event-stream");
      response.setHeader("Cache-Control", "no-cache, no-transform");
      response.setHeader("Connection", "keep-alive");
      response.setHeader("X-Accel-Buffering", "no");
      response.flushHeaders?.();
      response.write("retry: 2000\n\n");

      clients.add(response);
      broadcast("connected", { ok: true });

      if (snapshotProvider) {
        const snapshot = await snapshotProvider();

        if (snapshot) {
          broadcast("snapshot", snapshot);
        }
      }

      const heartbeat = setInterval(() => {
        response.write("event: ping\ndata: {}\n\n");
      }, heartbeatMs);

      request.on("close", () => {
        clearInterval(heartbeat);
        clients.delete(response);
      });
    },

    broadcast,

    subscribeTo(eventBus) {
      return eventBus.subscribe(async (events) => {
        for (const event of events) {
          broadcast(event.type, event);
        }
      });
    },
  };
};
