import { ContractValidationError } from "@cloudhal/core-contracts";
import { ConflictError, NotFoundError, UniqueConstraintError } from "@cloudhal/core-ts";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { AuthError } from "./auth.ts";

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: unknown;
}

/** Maps domain errors to HTTP responses. Everything else is a 500 with a generic message. */
export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof HTTPException) return err.getResponse();
  if (err instanceof AuthError)
    return c.json<ApiErrorBody>({ error: "auth", message: err.message }, 400);
  if (err instanceof ContractValidationError) {
    return c.json<ApiErrorBody>(
      { error: "validation", message: err.message, details: err.errors },
      400,
    );
  }
  if (err instanceof ConflictError) {
    return c.json<ApiErrorBody>(
      {
        error: "conflict",
        message: err.message,
        details: {
          kind: err.kind,
          id: err.id,
          expectedRev: err.expectedRev,
          actualRev: err.actualRev,
        },
      },
      409,
    );
  }
  if (err instanceof UniqueConstraintError) {
    return c.json<ApiErrorBody>(
      { error: "unique", message: err.message, details: { kind: err.kind, key: err.key } },
      409,
    );
  }
  if (err instanceof NotFoundError) {
    return c.json<ApiErrorBody>({ error: "not_found", message: err.message }, 404);
  }
  console.error(err);
  return c.json<ApiErrorBody>({ error: "internal", message: "internal error" }, 500);
}

export function notFound(message: string): HTTPException {
  return new HTTPException(404, {
    res: Response.json({ error: "not_found", message }, { status: 404 }),
  });
}

export function badRequest(message: string): HTTPException {
  return new HTTPException(400, {
    res: Response.json({ error: "bad_request", message }, { status: 400 }),
  });
}

export function unauthorized(): HTTPException {
  return new HTTPException(401, {
    res: Response.json({ error: "unauthorized", message: "sign in required" }, { status: 401 }),
  });
}
