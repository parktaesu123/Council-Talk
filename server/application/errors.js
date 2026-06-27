export class ApplicationError extends Error {
  constructor(message, { code = "APPLICATION_ERROR", status = 400 } = {}) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
    this.status = status;
  }
}

export const notFound = (message) =>
  new ApplicationError(message, { code: "NOT_FOUND", status: 404 });

export const unauthorized = (message) =>
  new ApplicationError(message, { code: "UNAUTHORIZED", status: 401 });

export const conflict = (message) =>
  new ApplicationError(message, { code: "CONFLICT", status: 409 });

export const badRequest = (message) =>
  new ApplicationError(message, { code: "BAD_REQUEST", status: 400 });
