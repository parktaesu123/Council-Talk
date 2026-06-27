export const createDomainEvent = ({ type, payload, occurredAt = new Date().toISOString() }) => ({
  type,
  payload,
  occurredAt,
});
