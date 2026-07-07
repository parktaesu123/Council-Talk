export const THREAD_STATUSES = ["미완료", "진행중", "완료"];
const LEGACY_THREAD_STATUS_MAP = {
  대기중: "미완료",
  답변중: "진행중",
  답변완료: "완료",
};

export const normalizeThreadStatus = (status) => {
  if (LEGACY_THREAD_STATUS_MAP[status]) return LEGACY_THREAD_STATUS_MAP[status];
  return THREAD_STATUSES.includes(status) ? status : "미완료";
};
