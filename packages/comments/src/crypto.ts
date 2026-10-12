/**
 * WebCrypto helpers shared by the proof of work, the hashes and the encrypted columns (RFC-0007
 * §4.1, §7.2, §9.2). Everything runs on Node and on Workers; nothing here imports a Node module.
 *
 * One deployment secret, `CLOUDHAL_COMMENTS_KEY`, is stretched with HKDF-SHA-256 into separate
 * keys per purpose (`cloudhal/comments/<purpose>/v1`), so a key used to sign challenges can never
 * decrypt an email and rotating one purpose is a new info string, not a new secret.
 */

/** Spelled through the `crypto.subtle` signatures so it resolves with Node's and Workers' types. */
export type HmacKey = Parameters<typeof crypto.subtle.sign>[1];
export type AesKey = Parameters<typeof crypto.subtle.encrypt>[1];

const encoder = new TextEncoder();

export const utf8 = (text: string): Uint8Array<ArrayBuffer> =>
  encoder.encode(text) as Uint8Array<ArrayBuffer>;

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes base64url without padding; `undefined` for anything else. */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return undefined;
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return undefined;
  }
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Lower-case hex SHA-256 of a string. */
export async function sha256Hex(text: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(text))));
}

export async function hmac(key: HmacKey, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}

/** HMAC-SHA-256 under a raw key (the monthly IP salt). */
export async function hmacRaw(rawKey: Uint8Array<ArrayBuffer>, data: string): Promise<Uint8Array> {
  const key = (await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )) as HmacKey;
  return hmac(key, utf8(data));
}

/** Compares two byte arrays without an early exit. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** The per-purpose keys derived from `CLOUDHAL_COMMENTS_KEY`. */
export interface CommentKeys {
  /** Signs proof-of-work challenges (`K_pow`, §7.2). */
  readonly pow: HmacKey;
  /** Keyed hash of lower-cased email addresses: lookups and bans (§4.1 `email_hmac`). */
  readonly emailHmac: HmacKey;
  /** AES-GCM for `commenter_emails.email_ciphertext`. */
  readonly email: AesKey;
  /** AES-GCM for `comment_secrets` (the owner's Turnstile secret). */
  readonly secrets: AesKey;
  /** Keys the optional `COMMENTS_RL` Rate Limiting binding by client network (§6.5). */
  readonly rateLimit: HmacKey;
}

export const KEY_INFO = {
  pow: "cloudhal/comments/pow/v1",
  emailHmac: "cloudhal/comments/email-hmac/v1",
  email: "cloudhal/comments/email/v1",
  secrets: "cloudhal/comments/secrets/v1",
  rateLimit: "cloudhal/comments/rl/v1",
} as const;

/** The deployment secret must carry at least 128 bits; generated ones carry 256. */
export const MIN_SECRET_LENGTH = 32;

/**
 * Derives the comment keys from the deployment secret (HKDF-SHA-256, empty salt, one info string
 * per purpose). Throws when the secret is shorter than 32 characters.
 */
export async function deriveCommentKeys(secret: string): Promise<CommentKeys> {
  if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH)
    throw new Error(`CLOUDHAL_COMMENTS_KEY must be at least ${MIN_SECRET_LENGTH} characters`);
  const ikm = await crypto.subtle.importKey("raw", utf8(secret), "HKDF", false, ["deriveKey"]);
  type DeriveArgs = Parameters<typeof crypto.subtle.deriveKey>;
  const derive = (info: string, algorithm: DeriveArgs[2], usages: DeriveArgs[4]) =>
    crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8(info) },
      ikm,
      algorithm,
      false,
      usages,
    );
  const hmacAlg = { name: "HMAC", hash: "SHA-256", length: 256 };
  const aesAlg = { name: "AES-GCM", length: 256 };
  const [pow, emailHmac, email, secrets, rateLimit] = await Promise.all([
    derive(KEY_INFO.pow, hmacAlg, ["sign"]),
    derive(KEY_INFO.emailHmac, hmacAlg, ["sign"]),
    derive(KEY_INFO.email, aesAlg, ["encrypt", "decrypt"]),
    derive(KEY_INFO.secrets, aesAlg, ["encrypt", "decrypt"]),
    derive(KEY_INFO.rateLimit, hmacAlg, ["sign"]),
  ]);
  return {
    pow: pow as HmacKey,
    emailHmac: emailHmac as HmacKey,
    email: email as AesKey,
    secrets: secrets as AesKey,
    rateLimit: rateLimit as HmacKey,
  };
}

export interface Sealed {
  /** base64url AES-GCM ciphertext with its tag. */
  readonly ciphertext: string;
  /** base64url 96-bit IV, fresh per encryption. */
  readonly iv: string;
}

/**
 * AES-GCM with a fresh 96-bit IV. `context` is bound as additional data (the site id, and the
 * secret's name for secrets), so a ciphertext copied to another site's row does not decrypt.
 */
export async function seal(key: AesKey, plaintext: string, context: string): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(context) },
    key,
    utf8(plaintext),
  );
  return { ciphertext: toBase64Url(new Uint8Array(ct)), iv: toBase64Url(iv) };
}

/** Opens what `seal` produced; throws when the key, context or bytes do not match. */
export async function open(key: AesKey, sealed: Sealed, context: string): Promise<string> {
  const iv = fromBase64Url(sealed.iv);
  const ct = fromBase64Url(sealed.ciphertext);
  if (!iv || !ct || iv.length !== 12) throw new Error("malformed ciphertext");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: utf8(context) },
    key,
    ct,
  );
  return new TextDecoder().decode(pt);
}
