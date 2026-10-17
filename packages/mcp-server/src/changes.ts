/** Human-readable change lines for approval prompts (publish). */

import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import type { SnapshotDiff } from "@cloudhal/core-ts";
import { termName } from "@cloudhal/core-ts";
import { describeAsset } from "./asset-tools.ts";
import { quote, type ToolContext } from "./common.ts";
import { menuChangeSummary } from "./menu-tools.ts";
import { assignmentDeltas, describeDeltas, termLookup } from "./terms.ts";

export const KIND_LABEL: Record<string, string> = {
  site: "site",
  page: "page",
  contentEntry: "article",
  taxonomy: "taxonomy",
  term: "term",
  redirect: "redirect",
  menu: "menu",
  asset: "media",
};

/**
 * One line per changed node for approval prompts, at most 8. Articles also show their assignment
 * deltas (RFC-0002 §6.4): `~ article "…" (+tag ai, −tag llms, primary category → News)`.
 */
export async function describeChanges(
  ctx: ToolContext,
  diff: SnapshotDiff,
  site?: Site,
): Promise<string[]> {
  const locale = site?.defaultLocale;
  const lookup = termLookup(ctx);
  const title = async (ref: { id: string; kind: string }) => {
    switch (ref.kind) {
      case "page":
        return (await ctx.store.getPage(ref.id))?.title;
      case "contentEntry":
        return (await ctx.store.getContentEntry(ref.id))?.title;
      case "site":
        return "site settings";
      case "taxonomy": {
        const t = await ctx.store.getTaxonomy(ref.id);
        return t ? ((locale ? t.labels[locale]?.plural : undefined) ?? t.key) : undefined;
      }
      case "term": {
        const t = await ctx.store.getTerm(ref.id);
        return t ? termName(t, locale) : undefined;
      }
      case "redirect": {
        const r = await ctx.store.getRedirect(ref.id);
        return r ? `${r.from} → ${r.to}` : undefined;
      }
      case "menu":
        return (await ctx.store.getMenu(ref.id))?.key;
      default:
        return undefined;
    }
  };
  /** Media lines name the file, its type, size and the articles or pages using it (§6.2). */
  const assetLine = async (sign: string, ref: { id: string; kind: string }) => {
    const asset = await ctx.store.getAsset(ref.id);
    if (!asset) return undefined;
    const usage = (await ctx.store.assetUsage(asset.siteId, [asset.id])).get(asset.id);
    const first = usage?.refs[0];
    let user: string | undefined;
    if (first?.nodeKind === "contentEntry")
      user = (await ctx.store.getContentEntry(first.nodeId))?.title;
    else if (first?.nodeKind === "page") user = (await ctx.store.getPage(first.nodeId))?.title;
    const more = usage && usage.total > 1 ? ` and ${usage.total - 1} more` : "";
    return `${sign} ${describeAsset(asset, locale)}${user ? `, used by "${quote(user)}"${more}` : ""}${asset.status === "retired" ? " (retired)" : ""}`;
  };
  const deltas = async (
    ref: { id: string; kind: string },
    before?: SnapshotDiff["added"][number],
  ) => {
    if (ref.kind === "menu") return menuChangeSummary(ctx, ref, before);
    if (ref.kind !== "contentEntry") return "";
    const now = await ctx.store.getContentEntry(ref.id);
    if (!now) return "";
    const was = before ? await ctx.store.readSnapshotNode<ContentEntry>(before) : undefined;
    const text = await describeDeltas(assignmentDeltas(was?.terms, now.terms), lookup, locale);
    return text ? ` (${text})` : "";
  };
  const label = (kind: string) => KIND_LABEL[kind] ?? kind;
  const out: string[] = [];
  const groups: [
    string,
    { ref: SnapshotDiff["added"][number]; before?: SnapshotDiff["added"][number] }[],
  ][] = [
    ["+", diff.added.map((ref) => ({ ref }))],
    ["~", diff.changed.map((c) => ({ ref: c.after, before: c.before }))],
    ["−", diff.removed.map((ref) => ({ ref }))],
  ];
  for (const [sign, refs] of groups)
    for (const { ref, before } of refs) {
      if (out.length >= 8) {
        out.push(`… and ${diff.added.length + diff.changed.length + diff.removed.length - 8} more`);
        return out;
      }
      if (ref.kind === "asset" && sign !== "−") {
        const line = await assetLine(sign, ref);
        if (line) {
          out.push(line);
          continue;
        }
      }
      const t = sign === "−" ? undefined : await title(ref);
      const d = sign === "−" ? "" : await deltas(ref, before);
      out.push(`${sign} ${label(ref.kind)} ${t ? `"${quote(t)}"` : ref.id}${d}`);
    }
  return out;
}
