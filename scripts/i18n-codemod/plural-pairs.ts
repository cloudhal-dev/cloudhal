/**
 * RFC-0032 step b: merges each hand-made plural pair (`xOne` + `x`/`xOther`/`xMany`) of Studio's
 * catalogs into one ICU plural message, in every language. One-off and reviewable: the pairs are
 * listed below; the call sites are changed by hand (the typed `t()` finds every one).
 *
 *   node scripts/i18n-codemod/plural-pairs.ts            rewrite the catalogs
 *   node scripts/i18n-codemod/plural-pairs.ts --dry-run  print what would change
 *
 * For each language: the "one" text has its standalone `1` replaced by `#`, the other text its
 * `{count}`; when both read the same (Turkish nouns stay singular after a number) the message is
 * `… {count, number} …` instead of a plural.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type CatalogEntry, catalogEntries } from "./catalog-entries.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const I18N = path.resolve(here, "../../apps/studio/src/i18n");

/** `[one, other, target]`: the target key holds the merged message (often `other`, renamed). */
export const PAIRS: readonly (readonly [string, string, string])[] = [
  ["overview.commentsWaitingOne", "overview.commentsWaiting", "overview.commentsWaiting"],
  ["editor.wordsOne", "editor.wordsOther", "editor.words"],
  [
    "agents.elevation.bannerTitleOne",
    "agents.elevation.bannerTitleOther",
    "agents.elevation.bannerTitle",
  ],
  ["skills.referenceOne", "skills.referenceCount", "skills.referenceCount"],
  [
    "notifications.comments.pending.titleOne",
    "notifications.comments.pending.title",
    "notifications.comments.pending.title",
  ],
  [
    "notifications.comments.reported.titleOne",
    "notifications.comments.reported.title",
    "notifications.comments.reported.title",
  ],
  ["approvals.banner.titleOne", "approvals.banner.title", "approvals.banner.title"],
  [
    "diff.textChanges.unchangedOne",
    "diff.textChanges.unchangedOther",
    "diff.textChanges.unchanged",
  ],
  ["build.activity.changedOne", "build.activity.changed", "build.activity.changed"],
  ["build.activity.refusedOne", "build.activity.refused", "build.activity.refused"],
  ["comments.words.reportsOne", "comments.words.reports", "comments.words.reports"],
  ["comments.dialog.hideTitleOne", "comments.dialog.hideTitle", "comments.dialog.hideTitle"],
  ["comments.dialog.spamTitleOne", "comments.dialog.spamTitle", "comments.dialog.spamTitle"],
  ["comments.results.doneOne", "comments.results.done", "comments.results.done"],
  [
    "comments.agentRequests.titleOne",
    "comments.agentRequests.title",
    "comments.agentRequests.title",
  ],
  ["comments.aside.purgingHintOne", "comments.aside.purgingHint", "comments.aside.purgingHint"],
  ["comments.thread.showMoreOne", "comments.thread.showMore", "comments.thread.showMore"],
  [
    "comments.approvals.approveTitleOne",
    "comments.approvals.approveTitle",
    "comments.approvals.approveTitle",
  ],
  [
    "comments.approvals.restoreTitleOne",
    "comments.approvals.restoreTitle",
    "comments.approvals.restoreTitle",
  ],
  [
    "comments.approvals.approveConfirmOne",
    "comments.approvals.approveConfirm",
    "comments.approvals.approveConfirm",
  ],
  ["media.upload.startOne", "media.upload.start", "media.upload.start"],
  ["menus.depthOne", "menus.depthMany", "menus.depth"],
  ["menus.hidden.bannerOne", "menus.hidden.banner", "menus.hidden.banner"],
  ["menus.save.summaryOne", "menus.save.summary", "menus.save.summary"],
  ["menus.save.hiddenOne", "menus.save.hidden", "menus.save.hidden"],
  ["menus.delta.withBelowOne", "menus.delta.withBelow", "menus.delta.withBelow"],
  ["menus.delta.removeTreeOne", "menus.delta.removeTree", "menus.delta.removeTree"],
  [
    "menus.deleteNotice.titleOne.page",
    "menus.deleteNotice.title.page",
    "menus.deleteNotice.title.page",
  ],
  [
    "menus.deleteNotice.titleOne.contentEntry",
    "menus.deleteNotice.title.contentEntry",
    "menus.deleteNotice.title.contentEntry",
  ],
  ["schedules.attention.titleOne", "schedules.attention.title", "schedules.attention.title"],
  [
    "schedules.calendar.agenda.doneTodayOne",
    "schedules.calendar.agenda.doneToday",
    "schedules.calendar.agenda.doneToday",
  ],
  [
    "schedules.calendar.agenda.moreRunsOne",
    "schedules.calendar.agenda.moreRuns",
    "schedules.calendar.agenda.moreRuns",
  ],
  [
    "schedules.calendar.month.itemsOne",
    "schedules.calendar.month.items",
    "schedules.calendar.month.items",
  ],
  ["schedules.calendar.overlapOne", "schedules.calendar.overlap", "schedules.calendar.overlap"],
  ["schedules.move.clashOne", "schedules.move.clash", "schedules.move.clash"],
  [
    "schedules.scheduleDialog.closureAddedOne",
    "schedules.scheduleDialog.closureAdded",
    "schedules.scheduleDialog.closureAdded",
  ],
  ["schedules.release.untitledOne", "schedules.release.untitled", "schedules.release.untitled"],
  [
    "schedules.release.items.overlapOne",
    "schedules.release.items.overlap",
    "schedules.release.items.overlap",
  ],
  [
    "schedules.automationDialog.recurrence.dayOne",
    "schedules.automationDialog.recurrence.days",
    "schedules.automationDialog.recurrence.days",
  ],
  [
    "schedules.automationDialog.recurrence.weekOne",
    "schedules.automationDialog.recurrence.weeks",
    "schedules.automationDialog.recurrence.weeks",
  ],
  [
    "schedules.automationDialog.recurrence.monthOne",
    "schedules.automationDialog.recurrence.months",
    "schedules.automationDialog.recurrence.months",
  ],
  ["schedules.history.showingOne", "schedules.history.showing", "schedules.history.showing"],
  ["schedules.approvals.itemsOne", "schedules.approvals.items", "schedules.approvals.items"],
  [
    "schedules.notices.conflict.titleOne",
    "schedules.notices.conflict.title",
    "schedules.notices.conflict.title",
  ],
];

