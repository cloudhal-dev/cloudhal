/**
 * What `sign-yanked` signs (RFC-0046 §9, #226): the committed source, the published list carried
 * forward, and emergency entries from the workflow's inputs.
 *
 * The published list comes from the `yank-list` branch, which every Actions job with
 * `contents: write` could push to. So nothing of it is carried forward until it verifies exactly
 * as a consumer would verify it: its signature by the active yank key of the pinned-root
 * `keys.json`, its schema, its freshness. A list that fails is refused loudly, never re-signed.
 * After a yank-key rotation the published list is signed by the old key: it is verified with that
 * key as the newer `keys.json` still lists it (revoked or retiring), as of its own `issuedAt`, and
 * every entry is carried forward with the serial continuing. Only `--rotate` prunes: the new key's
 * list then starts from the committed source alone, at serial 1.
 */
import { existsSync, readFileSync } from "node:fs";
import type { VerifiedKeyList, YankMemory } from "../../packages/release-verify/src/index.ts";

type Verifier = typeof import("../../packages/release-verify/src/index.ts");

export interface YankSource {
  versions: { version: string; yankedAt: string; reason: string }[];
  revokedKeys: { keyId: string; revokedAt: string; reason: string }[];
}

/** The published `yanked.json` and its signature, as read (not yet verified). */
export interface PublishedPair {
  readonly document: Uint8Array;
  readonly signature: Uint8Array;
}

const KEY_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const VERSION =
  /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})(-[0-9A-Za-z.-]{1,64})?$/;
/** Entries one dispatch may add (versions and key ids together). */
export const MAX_EXTRA = 20;

/** Emergency yanks or revocations (the workflow's inputs: comma-separated), stamped `now`. */
export interface YankExtra {
  readonly yank?: string;
  readonly revoke?: string;
  readonly reason?: string;
}

const iso = (ms: number) =>
  new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");

/** `a, b,c` → `["a", "b", "c"]`; empty items are an error, not skipped. */
function items(value: string | undefined, what: string): string[] {
  if (value === undefined || value.trim() === "") return [];
  if (value.length > 2000) throw new Error(`the ${what} list is too long`);
  const list = value.split(",").map((s) => s.trim());
  if (list.some((s) => s === "")) throw new Error(`the ${what} list has an empty item`);
  return [...new Set(list)];
}

/** The emergency entries, once each is well-formed, and their shared reason. */
export function parseExtra(extra: YankExtra): {
  versions: string[];
  keyIds: string[];
  reason: string;
} {
  const versions = items(extra.yank, "yank");
  const keyIds = items(extra.revoke, "revoke");
  const reason = extra.reason?.trim() ?? "";
  if ((versions.length || keyIds.length) && !reason)
    throw new Error("an emergency yank or revocation needs a reason");
  if (reason.length > 500) throw new Error("the reason is longer than 500 characters");
  if (versions.length + keyIds.length > MAX_EXTRA)
    throw new Error(`at most ${MAX_EXTRA} emergency entries per run`);
  for (const v of versions) if (!VERSION.test(v)) throw new Error(`not a version: ${v}`);
  for (const k of keyIds) if (!KEY_ID.test(k)) throw new Error(`not a key id: ${k}`);
  return { versions, keyIds, reason };
}

/** Refuses a list that drops an entry of the published one (the list is append-only). */
export function checkAppendOnly(source: YankSource, published: YankSource | undefined): void {
  if (!published) return;
  const versions = new Set(source.versions.map((v) => v.version));
  for (const v of published.versions)
    if (!versions.has(v.version))
      throw new Error(`the yank list drops ${v.version}; a yank is never undone`);
  const keys = new Set(source.revokedKeys.map((k) => k.keyId));
  for (const k of published.revokedKeys)
    if (!keys.has(k.keyId))
      throw new Error(
        `the yank list drops the revoked key ${k.keyId}; a revocation is never undone`,
      );
}

/**
 * The list to sign: every entry of the (verified) published list, the committed source, and the
 * emergency entries, each once, in that order. An entry already listed keeps its date and reason.
 */
export function mergeYankList(
  source: YankSource,
  published: YankSource | undefined,
  extra: YankExtra,
  now: number,
): YankSource {
  const add = parseExtra(extra);
  const versions = new Map<string, YankSource["versions"][number]>();
  const keys = new Map<string, YankSource["revokedKeys"][number]>();
  for (const list of [published, source])
    for (const v of list?.versions ?? []) if (!versions.has(v.version)) versions.set(v.version, v);
  for (const list of [published, source])
    for (const k of list?.revokedKeys ?? []) if (!keys.has(k.keyId)) keys.set(k.keyId, k);
  for (const version of add.versions)
    if (!versions.has(version))
      versions.set(version, { version, yankedAt: iso(now), reason: add.reason });
  for (const keyId of add.keyIds)
    if (!keys.has(keyId)) keys.set(keyId, { keyId, revokedAt: iso(now), reason: add.reason });
  return { versions: [...versions.values()], revokedKeys: [...keys.values()] };
}

/** The verified published list: its entries, serial and the memory the next list must keep. */
export interface VerifiedPublished {
  readonly list: YankSource;
  readonly serial: number;
  readonly memory: YankMemory;
}

