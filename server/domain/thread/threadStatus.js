export const THREAD_STATUSES = ["미완료", "진행중", "완료"];

export const normalizeThreadStatus = (status) => {
  if (status === "답변완료") return "완료";
  if (status === "답변중") return "진행중";
  if (status === "대기중") return "미완료";
  return THREAD_STATUSES.includes(status) ? status : "미완료";
};
