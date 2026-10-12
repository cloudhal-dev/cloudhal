import { OwnLimitError } from "@cloudhal/agent-runtime";
import { AnalyticsError } from "@cloudhal/analytics";
import { CommentsError } from "@cloudhal/comments";
import { ContractValidationError } from "@cloudhal/core-contracts";
import {
  ConflictError,
  FilterError,
  type InvariantCode,
  InvariantError,
  NotFoundError,
  UniqueConstraintError,
} from "@cloudhal/core-ts";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { AuthError } from "./auth.ts";

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: unknown;
}

/**
 * HTTP status of each RFC-0002 invariant code: 409 when the request collides with the site's
 * current state (a slug or archive path someone holds, an operation too large for one batch), 400
 * for a request that can never succeed as written, 422 for a well-formed request the data
 * invariants refuse right now.
 */
export const INVARIANT_STATUS: Record<InvariantCode, 400 | 409 | 410 | 415 | 422 | 503> = {
  // RFC-0004 (assets and media)
  unsupported_type: 415,
  type_mismatch: 415,
  too_many_pixels: 422,
  svg_unsafe: 422,
  metadata_unsupported: 422,
  quota_exceeded: 409,
  purged: 410,
  in_use: 409,
  unknown_asset: 422,
  retired_asset: 422,
  fetch_blocked: 422,
  fetch_failed: 422,
  retry: 503,
  reserved_path: 409,
  missing_media: 409,
  invalid_asset: 400,
  // RFC-0002
  too_large: 409,
  slug_taken: 409,
  path_conflict: 409,
  reserved_key: 400,
  immutable_field: 400,
  primary_not_assigned: 422,
  required_term: 422,
  invalid_assignment: 422,
  term_not_assignable: 422,
  too_many_terms: 422,
  invalid_parent: 422,
  cycle: 422,
  too_deep: 422,
  invalid_status: 422,
  not_allowed: 422,
  invalid_labels: 422,
  invalid_redirect: 422,
  // RFC-0003 menus (`routes/menus.ts`).
  key_taken: 409,
  unknown_target: 422,
  unknown_item: 422,
  invalid_label: 422,
  invalid_menu: 422,
};

/** In a query string `+` must be sent as `%2B`: form encoding turns it into a space (RFC-0002 §5). */
const PLUS_HINT = "In a query string, send '+' as %2B; a bare '+' arrives as a space.";

/** Maps domain errors to HTTP responses. Everything else is a 500 with a generic message. */
export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof HTTPException) return err.getResponse();
  if (err instanceof AuthError)
    return c.json<ApiErrorBody>({ error: err.code, message: err.message }, err.status);
  if (err instanceof OwnLimitError)
    return c.json<ApiErrorBody>(
      { error: "not_own", message: err.message, details: { code: err.code } },
      403,
    );
  if (err instanceof ContractValidationError) {
    return c.json<ApiErrorBody>(
      { error: "validation", message: err.message, details: err.errors },
      400,
    );
  }
  if (err instanceof InvariantError) {
    return c.json<ApiErrorBody>(
      { error: err.code, message: err.message, details: err.details },
      INVARIANT_STATUS[err.code] ?? 422,
    );
  }
  if (err instanceof FilterError) {
    const spaced = err.code === "syntax" && (c.req.query("filter") ?? "").includes(" ");
    return c.json<ApiErrorBody>(
      {
        error: err.code,
        message: spaced ? `${err.message}. ${PLUS_HINT}` : err.message,
        details: { unknown: err.unknown },
      },
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
  if (err instanceof AnalyticsError) return analyticsError(err, c);
  // RFC-0007: comment store errors carry stable codes.
  if (err instanceof CommentsError)
    return c.json<ApiErrorBody>(
      { error: err.code, message: err.message },
      err.code === "not_found"
        ? 404
        : err.code === "conflict"
          ? 409
          : err.code === "forbidden"
            ? 403
            : 400,
    );
  console.error(err);
  return c.json<ApiErrorBody>({ error: "internal", message: "internal error" }, 500);
}

/**
 * Analytics errors (RFC-0006 §7.3, §9.2): `invalid_query` and `invalid_settings` 400, `conflict`
 * 409 (stale settings `rev`), `analytics_unavailable` 503 with `retryable` and `Retry-After: 30`,
 * `analytics_query_failed` 502 (the message never names the dataset).
 */
function analyticsError(err: AnalyticsError, c: Context): Response {
  switch (err.code) {
    case "invalid_query":
    case "invalid_settings":
    case "unsupported_query":
      return c.json<ApiErrorBody>({ error: err.code, message: err.message }, 400);
    case "conflict":
      return c.json<ApiErrorBody>(
        { error: "conflict", message: err.message, details: { kind: "analyticsSettings" } },
        409,
      );
    case "analytics_query_failed":
      return c.json<ApiErrorBody>({ error: err.code, message: err.message }, 502);
    default:
      c.header("retry-after", "30");
      return c.json<ApiErrorBody>(
        {
          error: "analytics_unavailable",
          message: err.message,
          details: { retryable: err.retryable || err.code === "analytics_budget_exceeded" },
        },
        503,
      );
  }
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

/** A JSON error with any status (RFC-0005 codes: `missing_scope`, `rank`, `invite_gone`, …). */
export function apiError(
  status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 415 | 422 | 429,
  error: string,
  message: string,
  details?: unknown,
): HTTPException {
  return new HTTPException(status, {
    res: Response.json(
      { error, message, ...(details === undefined ? {} : { details }) },
      { status },
    ),
  });
}

/** 403 for a person whose role lacks `scope`. */
export function missingScope(scope: string, message?: string): HTTPException {
  return apiError(403, "missing_scope", message ?? `your role does not include ${scope}`, {
    scope,
  });
}