/** Escapes text for a plural branch: a literal `#` is quoted (`'#'`), so is an apostrophe before syntax. */
const literal = (text: string) => text.replace(/'(?=[{}#|])/g, "''").replace(/#/g, "'#'");

/** The merged message for one language, from its two texts. */
export function merge(one: string, other: string): string {
  const ones = one.match(/(?<![\w.,])1(?![\w.,:])/g) ?? [];
  const branchOne = ones.length === 1 ? one.replace(/(?<![\w.,])1(?![\w.,:])/, "\u0000") : one;
  const branchOther = other.replaceAll("{count}", "\u0000");
  const esc = (s: string) => literal(s).replaceAll("\u0000", "#");
  if (branchOne === branchOther && branchOne.includes("\u0000"))
    return branchOne.replaceAll("\u0000", "{count, number}");
  return `{count, plural, one {${esc(branchOne)}} other {${esc(branchOther)}}}`;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

/** Edits for one catalog file: merged targets written, `one` entries (and emptied groups) removed. */
function editsFor(source: string): Edit[] {
  const entries = new Map(catalogEntries(source).map((e) => [e.path, e] as [string, CatalogEntry]));
  const edits: Edit[] = [];
  for (const [oneKey, otherKey, target] of PAIRS) {
    const one = entries.get(oneKey);
    const other = entries.get(otherKey);
    if (!one || !other) continue;
    const leaf = target.split(".").at(-1) as string;
    const indent = source.slice(other.lineStart, other.keyStart);
    edits.push({
      start: other.lineStart,
      end: other.lineEnd,
      text: `${indent}${/^[A-Za-z_$][\w$]*$/.test(leaf) ? leaf : JSON.stringify(leaf)}: ${JSON.stringify(merge(one.value, other.value))},\n`,
    });
    edits.push({ start: one.lineStart, end: one.lineEnd, text: "" });
  }
  return edits.sort((a, b) => b.start - a.start);
}

function rewrite(source: string): string {
  let out = source;
  for (const e of editsFor(source)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  // A group left empty (`titleOne: { … }` once both kinds moved) goes too.
  return out.replace(/\n[ \t]*[\w$"]+: \{\s*\},(?=\n)/g, "");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = [
    ...readdirSync(I18N).filter(
      (f) => /^[\w-]+\.ts$/.test(f) && !["locales.ts", "namespaces.ts"].includes(f),
    ),
    ...readdirSync(path.join(I18N, "lazy")).map((f) => `lazy/${f}`),
  ];
  for (const file of files) {
    const full = path.join(I18N, file);
    const source = readFileSync(full, "utf8");
    const out = rewrite(source);
    if (out === source) continue;
    if (process.argv.includes("--dry-run")) console.log(`would rewrite ${file}`);
    else writeFileSync(full, out);
  }
}
