export const createClock = () => ({
  now: () => new Date().toISOString(),
  timeLabel: () =>
    new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Seoul",
    }).format(new Date()),
});
