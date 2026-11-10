/**
 * One-time link tokens (RFC-0005 §7.1): a recognisable prefix (secret scanners can match it) plus
 * 32 random bytes as base64url (256 bits). Only `SHA-256(token)` is stored; the plaintext is
 * returned once, travels in a URL fragment, and never appears in audit rows or logs.
 */
import { sha256Hex } from "@cloudhal/core-ts";
import { trimEndChar } from "@cloudhal/core-ts/names";
import type { Context } from "hono";
import type { Env } from "./context.ts";
import { apiError } from "./errors.ts";

export const INVITE_TOKEN_PREFIX = "chinv_";
export const RESET_TOKEN_PREFIX = "chrst_";

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `prefix` + 43 base64url characters from 32 random bytes. */
export function newToken(prefix: string): string {
  return `${prefix}${base64url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

/** Does `value` look like a token with this prefix (before any database lookup)? */
export function isToken(prefix: string, value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === prefix.length + 43 &&
    value.startsWith(prefix) &&
    /^[A-Za-z0-9_-]{43}$/.test(value.slice(prefix.length))
  );
}

/** Hex SHA-256 of a token: what the database stores and looks up. */
export function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

/**
 * The largest body a public token endpoint reads (#174): an email, a token, a password and a name
 * fit many times over. Anything larger is refused before it is parsed or checked.
 */
export const JSON_BODY_MAX_BYTES = 64 * 1024;

function tooLarge() {
  return apiError(
    413,
    "payload_too_large",
    `the body must be at most ${JSON_BODY_MAX_BYTES} bytes`,
  );
}

/** The body as text, or a 413 once more than `max` bytes arrive (a chunked body has no length). */
async function cappedText(request: Request, max: number): Promise<string> {
  if (Number(request.headers.get("content-length") ?? 0) > max) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

/**
 * Public token endpoints take JSON bodies only (a cross-site form post needs a preflight), of at
 * most `JSON_BODY_MAX_BYTES`.
 */
export async function jsonBody(c: Context<Env>): Promise<Record<string, unknown>> {
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json"))
    throw apiError(
      415,
      "unsupported_media_type",
      "send a JSON body (content-type: application/json)",
    );
  const text = await cappedText(c.req.raw, JSON_BODY_MAX_BYTES);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw apiError(400, "bad_request", "the body must be a JSON object");
  return body as Record<string, unknown>;
}

/**
 * The request header a trusted front writes the client's address to. On Node `serveNode` sets it
 * (the socket's address, or behind a trusted proxy the last `X-Forwarded-For` hop) after dropping
 * whatever the client sent under that name; `createApi({ clientAddressHeader })` and Better Auth
 * (`AuthOptions.clientAddressHeader`) then read only that value (#165). Workers read Cloudflare's
 * `CF-Connecting-IP` instead, which the runtime vouches for.
 */
export const CLIENT_ADDRESS_HEADER = "x-cloudhal-client-address";

/**
 * The client address for rate limits: the header the deployment vouches for
 * (`ApiDeps.clientAddressHeader`, default `CF-Connecting-IP`), else one shared bucket. Never
 * `X-Forwarded-For` as the client sent it: that made the limits spoofable on Node (#165).
 */
export function clientIp(c: Context<Env>): string {
  return c.req.header(c.get("clientAddressHeader") ?? "cf-connecting-ip") ?? "local";
}

/**
 * 10 requests per minute per IP on a public token endpoint (RFC-0005 §7.1), counted in Cloudhal's
 * `rate_limits` table (migration 0030; not Better Auth's `rateLimit`, which it prunes by 60 s).
 */
export async function limitPublic(c: Context<Env>, bucket: string): Promise<void> {
  const staff = c.get("staff");
  if (!staff) return;
  if (!(await staff.store.hit(`cloudhal:${bucket}:${clientIp(c)}`, 60_000, 10)))
    throw apiError(429, "rate_limited", "too many attempts; wait a minute and try again");
}

/** Where Studio serves `/invite` and `/reset-password`. */
export function studioOrigin(
  c: Context<Env>,
  configured: string | undefined,
  trusted: ReadonlySet<string>,
): string {
  // `trimEndChar`, not `/\/+$/`, which backtracks on a long run of "/" (js/polynomial-redos).
  if (configured) return trimEndChar(configured, "/");
  const own = new URL(c.req.url).origin;
  const origin = c.req.header("origin");
  return origin && (origin === own || trusted.has(origin)) ? origin : own;
}
