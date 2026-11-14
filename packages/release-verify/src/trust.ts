/**
 * The signed key list and yank list (RFC-0046 §9, #226), and how they change what a consumer
 * trusts: only ever downwards.
 *
 * - `verifyKeys`: `keys.json` + `keys.json.sig`, signed by a pinned root, fresh (`issuedAt` ≤
 *   now < `expires`, at most 13 months apart).
 * - `verifyYanked`: `yanked.json` + `yanked.json.sig`, signed by a yank-role key that a verified
 *   `keys.json` lists as active and valid now, fresh (`expires` exactly 30 days after `issuedAt`;
 *   past it the list is stale, which blocks new installs only), and not rolled back below a
 *   `serial` the consumer has already seen.
 * - `mergeTrust`: pinned keys reduced by both: revoke, mark retiring, narrow the validity window.
 *   A key the lists name but the consumer does not pin is never added.
 */
import { sha256Hex, verifyEd25519 } from "./crypto.ts";
import { refuse } from "./errors.ts";
import type { ReleaseKeys as KeyListDocument, ListedKey } from "./generated/release-keys.ts";
import type { ReleaseYankList } from "./generated/release-yank-list.ts";
import { validateReleaseKeys, validateReleaseYankList } from "./generated/validators.js";
import { fromBase64, type ReleaseKey, type ReleaseKeys } from "./keys.ts";
import { checkKeysMemory, checkYankMemory, type YankMemory } from "./yank-memory.ts";

/** Root keys: they sign only `keys.json`. Pinned at the root ceremony; empty until then. */
export type RootKeys = Readonly<Record<string, { readonly publicKey: string }>>;

/**
 * The offline root's public key (docs/security/release-signing-keys.md, kept equal by
 * test/package.test.ts). Empty until the owner's root ceremony: until then `verifyKeys` refuses
 * every list unless a caller passes `roots`.
 */
export const PINNED_ROOTS: RootKeys = Object.freeze({});

export const KEYS_FILE = "keys.json";
export const YANKED_FILE = "yanked.json";
/** Where the lists live (RFC-0046 §9); `<file>.sig` next to each. */
export const TRUST_BASE_URL = "https://cloudhal.dev/.well-known/cloudhal/";

const MAX_KEYS_BYTES = 64 * 1024;
const MAX_YANKED_BYTES = 256 * 1024;
/** A list issued a little in the future is a clock skew, not an attack. */
const SKEW_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface VerifiedKeyList {
  readonly document: KeyListDocument;
  /** SHA-256 of the exact bytes, for logs. */
  readonly sha256: string;
}

export interface VerifiedYankList {
  readonly document: ReleaseYankList;
  readonly sha256: string;
}

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** The signed JSON document in `bytes` and its signing key id, before its signature is checked. */
function signedDoc(
  bytes: Uint8Array,
  signature: Uint8Array,
  max: number,
  code: "key-list-invalid" | "yank-list-invalid",
): { doc: unknown; keyId: string } {
  const what = code === "key-list-invalid" ? "keys.json" : "yanked.json";
  if (bytes.length > max) refuse(code, `${what} is above ${max} bytes`);
  if (signature.length !== 64) refuse(code, `${what}.sig is not 64 bytes`);
  let doc: unknown;
  try {
    doc = JSON.parse(utf8.decode(bytes));
  } catch {
    return refuse(code, `${what} is not UTF-8 JSON`);
  }
  const keyId = (doc as { signing?: { keyId?: unknown } } | null)?.signing?.keyId;
  if (typeof keyId !== "string") refuse(code, `${what} names no signing key`);
  return { doc, keyId: keyId as string };
}

/** `iso` plus `months` calendar months (UTC), clamped to the target month's last day (01-31 + 1 → 02-28/29). */
export function addMonths(iso: string, months: number): number {
  const d = new Date(iso);
  const target = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + months,
      1,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
    ),
  );
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return target.getTime();
}

/** Verifies `keys.json` (see the file comment); throws a `ReleaseVerifyError`. */
export async function verifyKeys(input: {
  document: Uint8Array;
  signature: Uint8Array;
  roots?: RootKeys;
  now?: Date;
  /** A consumer's `YankMemory`: a `keys.json` older than the newest one seen is refused. */
  memory?: YankMemory;
}): Promise<VerifiedKeyList> {
  const now = (input.now ?? new Date()).getTime();
  const { doc, keyId } = signedDoc(
    input.document,
    input.signature,
    MAX_KEYS_BYTES,
    "key-list-invalid",
  );
  const roots = input.roots ?? PINNED_ROOTS;
  const root = Object.hasOwn(roots, keyId) ? roots[keyId] : undefined;
  const raw = root ? fromBase64(root.publicKey) : undefined;
  if (raw?.length !== 32)
    refuse("key-list-invalid", `keys.json is signed by ${keyId}, not a pinned root`);
  if (!(await verifyEd25519(raw as Uint8Array, input.document, input.signature)))
    refuse("key-list-invalid", `keys.json.sig does not verify with ${keyId}`);
  if (!validateReleaseKeys(doc)) refuse("key-list-invalid", "keys.json is not a valid key list");
  const list = doc;
  const ids = new Set<string>();
  for (const k of list.keys) {
    if (ids.has(k.keyId)) refuse("key-list-invalid", `keys.json lists ${k.keyId} twice`);
    ids.add(k.keyId);
    if (!(Date.parse(k.notBefore) < Date.parse(k.notAfter)))
      refuse("key-list-invalid", `${k.keyId}: notBefore is not before notAfter`);
  }
  // One active yank key at a time: rotation replaces it, so a thief of one key cannot switch to
  // another to start a fresh memory (yank-memory.ts).
  const activeYank = list.keys.filter((k) => k.role === "yank" && k.status === "active");
  if (activeYank.length > 1)
    refuse(
      "key-list-invalid",
      `keys.json lists ${activeYank.length} active yank keys (${activeYank.map((k) => k.keyId).join(", ")}); at most one`,
    );
  const issued = Date.parse(list.issuedAt);
  const expires = Date.parse(list.expires);
  if (!(issued < expires) || expires > addMonths(list.issuedAt, 13))
    refuse("key-list-invalid", "keys.json must expire after issuedAt and within 13 months");
  if (issued > now + SKEW_MS) refuse("key-list-invalid", "keys.json is issued in the future");
  if (now >= expires) refuse("key-list-expired", `keys.json expired on ${list.expires}`);
  checkKeysMemory(list, input.memory);
  return { document: list, sha256: await sha256Hex(input.document) };
}

