/**
 * What a consumer that keeps state remembers of the trust lists it has accepted (RFC-0046 §9), so
 * that neither a stolen yank key nor a replayed older list can take back a yank or a revocation.
 *
 * - The newest `keys.json` seen (`keysIssuedAt`): an older one is refused, so a list from before a
 *   revocation cannot bring a revoked yank key back.
 * - Every yank key a root list has revoked or replaced (`retiredYankKeys`): refused forever.
 * - The yank key of the last accepted list (`keyId`), its serial and every yanked version and
 *   revoked key: a later list from the same key may not go back in serial or drop an entry.
 * - A list from another yank key starts a new memory (rotation, and how the list is pruned) only
 *   when a `keys.json` newer than the remembered one lists that key and no longer lists the old
 *   one as active. `verifyKeys` allows at most one active yank key, so two cannot alternate.
 *
 * Store `rememberYanks(yanked, keys, memory)` after every accepted pair.
 */
import { refuse } from "./errors.ts";
import type { ReleaseKeys as KeyListDocument } from "./generated/release-keys.ts";
import type { ReleaseYankList } from "./generated/release-yank-list.ts";

export interface YankMemory {
  readonly keyId: string;
  readonly serial: number;
  readonly versions: readonly string[];
  readonly revokedKeys: readonly string[];
  /** `issuedAt` of the newest `keys.json` seen. */
  readonly keysIssuedAt: string;
  /** Yank keys a root list has revoked, or that a newer yank key replaced: never accepted again. */
  readonly retiredYankKeys: readonly string[];
}

const union = (...lists: readonly (readonly string[])[]) => [...new Set(lists.flat())].sort();

/** The memory after accepting `yanked` with `keys` (see the file comment). */
export function rememberYanks(
  yanked: { readonly document: ReleaseYankList },
  keys: { readonly document: KeyListDocument },
  previous?: YankMemory,
): YankMemory {
  const d = yanked.document;
  const revokedByRoot = keys.document.keys
    .filter((k) => k.role === "yank" && k.status === "revoked")
    .map((k) => k.keyId);
  const replaced = previous && previous.keyId !== d.signing.keyId ? [previous.keyId] : [];
  const newerKeys =
    previous && Date.parse(previous.keysIssuedAt) > Date.parse(keys.document.issuedAt)
      ? previous.keysIssuedAt
      : keys.document.issuedAt;
  return {
    keyId: d.signing.keyId,
    serial: d.serial,
    versions: d.versions.map((v) => v.version),
    revokedKeys: d.revokedKeys.map((k) => k.keyId),
    keysIssuedAt: newerKeys,
    retiredYankKeys: union(previous?.retiredYankKeys ?? [], revokedByRoot, replaced),
  };
}

/** Refuses a `keys.json` older than the newest one `memory` has seen (a replayed list). */
export function checkKeysMemory(keys: KeyListDocument, memory: YankMemory | undefined): void {
  if (memory && Date.parse(keys.issuedAt) < Date.parse(memory.keysIssuedAt))
    refuse(
      "key-list-invalid",
      `keys.json was issued ${keys.issuedAt}, before ${memory.keysIssuedAt} seen before: a replayed key list`,
    );
}

/** Refuses a yank list (with the key list it verified against) that goes back on `memory`. */
export function checkYankMemory(
  list: ReleaseYankList,
  keys: KeyListDocument,
  memory: YankMemory | undefined,
): void {
  if (!memory) return;
  checkKeysMemory(keys, memory);
  const signer = list.signing.keyId;
  if (memory.retiredYankKeys.includes(signer))
    refuse(
      "yank-list-invalid",
      `yanked.json is signed by ${signer}, a revoked or replaced yank key`,
    );
  if (memory.keyId !== signer) {
    const old = keys.keys.find((k) => k.keyId === memory.keyId);
    if (!(Date.parse(keys.issuedAt) > Date.parse(memory.keysIssuedAt)) || old?.status === "active")
      refuse(
        "stale-yank-list",
        `yanked.json is signed by ${signer}, not ${memory.keyId}: a new yank key needs a newer keys.json that replaces ${memory.keyId}`,
      );
    return;
  }
  if (list.serial < memory.serial)
    refuse(
      "stale-yank-list",
      `yanked.json has serial ${list.serial}, below ${memory.serial} seen before: a rolled-back list`,
    );
  const versions = new Set(list.versions.map((v) => v.version));
  const revoked = new Set(list.revokedKeys.map((k) => k.keyId));
  const dropped = [
    ...memory.versions.filter((v) => !versions.has(v)),
    ...memory.revokedKeys.filter((k) => !revoked.has(k)),
  ];
  if (dropped.length)
    refuse(
      "stale-yank-list",
      `yanked.json drops ${dropped.join(", ")}, seen before: a yank or revocation is never undone`,
    );
}
