import test from "node:test";
import assert from "node:assert/strict";

import { ApplicationError, badRequest, conflict, notFound, unauthorized } from "./errors.js";

test("application error helpers expose expected status and codes", () => {
  const cases = [
    [badRequest("bad"), 400, "BAD_REQUEST"],
    [unauthorized("no"), 401, "UNAUTHORIZED"],
    [notFound("missing"), 404, "NOT_FOUND"],
    [conflict("duplicate"), 409, "CONFLICT"],
  ];

  for (const [error, status, code] of cases) {
    assert.equal(error instanceof ApplicationError, true);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
  }
});