/**
 * Verifies `yanked.json` against a verified key list (see the file comment). A consumer that can
 * keep state passes its `memory` and stores `rememberYanks(result, keys, memory)` (yank-memory.ts):
 * a replayed older `keys.json`, a revoked or replaced yank key, a lower serial or a dropped entry
 * is refused. A stateless consumer (a Worker) cannot detect a replay or an un-yank: for it, a
 * stolen yank key can un-yank and un-revoke until the root rotates the yank key.
 */
export async function verifyYanked(input: {
  document: Uint8Array;
  signature: Uint8Array;
  keys: VerifiedKeyList;
  now?: Date;
  memory?: YankMemory;
}): Promise<VerifiedYankList> {
  const now = (input.now ?? new Date()).getTime();
  const { doc, keyId } = signedDoc(
    input.document,
    input.signature,
    MAX_YANKED_BYTES,
    "yank-list-invalid",
  );
  const signer: ListedKey | undefined = input.keys.document.keys.find((k) => k.keyId === keyId);
  if (signer?.role !== "yank" || signer.status !== "active")
    refuse("yank-list-invalid", `yanked.json is signed by ${keyId}, not an active yank key`);
  const key = signer as ListedKey;
  if (now < Date.parse(key.notBefore) || now > Date.parse(key.notAfter))
    refuse("yank-list-invalid", `the yank key ${keyId} is not valid now`);
  const raw = fromBase64(key.publicKey) as Uint8Array;
  if (!(await verifyEd25519(raw, input.document, input.signature)))
    refuse("yank-list-invalid", `yanked.json.sig does not verify with ${keyId}`);
  if (!validateReleaseYankList(doc))
    refuse("yank-list-invalid", "yanked.json is not a valid yank list");
  const list = doc;
  const issued = Date.parse(list.issuedAt);
  if (Date.parse(list.expires) - issued !== 30 * DAY_MS)
    refuse("yank-list-invalid", "yanked.json must expire exactly 30 days after issuedAt");
  if (issued > now + SKEW_MS) refuse("yank-list-invalid", "yanked.json is issued in the future");
  checkYankMemory(list, input.keys.document, input.memory);
  if (now >= Date.parse(list.expires))
    refuse(
      "stale-yank-list",
      `yanked.json expired on ${list.expires}; new installs wait for a fresh one`,
    );
  return { document: list, sha256: await sha256Hex(input.document) };
}

const RANK: Record<ReleaseKey["status"], number> = { active: 0, retiring: 1, revoked: 2 };
const later = (a: string | undefined, b: string) =>
  a === undefined || Date.parse(b) > Date.parse(a) ? b : a;
const earlier = (a: string | undefined, b: string) =>
  a === undefined || Date.parse(b) < Date.parse(a) ? b : a;

/**
 * `pinned` reduced by a verified key list and yank list (RFC-0046 §9). For each pinned key: a
 * listing with another public key or another role revokes it; otherwise the stricter status wins
 * and the window narrows to the intersection; `listed` records that a fresh list names it. A
 * revocation in either list revokes it. Keys the lists name but `pinned` lacks are not added.
 */
export function mergeTrust(
  pinned: ReleaseKeys,
  lists: { keys?: VerifiedKeyList; yanked?: VerifiedYankList } = {},
): ReleaseKeys {
  const out: Record<string, ReleaseKey> = {};
  const revokedByYank = new Set(lists.yanked?.document.revokedKeys.map((r) => r.keyId) ?? []);
  for (const [keyId, key] of Object.entries(pinned)) {
    let next: ReleaseKey = { ...key };
    const listed = lists.keys?.document.keys.find((k) => k.keyId === keyId);
    if (listed) {
      const conflict = listed.publicKey !== key.publicKey || listed.role !== "release";
      const status: ReleaseKey["status"] = conflict
        ? "revoked"
        : RANK[listed.status] > RANK[key.status]
          ? listed.status
          : key.status;
      next = {
        ...next,
        status,
        notBefore: later(key.notBefore, listed.notBefore),
        notAfter: earlier(key.notAfter, listed.notAfter),
        listed: status !== "revoked",
      };
    } else if (next.listed) {
      // Only a list verified now may confirm a key; a caller's own flag is not trusted.
      next = { ...next, listed: false };
    }
    if (revokedByYank.has(keyId)) next = { ...next, status: "revoked", listed: false };
    out[keyId] = Object.freeze(next);
  }
  return Object.freeze(out);
}

/** The yank entry for `version`, if the verified list yanks it. */
export function yankOf(
  yanked: VerifiedYankList | undefined,
  version: string,
): { reason: string; yankedAt: string } | undefined {
  return yanked?.document.versions.find((v) => v.version === version);
}
