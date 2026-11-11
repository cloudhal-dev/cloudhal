/**
 * RFC-0033 and RFC-0045 §2 for an entry write, planned together: the translation links and their
 * group guards (`checkTranslationLinks`), the reference rules (`planEntryRefs`: targets, the
 * definitions anchor, `entry_refs`), and the delete-like rules of a move or group change
 * (`planLeave`). One guard, one set of anchored statements, one diagnosis.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import { and, type Cond } from "../node-sql.ts";
import { planLeave } from "../references/leave.ts";
import { planEntryRefs } from "../references/writer.ts";
import type { StoreContext } from "./context.ts";
import { checkTranslationLinks } from "./translations.ts";

export interface EntryIntegrityPlan {
  readonly guard: Cond | undefined;
  /** `entry_refs` rows, anchored on the entry's new hash. */
  statements(hash: string): SqlStatement[];
  /** After a write that matched no row: the specific refusal, if one applies now. */
  diagnose(entry: ContentEntry): Promise<void>;
}

export async function planEntryIntegrity(
  ctx: StoreContext,
  site: Site,
  write: { draft: ContentEntry; stored: ContentEntry | undefined },
): Promise<EntryIntegrityPlan> {
  const { draft, stored } = write;
  const linked = await checkTranslationLinks(ctx, {
    kind: "contentEntry",
    site,
    node: draft,
    stored,
  });
  const references = await planEntryRefs(ctx.sql, site, draft, stored);
  const leave = stored ? await planLeave(ctx.sql, site, { stored, next: draft }) : undefined;
  return {
    guard: and(references.guard, linked, leave?.guard),
    statements: (hash) => references.statements(hash),
    diagnose: async (entry) => {
      await references.diagnose();
      await leave?.diagnose();
      await checkTranslationLinks(ctx, { kind: "contentEntry", site, node: entry, stored });
    },
  };
}
