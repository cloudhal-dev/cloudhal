/** Term assignment input and audit deltas for entry writes (RFC-0002 §6.4). */

import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import type { ToolContext } from "./common.ts";
import {
  applyTermsInput,
  assignmentDeltas,
  auditDeltas,
  type TermsInput,
  termLookup,
} from "./terms.ts";

/**
 * The `terms` (and deprecated `tags`) input of create_entry / update_entry → the entry's new
 * assignments and `tags`. `tags` is an alias for `terms.tag.add` on sites with a `tag` taxonomy; a
 * site that has not been migrated (no `tag` taxonomy) keeps plain tags.
 */
export async function entryTerms(
  ctx: ToolContext,
  site: Site,
  entry: ContentEntry | undefined,
  a: Record<string, unknown>,
): Promise<{ terms: ContentEntry["terms"]; tags: string[] }> {
  const input: TermsInput = { ...((a.terms as TermsInput | undefined) ?? {}) };
  const aliased = a.tags as string[] | undefined;
  let tags = entry?.tags ?? [];
  if (aliased !== undefined) {
    if (await ctx.store.getTaxonomyByKey(site.id, "tag")) {
      if (aliased.length > 0) {
        const ops = input.tag ?? {};
        input.tag = { ...ops, add: [...(ops.add ?? []), ...aliased] };
      }
    } else tags = aliased;
  }
  const terms =
    Object.keys(input).length > 0
      ? await applyTermsInput(ctx, site, entry?.terms, input)
      : entry?.terms;
  return { terms, tags };
}

/** Assignment deltas of an entry write into the audit row (`input.effect.terms`). */
export async function reportDeltas(
  ctx: ToolContext,
  before: ContentEntry | undefined,
  after: ContentEntry,
): Promise<void> {
  const deltas = assignmentDeltas(before?.terms, after.terms);
  if (deltas.length > 0 && ctx.report)
    ctx.report({ terms: await auditDeltas(deltas, termLookup(ctx)) });
}
