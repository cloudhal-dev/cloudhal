/**
 * Signed preview links. The admin side (API/Studio/MCP) mints a short-lived token; the site
 * renderer verifies it and shows drafts (`live`) or a specific snapshot instead of the published
 * one. HMAC-SHA256 over a compact JSON payload, WebCrypto only (Node 24 and Workers).
 *
 * Wire format: `<base64url(payload)>.<base64url(mac)>`.
 */

export interface PreviewClaims {
  /** The site the token is valid for. */
  site: string;
  /** `live` = current nodes including drafts; otherwise a snapshot id. */
  target: "live" | { snapshot: string };
  /** Expiry, unix seconds. */
  exp: number;
}

export class PreviewTokenError extends Error {
  override readonly name = "PreviewTokenError";
  readonly reason: "malformed" | "signature" | "expired" | "site";
  constructor(reason: PreviewTokenError["reason"]) {
    super(`invalid preview token (${reason})`);
    this.reason = reason;
  }
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const pad = text.length % 4 === 0 ? "" : "=".repeat(4 - (text.length % 4));
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function key(secret: string) {
  if (enc.encode(secret).length < 32)
    throw new RangeError("preview secret must be at least 32 bytes");
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Mints a preview token valid for `ttlSeconds` (default one hour, max one week). */
export async function mintPreviewToken(
  secret: string,
  input: { site: string; target: PreviewClaims["target"]; ttlSeconds?: number; now?: number },
): Promise<string> {
  const ttl = Math.min(Math.max(input.ttlSeconds ?? 3600, 60), 7 * 24 * 3600);
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  const claims: PreviewClaims = { site: input.site, target: input.target, exp: now + ttl };
  const payload = enc.encode(JSON.stringify(claims));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), payload));
  return `${b64url(payload)}.${b64url(mac)}`;
}

/** Verifies a token for `site`; throws `PreviewTokenError` with a reason code on any failure. */
export async function verifyPreviewToken(
  secret: string,
  token: string,
  site: string,
  now: number = Date.now(),
): Promise<PreviewClaims> {
  const [p, m, extra] = token.split(".");
  if (!p || !m || extra !== undefined) throw new PreviewTokenError("malformed");
  let payload: Uint8Array<ArrayBuffer>;
  let mac: Uint8Array<ArrayBuffer>;
  try {
    payload = fromB64url(p);
    mac = fromB64url(m);
  } catch {
    throw new PreviewTokenError("malformed");
  }
  const ok = await crypto.subtle.verify("HMAC", await key(secret), mac, payload);
  if (!ok) throw new PreviewTokenError("signature");
  let claims: PreviewClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(payload)) as PreviewClaims;
  } catch {
    throw new PreviewTokenError("malformed");
  }
  const target = claims.target;
  const validTarget =
    target === "live" ||
    (typeof target === "object" && target !== null && typeof target.snapshot === "string");
  if (typeof claims.site !== "string" || typeof claims.exp !== "number" || !validTarget)
    throw new PreviewTokenError("malformed");
  if (claims.exp * 1000 <= now) throw new PreviewTokenError("expired");
  if (claims.site !== site) throw new PreviewTokenError("site");
  return claims;
}

/** The site's primary public origin (`https://<primary domain>`), if it has one. */
export function primaryOrigin(site: {
  domains?: { hostname: string; primary: boolean }[];
}): string | undefined {
  const domain = site.domains?.find((d) => d.primary) ?? site.domains?.[0];
  return domain ? `https://${domain.hostname}` : undefined;
}

/** `https://<primary>/<path>?cloudhal-preview=<token>`, or undefined when the site has no domain. */
export function previewUrl(
  site: { domains?: { hostname: string; primary: boolean }[] },
  path: string,
  token: string,
): string | undefined {
  const origin = primaryOrigin(site);
  if (!origin) return undefined;
  const url = new URL(path.startsWith("/") ? path : `/${path}`, origin);
  url.searchParams.set("cloudhal-preview", token);
  return url.toString();
}
