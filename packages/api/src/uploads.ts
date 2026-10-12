/**
 * Upload ticket signatures (RFC-0004 §5.5): an HMAC-SHA-256 over the ticket's binding — id, site,
 * actor, declared size, type, SHA-256 and expiry — with the construction of preview tokens
 * (WebCrypto, base64url). The `media_uploads` row stays the authority (single use, actor-bound,
 * expiring); the signature makes a URL whose parts were changed useless. Worker-safe.
 */
import type { UploadTicket } from "@cloudhal/core-ts";

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string): Uint8Array<ArrayBuffer> | undefined {
  if (!/^[A-Za-z0-9_-]{43}$/.test(text)) return undefined;
  const bin = atob(`${text.replace(/-/g, "+").replace(/_/g, "/")}=`);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** A signing secret of at least 32 bytes (the preview secret, the MCP state key, or random). */
export type UploadSecret = string | Uint8Array;

/** WebCrypto's key type, named without the DOM lib (Node-only typechecks have no global `CryptoKey`). */
type HmacKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

const keys = new WeakMap<object, Promise<HmacKey>>();
const stringKeys = new Map<string, Promise<HmacKey>>();

function key(secret: UploadSecret): Promise<HmacKey> {
  const raw = typeof secret === "string" ? enc.encode(secret) : secret;
  if (raw.byteLength < 32) throw new RangeError("upload signing secret must be at least 32 bytes");
  const make = () =>
    // Domain separation: the same secret also signs preview tokens.
    crypto.subtle
      .importKey("raw", raw as Uint8Array<ArrayBuffer>, { name: "HMAC", hash: "SHA-256" }, false, [
        "sign",
      ])
      .then(async (base) => {
        const derived = new Uint8Array(
          await crypto.subtle.sign("HMAC", base, enc.encode("cloudhal upload ticket v1")),
        );
        return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, [
          "sign",
          "verify",
        ]);
      });
  if (typeof secret === "string") {
    let k = stringKeys.get(secret);
    if (!k) {
      k = make();
      stringKeys.set(secret, k);
    }
    return k;
  }
  let k = keys.get(secret);
  if (!k) {
    k = make();
    keys.set(secret, k);
  }
  return k;
}

function payload(t: UploadTicket): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    enc.encode(
      [
        t.id,
        t.siteId,
        `${t.actor.kind}:${t.actor.id}`,
        String(t.bytes),
        t.mediaType,
        t.sha256 ?? "",
        t.expiresAt,
      ].join("\n"),
    ),
  );
}

export async function signUploadTicket(secret: UploadSecret, t: UploadTicket): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), payload(t))));
}

/** Constant-time check of a `sig` query parameter against the stored ticket. */
export async function verifyUploadTicket(
  secret: UploadSecret,
  t: UploadTicket,
  sig: string | undefined,
): Promise<boolean> {
  const mac = sig ? fromB64url(sig) : undefined;
  if (!mac) return false;
  return crypto.subtle.verify("HMAC", await key(secret), mac, payload(t));
}

/** A random secret for servers configured without one (single process: local tools, tests). */
export function randomUploadSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}
