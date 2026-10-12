/**
 * "Own" (RFC-0005 §4): who owns an entry, what an own-limited caller may do to it, and when a change
 * set is own-only. REST handlers and MCP tool handlers use the same helpers (I9, I10).
 */
import type { Actor, ContentEntry, NodeRef, Site } from "@cloudhal/core-contracts";
import type { OwnLimit } from "./policy.ts";

/**
 * Maps an actor to the person behind it (an actor id `user_…`): a person is themselves, an agent is
 * the person whose key it used (RFC-0005 §4), `system` is nobody. Server-side for now; the optional
 * contract field `Actor.onBehalfOf` (RFC-0005 §8) is a follow-up.
 */
export interface OwnershipResolver {
  personOf(actor: Actor): Promise<string | undefined>;
}

/** People are themselves; agents and the system resolve to nobody (no membership source). */
export const PEOPLE_ONLY_OWNERSHIP: OwnershipResolver = {
  async personOf(actor) {
    return actor.kind === "human" ? actor.id : undefined;
  },
};

export type OwnProblemCode = "not_own" | "draft_only" | "author_immutable" | "no_person";

/** An own-limited caller tried something outside its limit (REST 403, MCP `denied`). */
export class OwnLimitError extends Error {
  override readonly name = "OwnLimitError";
  readonly code: OwnProblemCode;
  constructor(code: OwnProblemCode, message: string) {
    super(message);
    this.code = code;
  }
}

type EntryState = Pick<ContentEntry, "author" | "status"> & { publishedAt?: string | undefined };

/** Never published and still a draft or in review (what a Contributor may touch). */
export function isUnpublishedDraft(entry: EntryState): boolean {
  return !entry.publishedAt && (entry.status === "draft" || entry.status === "review");
}

function sameActor(a: Actor, b: Actor): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/** Is `person` an owner of `entry` (its `author`, or the person behind it)? */
export async function ownsEntry(
  owner: OwnershipResolver,
  person: string,
  entry: Pick<ContentEntry, "author">,
): Promise<boolean> {
  return (await owner.personOf(entry.author)) === person;
}

/**
 * Checks an entry write against an own limit (I9). No limit: nothing to check.
 * - create: the new entry's author is the caller; `draft` also keeps it a draft or in review;
 * - update: the caller owns the stored entry, `author` is unchanged, and `draft` needs a
 *   never-published entry that stays draft/review;
 * - delete: the caller owns it; `draft` needs a never-published entry.
 */
export async function checkEntryLimit(input: {
  limit: OwnLimit | undefined;
  op: "create" | "update" | "delete";
  person: string | undefined;
  owner: OwnershipResolver;
  stored?: EntryState | undefined;
  next?: EntryState | undefined;
}): Promise<void> {
  const { limit, op, person, owner, stored, next } = input;
  if (limit?.target !== "entry") return;
  if (!person)
    throw new OwnLimitError("no_person", "ownership cannot be established for this caller");
  const draft = limit.level === "draft";
  const stayDraft = (e: EntryState | undefined) => {
    if (draft && e && !isUnpublishedDraft(e))
      throw new OwnLimitError(
        "draft_only",
        "your role can only keep articles as drafts or send them for review; an Editor publishes them",
      );
  };
  if (op === "create") {
    if (next && !(await ownsEntry(owner, person, next)))
      throw new OwnLimitError(
        "author_immutable",
        "your role cannot file articles for someone else",
      );
    stayDraft(next);
    return;
  }
  if (!stored) return;
  if (!(await ownsEntry(owner, person, stored)))
    throw new OwnLimitError("not_own", "your role can only change your own articles");
  if (draft && !isUnpublishedDraft(stored))
    throw new OwnLimitError(
      "draft_only",
      "this article was published; only an Editor (or its Author) can change it now",
    );
  if (op === "update" && next) {
    if (!sameActor(stored.author, next.author))
      throw new OwnLimitError("author_immutable", "your role cannot change an article's author");
    stayDraft(next);
  }
}

/** A diff between the live state and what would go live (core-ts `SnapshotDiff`). */
export interface ChangeSet {
  readonly added: readonly NodeRef[];
  readonly removed: readonly NodeRef[];
  readonly changed: readonly { readonly before: NodeRef; readonly after: NodeRef }[];
}

/** Reads the two sides of a change set (snapshot blobs, or the current node for "after"). */
export interface ChangeSetReader {
  before(ref: NodeRef): Promise<unknown>;
  after(ref: NodeRef): Promise<unknown>;
}

export interface OwnOnlyResult {
  ownOnly: boolean;
  /** Structure changed (pages, site, taxonomies, terms, redirects, menus, assets…). */
  structure: boolean;
  /** Publicly visible entries the person does not own. */
  foreign: string[];
}

function isPublished(node: unknown): boolean {
  return (node as { status?: unknown } | undefined)?.status === "published";
}

/** JSON with object keys sorted at every level (stable comparison). */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** The site node without what publishing itself rewrites (pointer, rev, timestamp). */
function stripSite(site: Site): string {
  const { publishedSnapshotId: _p, rev: _r, updatedAt: _u, ...rest } = site;
  return stable(rest);
}

/**
 * Is a change set own-only for `person` (RFC-0005 §4)? Every publicly visible change must be an
 * entry they own: entries published before or after count, entries draft/review on both sides are
 * ignored, and any other node kind (except a site node that only moved its live pointer) makes it
 * not own-only.
 */
export async function ownOnlyChangeSet(
  diff: ChangeSet,
  person: string | undefined,
  owner: OwnershipResolver,
  read: ChangeSetReader,
): Promise<OwnOnlyResult> {
  const foreign: string[] = [];
  let structure = false;
  const owned = async (node: unknown) =>
    person !== undefined &&
    (await ownsEntry(owner, person, node as Pick<ContentEntry, "author">).catch(() => false));
  const entry = async (id: string, before: unknown, after: unknown) => {
    if (!isPublished(before) && !isPublished(after)) return;
    for (const side of [before, after])
      if (side !== undefined && !(await owned(side))) {
        if (!foreign.includes(id)) foreign.push(id);
        return;
      }
  };
  for (const ref of diff.added) {
    if (ref.kind !== "contentEntry") structure = true;
    else await entry(ref.id, undefined, await read.after(ref));
  }
  for (const ref of diff.removed) {
    if (ref.kind !== "contentEntry") structure = true;
    else await entry(ref.id, await read.before(ref), undefined);
  }
  for (const c of diff.changed) {
    if (c.after.kind === "site") {
      const [a, b] = [await read.before(c.before), await read.after(c.after)];
      if (!a || !b || stripSite(a as Site) !== stripSite(b as Site)) structure = true;
      continue;
    }
    if (c.after.kind !== "contentEntry") structure = true;
    else await entry(c.after.id, await read.before(c.before), await read.after(c.after));
  }
  return { ownOnly: !structure && foreign.length === 0, structure, foreign };
}

/** English reason a change set is not own-only (for agents and approval prompts). */
export function describeOwnOnly(result: OwnOnlyResult): string {
  if (result.ownOnly) return "every public change is your own";
  if (result.structure)
    return "it changes pages, site settings, taxonomies, terms or redirects, which needs an Editor";
  return `it includes ${result.foreign.length} published article(s) by someone else, which needs an Editor`;
}
