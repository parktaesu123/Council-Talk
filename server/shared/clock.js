export const createClock = ({ nowProvider = () => new Date() } = {}) => ({
  now: () => nowProvider().toISOString(),
  timeLabel: () =>
    new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Seoul",
    }).format(nowProvider()),
});
