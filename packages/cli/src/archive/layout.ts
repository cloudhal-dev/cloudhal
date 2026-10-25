/**
 * The closed list of paths a site archive holds (RFC-0039 §1 and Security) and the one order the
 * writer writes them in, which the manifest lists and the reader checks:
 *
 * `manifest.json`, `project.json`, `nodes/NNNN.ndjson`, `snapshots/NNNN.ndjson`,
 * `blobs/NNNN.ndjson`, `media/<sha256>` (ascending), `ledger.ndjson`.
 *
 * Any other path, including `..`, absolute paths, backslashes, `./` and part number `0000`, is
 * not part of the layout.
 */
import { ArchiveError } from "./errors.ts";
import { MAX_PART_INDEX } from "./limits.ts";

export type PartKind = "nodes" | "snapshots" | "blobs";

/** The part kinds in archive order. */
export const PART_KINDS: readonly PartKind[] = ["nodes", "snapshots", "blobs"];

/** What a layout path names. */
export type ArchiveSlot =
  | { kind: "manifest" }
  | { kind: "project" }
  | { kind: "part"; part: PartKind; index: number }
  | { kind: "media"; sha256: string }
  | { kind: "ledger" };

/** A slot whose file the reader buffers and hands over whole. */
export type FileSlot = Exclude<ArchiveSlot, { kind: "manifest" } | { kind: "media" }>;

export const MANIFEST_PATH = "manifest.json";
export const PROJECT_PATH = "project.json";
export const LEDGER_PATH = "ledger.ndjson";

export const SHA256_HEX = /^[0-9a-f]{64}$/;

const PART_PATH = /^(nodes|snapshots|blobs)\/([0-9]{4})\.ndjson$/;
const MEDIA_PATH = /^media\/([0-9a-f]{64})$/;

/** The slot `path` names, or undefined when the path is not in the layout. */
export function classifyPath(path: string): ArchiveSlot | undefined {
  if (path === MANIFEST_PATH) return { kind: "manifest" };
  if (path === PROJECT_PATH) return { kind: "project" };
  if (path === LEDGER_PATH) return { kind: "ledger" };
  const part = PART_PATH.exec(path);
  if (part) {
    const index = Number(part[2]);
    return index >= 1 ? { kind: "part", part: part[1] as PartKind, index } : undefined;
  }
  const media = MEDIA_PATH.exec(path);
  return media ? { kind: "media", sha256: media[1] as string } : undefined;
}

/** `nodes/0001.ndjson` for part 1 of the nodes. */
export function partPath(part: PartKind, index: number): string {
  if (!Number.isInteger(index) || index < 1 || index > MAX_PART_INDEX)
    throw new ArchiveError(
      "too_large",
      `${part}: an archive holds at most ${MAX_PART_INDEX} parts of each kind`,
    );
  return `${part}/${String(index).padStart(4, "0")}.ndjson`;
}

export function mediaPath(sha256: string): string {
  return `media/${sha256}`;
}

const RANK = { manifest: 0, project: 1, nodes: 2, snapshots: 3, blobs: 4, media: 5, ledger: 6 };

function rank(slot: ArchiveSlot): number {
  return slot.kind === "part" ? RANK[slot.part] : RANK[slot.kind];
}

/** Archive order; 0 only for the same slot. Media hashes compare by code unit, never by locale. */
export function compareSlots(a: ArchiveSlot, b: ArchiveSlot): number {
  const byRank = rank(a) - rank(b);
  if (byRank !== 0) return byRank;
  if (a.kind === "part" && b.kind === "part") return a.index - b.index;
  if (a.kind === "media" && b.kind === "media")
    return a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0;
  return 0;
}
