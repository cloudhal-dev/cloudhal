/**
 * Playground sessions (RFC-0036 §6): a ULID in a host-only cookie. The ULID's timestamp is the
 * creation time, so no server keeps a session table. The cookie carries an HMAC of the ULID: an
 * unsigned one would let a client mint sessions at will and skip the per-IP and daily limits on
 * session creation (amendment to RFC-0036 §6, ADR-0038).
 */

export const SESSION_COOKIE = "__Host-cloudhal_try";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const enc = new TextEncoder();

/** A new ULID: 48-bit milliseconds, then 80 random bits. */
export function newSessionId(now: number): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const random = crypto.getRandomValues(new Uint8Array(16));
  let rest = "";
  for (const b of random) rest += CROCKFORD[b % 32];
  return time + rest;
}

/** The creation time a session ID carries, or undefined when it is not a ULID. */
export function sessionTime(id: string): number | undefined {
  if (!ULID_RE.test(id)) return undefined;
  let t = 0;
  for (const ch of id.slice(0, 10)) t = t * 32 + CROCKFORD.indexOf(ch);
  return t;
}

async function mac(id: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(id)));
  let bin = "";
  for (const b of sig.slice(0, 16)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The cookie value for a session: `<ulid>.<mac>`. */
export async function signSession(id: string, secret: string): Promise<string> {
  return `${id}.${await mac(id, secret)}`;
}

/** The session ID of a cookie value whose MAC holds, else undefined. */
export async function verifySession(value: string, secret: string): Promise<string | undefined> {
  const [id, tag, extra] = value.split(".");
  if (!id || !tag || extra !== undefined || sessionTime(id) === undefined) return undefined;
  const want = await mac(id, secret);
  if (want.length !== tag.length) return undefined;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ tag.charCodeAt(i);
  return diff === 0 ? id : undefined;
}

/** The session cookie's value in a request, if any. */
export function readSessionCookie(request: Request): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return value.join("=");
  }
  return undefined;
}

/** `Set-Cookie` for a session (host-only, `__Host-`: Secure, Path=/, no Domain; ADR-0037). */
export function sessionCookie(value: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}
