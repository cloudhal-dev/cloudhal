/**
 * The signed key list and yank list for `cloudhal deploy --release` (RFC-0046 §9, §11b).
 *
 * - Online: both lists (each with its `.sig`) from cloudhal.dev on every run. There is no fallback
 *   to a release asset or a cached copy: a copy can be older than a revocation.
 * - `--from <dir>`: both lists from that directory, under the same rules.
 * - `keys.json` must verify with the root this CLI pins and be unexpired; `yanked.json` with the
 *   yank key it lists, unexpired. Both are checked against the CLI's `YankMemory` (a replayed
 *   older key list, a revoked or replaced yank key, a lower serial, a dropped entry), and the new
 *   memory is stored only after both pass.
 * - Before the owner's root ceremony no root is pinned, so nothing can be checked: refused.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  KEYS_FILE,
  PINNED_ROOTS,
  type RootKeys,
  rememberYanks,
  TRUST_BASE_URL,
  type VerifiedKeyList,
  type VerifiedYankList,
  verifyKeys,
  verifyYanked,
  YANKED_FILE,
  type YankMemory,
} from "@cloudhal/release-verify";
import { refuseDeploy } from "./errors.ts";

/** Where the CLI keeps its `YankMemory`: one per user, shared by every project. */
export const defaultTrustStateFile = () =>
  path.join(os.homedir(), ".cloudhal", "release-trust.json");

const MAX_LIST_BYTES = 256 * 1024;

export interface TrustInput {
  /** `--from <dir>`, else the canonical URLs. */
  readonly from?: string | undefined;
  readonly fetch?: typeof fetch;
  /** Tests only: roots other than the pinned ones. */
  readonly roots?: RootKeys;
  /** Default: `defaultTrustStateFile()`. */
  readonly stateFile?: string;
  readonly now?: Date;
}

export interface Trust {
  readonly keys: VerifiedKeyList;
  readonly yanked: VerifiedYankList;
}

const CEREMONY =
  "no root key is pinned in this CLI yet: the owner's root ceremony (docs/security/release-signing-keys.md › First-time setup) has not happened, so the signed key and yank lists cannot be checked and revocations would go unseen";

async function readList(input: TrustInput, name: string): Promise<Uint8Array> {
  if (input.from !== undefined) {
    const file = path.join(input.from, name);
    if (!existsSync(file))
      return refuseDeploy(
        "trust-unavailable",
        `--from ${input.from} has no ${name}: an offline install needs keys.json and yanked.json, each with its .sig, next to the release assets`,
      );
    const bytes = new Uint8Array(await readFile(file));
    if (bytes.length > MAX_LIST_BYTES)
      return refuseDeploy("trust-unavailable", `${file} is above ${MAX_LIST_BYTES} bytes`);
    return bytes;
  }
  const url = TRUST_BASE_URL + name;
  let res: Response;
  try {
    res = await (input.fetch ?? fetch)(url);
  } catch (e) {
    return refuseDeploy(
      "trust-unavailable",
      `could not fetch ${url} (${(e as Error).message}); --release never falls back to an older copy`,
    );
  }
  if (res.status !== 200)
    return refuseDeploy(
      "trust-unavailable",
      `${url} answered ${res.status}; --release never falls back to an older copy`,
    );
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_LIST_BYTES)
    return refuseDeploy("trust-unavailable", `${url} is above ${MAX_LIST_BYTES} bytes`);
  return bytes;
}

async function readMemory(file: string): Promise<YankMemory | undefined> {
  if (!existsSync(file)) return undefined;
  try {
    const m = JSON.parse(await readFile(file, "utf8")) as { yankMemory?: YankMemory };
    const y = m.yankMemory;
    if (
      !y ||
      typeof y.keyId !== "string" ||
      typeof y.serial !== "number" ||
      typeof y.keysIssuedAt !== "string" ||
      !Array.isArray(y.versions) ||
      !Array.isArray(y.revokedKeys) ||
      !Array.isArray(y.retiredYankKeys)
    )
      throw new Error("not a yank memory");
    return y;
  } catch (e) {
    // A damaged memory is never silently dropped: that would undo what it protects.
    return refuseDeploy(
      "trust-unavailable",
      `${file} cannot be read (${(e as Error).message}); move it aside only if you know why it changed`,
    );
  }
}

const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])].sort();
const later = (a: string, b: string) => (Date.parse(a) >= Date.parse(b) ? a : b);

/**
 * Two memories combined so neither loses what it saw: for the same yank key the higher serial,
 * the newer key list and the union of every entry; across a rotation the memory of the newer key
 * list, still carrying every retired yank key of both.
 */
export function mergeMemory(disk: YankMemory | undefined, next: YankMemory): YankMemory {
  if (!disk) return next;
  const retiredYankKeys = union(disk.retiredYankKeys, next.retiredYankKeys);
  if (disk.keyId !== next.keyId) {
    const newer = Date.parse(disk.keysIssuedAt) > Date.parse(next.keysIssuedAt) ? disk : next;
    return { ...newer, retiredYankKeys: retiredYankKeys.filter((k) => k !== newer.keyId) };
  }
  return {
    keyId: next.keyId,
    serial: Math.max(disk.serial, next.serial),
    versions: union(disk.versions, next.versions),
    revokedKeys: union(disk.revokedKeys, next.revokedKeys),
    keysIssuedAt: later(disk.keysIssuedAt, next.keysIssuedAt),
    retiredYankKeys,
  };
}

/** Stores `memory`, merged with whatever another run stored meanwhile (re-read just before). */
async function writeMemory(file: string, memory: YankMemory): Promise<void> {
  try {
    await mkdir(path.dirname(file), { recursive: true });
    const merged = mergeMemory(await readMemory(file), memory);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, `${JSON.stringify({ yankMemory: merged }, null, 2)}\n`, { mode: 0o600 });
    await rename(tmp, file);
  } catch (e) {
    if ((e as { code?: string }).code === "trust-unavailable") throw e;
    refuseDeploy(
      "trust-state",
      `the lists verified, but the yank memory could not be saved to ${file} (${(e as Error).message}); nothing was deployed`,
    );
  }
}

/** Both lists, verified and checked against the memory, which is then updated (see the file comment). */
export async function loadTrust(input: TrustInput): Promise<Trust> {
  const roots = input.roots ?? PINNED_ROOTS;
  if (Object.keys(roots).length === 0) refuseDeploy("trust-unavailable", CEREMONY);
  const stateFile = input.stateFile ?? defaultTrustStateFile();
  const memory = await readMemory(stateFile);
  const now = input.now ?? new Date();
  const [keysDoc, keysSig, yankDoc, yankSig] = await Promise.all(
    [KEYS_FILE, `${KEYS_FILE}.sig`, YANKED_FILE, `${YANKED_FILE}.sig`].map((n) =>
      readList(input, n),
    ),
  );
  try {
    const keys = await verifyKeys({
      document: keysDoc as Uint8Array,
      signature: keysSig as Uint8Array,
      roots,
      now,
      ...(memory ? { memory } : {}),
    });
    const yanked = await verifyYanked({
      document: yankDoc as Uint8Array,
      signature: yankSig as Uint8Array,
      keys,
      now,
      ...(memory ? { memory } : {}),
    });
    await writeMemory(stateFile, rememberYanks(yanked, keys, memory));
    return { keys, yanked };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (!code || code === "trust-state") throw e;
    return refuseDeploy(
      "trust-unavailable",
      `the signed key and yank lists do not verify (${code}: ${(e as Error).message}); there is no override`,
    );
  }
}
