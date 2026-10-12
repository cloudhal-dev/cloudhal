/**
 * Hashes and ids (RFC-0007 §4.4, §9.2, §10.3):
 *
 * - `ipHmac` — first 16 bytes of HMAC-SHA-256(salt_month, siteId ‖ "\n" ‖ network), hex. IPv6
 *   addresses are cut to their /64 first and IPv4-mapped addresses read as IPv4, so a client
 *   cannot dodge limits by rotating within its own prefix. The salt is random per UTC month and
 *   deleted when two months old; without it the hash cannot be recomputed.
 * - `emailHmac` — HMAC-SHA-256(K_email-hmac, lower-cased address), hex: lookups and bans.
 * - `sealEmail` — AES-GCM under K_email with the site id bound as additional data.
 * - `commentRecordHash` — SHA-256 of the canonical `Comment` record (the `hash` column that guards
 *   follow-up statements, AGENTS.md rule 4).
 * - `commentStateHash` — the `cm1:` binding of an approval to comment state: SHA-256 over the
 *   sorted lines `c <commentId> <rev> <status>` and `t <nodeId> <rev|0> <effective state>`.
 */
import type { Comment } from "@cloudhal/core-contracts";
import {
  type CommentKeys,
  fromBase64Url,
  hmac,
  hmacRaw,
  open,
  type Sealed,
  seal,
  sha256Hex,
  toHex,
  utf8,
} from "./crypto.ts";
import type { CommentStatus, ThreadState } from "./model.ts";

/** Deterministic JSON: object keys sorted recursively, undefined dropped. */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) {
        const x = (v as Record<string, unknown>)[k];
        if (x !== undefined) out[k] = sort(x);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

export const commentRecordHash = (comment: Comment): Promise<string> =>
  sha256Hex(canonicalJson(comment));

const IPV4 = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Expands an IPv6 address to 8 groups of 4 hex digits; `undefined` when it is not one. */
function expandIpv6(address: string): string[] | undefined {
  let a = address.toLowerCase();
  const zone = a.indexOf("%");
  if (zone >= 0) a = a.slice(0, zone);
  if (a.startsWith("[") && a.endsWith("]")) a = a.slice(1, -1);
  // embedded IPv4 tail
  const lastColon = a.lastIndexOf(":");
  const tail = a.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (!IPV4.test(tail)) return undefined;
    const [p, q, r, s] = tail.split(".").map(Number) as [number, number, number, number];
    a = `${a.slice(0, lastColon + 1)}${((p << 8) | q).toString(16)}:${((r << 8) | s).toString(16)}`;
  }
  const halves = a.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined;
  const groups = [...left, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return undefined;
  return groups.map((g) => g.padStart(4, "0"));
}

/**
 * The network a client is limited and banned by: an IPv4 address as is, an IPv6 address as its
 * /64 (`2001:0db8:0001:0002::/64`), an IPv4-mapped IPv6 address as its IPv4. Anything else is used
 * lower-cased as given (the runtime vouches for the address; it is never a client header).
 */
export function clientNetwork(address: string): string {
  const a = address.trim();
  if (IPV4.test(a)) return a;
  const groups = expandIpv6(a);
  if (!groups) return a.toLowerCase();
  if (groups.slice(0, 5).every((g) => g === "0000") && groups[5] === "ffff") {
    const hi = Number.parseInt(groups[6] ?? "0", 16);
    const lo = Number.parseInt(groups[7] ?? "0", 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return `${groups.slice(0, 4).join(":")}::/64`;
}

const SALT_RE = /^[0-9a-f]{64}$/;

/** 32 random bytes as 64 lower-case hex characters (a fresh monthly salt). */
export function randomSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function ipHmac(salt: string, siteId: string, address: string): Promise<string> {
  if (!SALT_RE.test(salt)) throw new Error("a salt is 64 lower-case hex characters");
  const raw = new Uint8Array(32);
  for (let i = 0; i < 32; i++) raw[i] = Number.parseInt(salt.slice(i * 2, i * 2 + 2), 16);
  const mac = await hmacRaw(raw, `${siteId}\n${clientNetwork(address)}`);
  return toHex(mac.slice(0, 16));
}

export async function emailHmac(keys: CommentKeys, email: string): Promise<string> {
  return toHex(await hmac(keys.emailHmac, utf8(email.trim().toLowerCase())));
}

const emailContext = (siteId: string) => `email\n${siteId}`;
const secretContext = (siteId: string, name: string) => `secret\n${siteId}\n${name}`;

export const sealEmail = (keys: CommentKeys, siteId: string, email: string): Promise<Sealed> =>
  seal(keys.email, email.trim().toLowerCase(), emailContext(siteId));

export const openEmail = (keys: CommentKeys, siteId: string, sealed: Sealed): Promise<string> =>
  open(keys.email, sealed, emailContext(siteId));

export const sealSecret = (keys: CommentKeys, siteId: string, name: string, value: string) =>
  seal(keys.secrets, value, secretContext(siteId, name));

export const openSecret = (keys: CommentKeys, siteId: string, name: string, sealed: Sealed) =>
  open(keys.secrets, sealed, secretContext(siteId, name));

export interface StateHashInput {
  readonly comments: readonly {
    readonly id: string;
    readonly rev: number;
    readonly status: CommentStatus | "missing";
  }[];
  readonly threads: readonly {
    readonly nodeId: string;
    readonly rev: number;
    readonly state: ThreadState;
  }[];
}

export const STATE_HASH_PREFIX = "cm1:";

/** The `cm1:` binding of an approval to the comments and threads it names (§10.3). */
export async function commentStateHash(input: StateHashInput): Promise<string> {
  const lines = [
    ...input.comments.map((c) => `c ${c.id} ${c.rev} ${c.status}`),
    ...input.threads.map((t) => `t ${t.nodeId} ${t.rev} ${t.state}`),
  ];
  lines.sort();
  return `${STATE_HASH_PREFIX}${await sha256Hex(lines.join("\n"))}`;
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A prefixed random id (`cmt_…`, `cmr_…`), Crockford base32 like core-ts `newId`. */
export function newCommentsId(prefix: string, length = 20): string {
  if (!/^[a-z]+$/.test(prefix)) throw new Error(`invalid id prefix "${prefix}"`);
  let out = "";
  for (const b of crypto.getRandomValues(new Uint8Array(length))) out += ALPHABET[b % 32];
  return `${prefix}_${out}`;
}

export const ID_PREFIX = {
  comment: "cmt",
  commenter: "cmr",
  report: "crp",
  ban: "cban",
  op: "op",
} as const;

/** True for a base64url string that decodes (used to validate stored ciphertext columns). */
export const isBase64Url = (s: string): boolean => fromBase64Url(s) !== undefined;
