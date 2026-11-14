/**
 * Entry-path safety (RFC-0046 §11a): every path in the manifest's listings and every tar entry
 * name is checked before any byte of that entry is used. One pass over the characters plus a
 * `split("/")`, no regular expression, so the check is linear in the path's length (AGENTS.md
 * rule 13). A failure is the refusal `entry-path`.
 */
import { refuse } from "./errors.ts";
import { MAX_PATH_BYTES } from "./limits.ts";

/** `module` and `entry` paths are relative; an `asset` path is `/<relative path>` (§3). */
export type PathKind = "module" | "asset" | "entry";

const utf8 = new TextEncoder();

/** Why `path` is unsafe as a `kind` path, or undefined when it is safe. */
export function unsafePathReason(path: string, kind: PathKind): string | undefined {
  if (utf8.encode(path).length > MAX_PATH_BYTES) return `longer than ${MAX_PATH_BYTES} bytes`;
  for (let i = 0; i < path.length; i++) {
    const c = path.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return "a control character";
    if (c === 0x5c) return "a backslash";
  }
  let rel = path;
  if (kind === "asset") {
    if (!path.startsWith("/")) return "an asset path that does not start with /";
    rel = path.slice(1);
  } else if (path.startsWith("/")) return "a leading /";
  for (const segment of rel.split("/")) {
    if (segment === "") return "an empty segment";
    if (segment === "." || segment === "..") return `a ${segment} segment`;
  }
  return undefined;
}

/** Refuses `path` (named `where` in the message) unless it is safe as a `kind` path. */
export function checkPath(path: string, kind: PathKind, where: string): void {
  const reason = unsafePathReason(path, kind);
  if (reason) refuse("entry-path", `${where}: ${JSON.stringify(path)} has ${reason}`);
}

/**
 * Case folding as case-insensitive file systems apply it, approximately: NFC, then upper and
 * lower case (so "ß" and "SS" meet). Two listed paths that fold equal would collide on disk.
 */
export const foldPath = (path: string): string => path.normalize("NFC").toUpperCase().toLowerCase();

/** Refuses two `paths` that are equal after case folding. */
export function checkNoFoldedDuplicates(paths: Iterable<string>, where: string): void {
  const seen = new Map<string, string>();
  for (const p of paths) {
    const f = foldPath(p);
    const other = seen.get(f);
    if (other !== undefined)
      refuse("entry-path", `${where}: ${JSON.stringify(other)} and ${JSON.stringify(p)} collide`);
    seen.set(f, p);
  }
}
