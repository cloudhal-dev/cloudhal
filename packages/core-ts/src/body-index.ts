/**
 * The block index the store keeps on markdown bodies (RFC-0014 §3, ADR-0028).
 *
 * On every write the body is split (`splitMarkdown`, §2) and each block hashed (SHA-256 of its
 * source without trailing whitespace). Ids carry over from the previous index: blocks whose hash
 * is unchanged are matched first (longest common subsequence, so inserts around them do not
 * disturb them), then blocks that moved (the same hash elsewhere), then, between two matches,
 * removed and added blocks that share most of their words (in order; by position when only
 * replacements are left) as edits that keep their ids. `by`/`via`/`at`
 * change only with a block's hash. Whatever index a client sent is ignored; HTML bodies have none.
 */
import type { Actor, BodyBlock } from "@cloudhal/core-contracts";
import { EDIT_SIMILARITY, lcsPairs, similarity, splitMarkdown } from "./body-blocks.ts";
import { sha256Hex } from "./hash.ts";

/** Who is writing, for the provenance of the blocks they change. */
export interface BlockWriter {
  readonly actor: Actor;
  readonly via: NonNullable<BodyBlock["via"]>;
}

/** The index of a markdown body; `blocks` is absent past the contract's 5,000 blocks. */
export interface BodyIndex {
  profile: 1;
  blocks?: BodyBlock[];
}

/** Bodies with more blocks than this keep no index (the contract's `maxItems`). */
export const MAX_INDEXED_BLOCKS = 5000;

/** A body's blocks as their trimmed sources, in order. */
function blockTexts(markdown: string): string[] {
  return splitMarkdown(markdown).units.map((u) => u.raw.trimEnd());
}

/** Hashes of a body's blocks, in order. */
export async function blockHashes(markdown: string): Promise<string[]> {
  return Promise.all(blockTexts(markdown).map((t) => sha256Hex(t)));
}

/**
 * The index for `markdown`.
 *
 * @param previous the stored body's index, when it has one
 * @param previousMarkdown the stored body, used when it has no index yet: its blocks keep no
 *   provenance unless they change
 */
export async function indexMarkdown(input: {
  markdown: string;
  previous?: readonly BodyBlock[] | undefined;
  previousMarkdown?: string | undefined;
  writer?: BlockWriter | undefined;
  at: string;
  newId: () => string;
}): Promise<BodyIndex> {
  const texts = blockTexts(input.markdown);
  if (texts.length > MAX_INDEXED_BLOCKS) return { profile: 1 };
  const hashes = await Promise.all(texts.map((t) => sha256Hex(t)));
  const oldTexts = input.previousMarkdown !== undefined ? blockTexts(input.previousMarkdown) : [];
  const old: BodyBlock[] =
    input.previous && input.previous.length === oldTexts.length
      ? [...input.previous]
      : input.previousMarkdown !== undefined
        ? virtualIds(await Promise.all(oldTexts.map((t) => sha256Hex(t))))
        : [];
  const changed = (hash: string, id: string): BodyBlock => ({
    id,
    hash,
    ...(input.writer ? { by: input.writer.actor, via: input.writer.via } : {}),
    at: input.at,
  });
  // 1. Unchanged blocks in order (longest common subsequence of hashes).
  const result: (BodyBlock | undefined)[] = new Array(hashes.length);
  const used = new Set<number>();
  const anchors = lcsPairs(
    old.map((b) => b.hash),
    hashes,
  );
  for (const [pi, pj] of anchors) {
    result[pj] = old[pi];
    used.add(pi);
  }
  // 2. Moved blocks: the same content elsewhere keeps its id and provenance.
  const spare = new Map<string, number[]>();
  old.forEach((b, i) => {
    if (!used.has(i)) spare.set(b.hash, [...(spare.get(b.hash) ?? []), i]);
  });
  hashes.forEach((hash, j) => {
    if (result[j]) return;
    const i = spare.get(hash)?.shift();
    if (i === undefined) return;
    result[j] = old[i];
    used.add(i);
  });
  // 3. Edited blocks: between two anchors, what is left on both sides pairs up, in order, by the
  //    words they share; when only replacements are left (as many on both sides), by position.
  let i = 0;
  let j = 0;
  for (const [pi, pj] of [...anchors, [old.length, hashes.length] as [number, number]]) {
    const removed: number[] = [];
    for (let k = i; k < pi; k++) if (!used.has(k)) removed.push(k);
    const added: number[] = [];
    for (let k = j; k < pj; k++) if (!result[k]) added.push(k);
    let from = 0;
    const left: number[] = [];
    for (const k of added) {
      const at = removed.findIndex(
        (r, n) => n >= from && similarity(oldTexts[r] ?? "", texts[k] as string) >= EDIT_SIMILARITY,
      );
      if (at < 0) {
        left.push(k);
        continue;
      }
      result[k] = changed(hashes[k] as string, (old[removed[at] as number] as BodyBlock).id);
      used.add(removed[at] as number);
      from = at + 1;
    }
    const rest = removed.filter((r) => !used.has(r));
    left.forEach((k, n) => {
      const reuse = rest.length === left.length ? old[rest[n] as number] : undefined;
      result[k] = changed(hashes[k] as string, reuse?.id ?? input.newId());
    });
    i = pi + 1;
    j = pj + 1;
  }
  const blocks = result as BodyBlock[];
  return { profile: 1, blocks };
}

/**
 * Ids for blocks of a body the store has not indexed (written before the index existed, or over
 * `MAX_INDEXED_BLOCKS`): derived from each block's hash and how often that hash came before, so
 * `get_body` shows the same ids every time and the store's first indexing write keeps them.
 */
export function virtualIds(hashes: readonly string[]): BodyBlock[] {
  const seen = new Map<string, number>();
  return hashes.map((hash) => {
    const n = seen.get(hash) ?? 0;
    seen.set(hash, n + 1);
    return { id: `blk_v${hash.slice(0, 18)}${n ? n.toString(36) : ""}`, hash };
  });
}

/**
 * The blocks of a markdown body with their ids: the stored index when it matches the body,
 * otherwise `virtualIds`. Each entry carries the block's source (without trailing whitespace).
 */
export async function currentBlocks(
  markdown: string,
  index: readonly BodyBlock[] | undefined,
): Promise<(BodyBlock & { type: string; markdown: string })[]> {
  const units = splitMarkdown(markdown).units;
  const hashes = await Promise.all(units.map((u) => sha256Hex(u.raw.trimEnd())));
  const fits = index?.length === units.length && index.every((b, i) => b.hash === hashes[i]);
  const blocks = fits ? index : virtualIds(hashes);
  return units.map((u, i) => ({
    ...(blocks[i] as BodyBlock),
    type: u.type,
    markdown: u.raw.trimEnd(),
  }));
}

/** A body without the store-written fields (what a client's write is reduced to first). */
export function withoutIndex<T extends { profile?: unknown; blocks?: unknown }>(
  body: T,
): Omit<T, "profile" | "blocks"> {
  const { profile: _profile, blocks: _blocks, ...rest } = body;
  return rest;
}
