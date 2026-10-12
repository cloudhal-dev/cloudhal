/**
 * One-time link tokens (RFC-0005 §7.1): a recognisable prefix (secret scanners can match it) plus
 * 32 random bytes as base64url (256 bits). Only `SHA-256(token)` is stored; the plaintext is
 * returned once, travels in a URL fragment, and never appears in audit rows or logs.
 */
import { sha256Hex } from "@cloudhal/core-ts";
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

/** Public token endpoints take JSON bodies only (a cross-site form post needs a preflight). */
export async function jsonBody(c: Context<Env>): Promise<Record<string, unknown>> {
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json"))
    throw apiError(
      415,
      "unsupported_media_type",
      "send a JSON body (content-type: application/json)",
    );
  const body = (await c.req.json().catch(() => undefined)) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw apiError(400, "bad_request", "the body must be a JSON object");
  return body as Record<string, unknown>;
}

/** The client address for rate limits. */
export function clientIp(c: Context<Env>): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

/**
 * 10 requests per minute per IP on a public token endpoint (RFC-0005 §7.1), counted in Better
 * Auth's `rateLimit` table.
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
  if (configured) return configured.replace(/\/+$/, "");
  const own = new URL(c.req.url).origin;
  const origin = c.req.header("origin");
  return origin && (origin === own || trusted.has(origin)) ? origin : own;
}