const signerOf = (bytes: Uint8Array): string | undefined => {
  try {
    const doc = JSON.parse(new TextDecoder().decode(bytes)) as { signing?: { keyId?: unknown } };
    return typeof doc?.signing?.keyId === "string" ? doc.signing.keyId : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The published list, verified as a consumer would (see the file comment), or undefined for the
 * first list and after a rotation. `acceptExpired` lets an operator carry forward a list that
 * expired during an outage: it is then verified as of its own `issuedAt` (signature, schema and
 * the signer's window), never unverified.
 */
export async function verifyPublished(o: {
  rv: Verifier;
  keys: VerifiedKeyList;
  keyId: string;
  published: PublishedPair | undefined;
  now: number;
  rotate?: boolean;
  acceptExpired?: boolean;
}): Promise<VerifiedPublished | undefined> {
  if (!o.published) {
    if (o.rotate) throw new Error("--rotate needs the published list it replaces");
    return undefined;
  }
  const signer = signerOf(o.published.document);
  if (o.rotate) {
    if (signer === o.keyId)
      throw new Error(`--rotate: the published list is already signed by ${o.keyId}`);
    return undefined;
  }
  if (signer !== o.keyId) return verifyRotated(o, o.published, signer);
  const pair = o.published;
  const check = (at: number) => o.rv.verifyYanked({ ...pair, keys: o.keys, now: new Date(at) });
  let verified: Awaited<ReturnType<typeof check>>;
  try {
    verified = await check(o.now);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (!(code === "stale-yank-list" && o.acceptExpired))
      throw new Error(
        `the published yank list does not verify (${code ?? "error"}: ${(e as Error).message}); nothing carried forward, nothing signed`,
      );
    verified = await check(Date.parse(issuedAtOf(pair))).catch((again: Error) => {
      throw new Error(`the published yank list does not verify: ${again.message}`);
    });
  }
  const d = verified.document;
  return {
    list: { versions: d.versions, revokedKeys: d.revokedKeys },
    serial: d.serial,
    memory: o.rv.rememberYanks(verified, o.keys),
  };
}

/** No `keys.json` is known for a list the old yank key signed: the epoch, so the current one is newer. */
const UNKNOWN_KEY_LIST = "1970-01-01T00:00:00Z";

/**
 * The last list of the yank key a rotation replaced (see the file comment). The current
 * `keys.json` must still list that key with role `yank`; its list is verified with it as of the
 * list's `issuedAt`. The memory names no `keys.json` (`UNKNOWN_KEY_LIST`): the one that list was
 * valid under is not known here, and the current one replaces the old key, as it does for every
 * consumer.
 */
async function verifyRotated(
  o: { rv: Verifier; keys: VerifiedKeyList; keyId: string },
  pair: PublishedPair,
  signer: string | undefined,
): Promise<VerifiedPublished> {
  const old = o.keys.document.keys.find((k) => k.keyId === signer && k.role === "yank");
  if (!old)
    throw new Error(
      `the published yank list is signed by ${signer ?? "no key"}, which keys.json does not list as a yank key: keep the old yank key listed (revoked or retiring) to carry its list forward, or prune with --rotate`,
    );
  const asSigned = {
    ...o.keys,
    document: {
      ...o.keys.document,
      keys: o.keys.document.keys.map((k) =>
        k.keyId === old.keyId ? { ...k, status: "active" as const } : k,
      ),
    },
  };
  let verified: Awaited<ReturnType<Verifier["verifyYanked"]>>;
  try {
    verified = await o.rv.verifyYanked({
      ...pair,
      keys: asSigned,
      now: new Date(Date.parse(issuedAtOf(pair))),
    });
  } catch (e) {
    throw new Error(
      `the published yank list (signed by the replaced key ${old.keyId}) does not verify: ${(e as Error).message}; nothing carried forward, nothing signed`,
    );
  }
  const d = verified.document;
  return {
    list: { versions: d.versions, revokedKeys: d.revokedKeys },
    serial: d.serial,
    memory: { ...o.rv.rememberYanks(verified, o.keys), keysIssuedAt: UNKNOWN_KEY_LIST },
  };
}

const issuedAtOf = (pair: PublishedPair): string =>
  String((JSON.parse(new TextDecoder().decode(pair.document)) as { issuedAt?: unknown }).issuedAt);

/** The published pair at `from` (a file or an https URL, `.sig` next to it), if there is one. */
export async function readPublished(
  from: string | undefined,
  firstRun: boolean,
): Promise<PublishedPair | undefined> {
  if (!from) {
    if (firstRun) return undefined;
    throw new Error("--published is required (or --first-run for the very first list)");
  }
  if (from.startsWith("https://")) {
    const get = async (url: string) => {
      const res = await fetch(url);
      if (res.status === 404 && firstRun) return undefined;
      if (!res.ok) throw new Error(`could not read ${url} (${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    };
    const document = await get(from);
    if (!document) return undefined;
    const signature = await get(`${from}.sig`);
    if (!signature) throw new Error(`${from} has no .sig next to it`);
    return { document, signature };
  }
  if (!existsSync(from)) {
    if (firstRun) return undefined;
    throw new Error(`there is no published yank list at ${from}`);
  }
  if (firstRun) throw new Error(`--first-run, but a published yank list exists at ${from}`);
  return { document: readFileSync(from), signature: readFileSync(`${from}.sig`) };
}
