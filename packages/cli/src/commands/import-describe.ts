/**
 * What `cloudhal import` prints (RFC-0039 §2): the manifest, the difference a `--dry-run` finds
 * (nodes added, changed and removed by kind and title; snapshots; media to copy) and the summary of
 * an import. Pure. A title is read from its row's body, with the row id as the fallback, and goes
 * through `displayText`; no body is ever printed.
 */
import type { NodeRef } from "@cloudhal/core-contracts";
import { type ImportPlan, type NodeRow, termName } from "@cloudhal/core-ts";
import { isRecord } from "./archive-bundle.ts";
import { formatBytes } from "./export.ts";
import type { ImportArchiveResult } from "./import.ts";
import { displayText } from "./import-checks.ts";

type Kind = NodeRef["kind"];

/** How a node kind is named in the output. */
export const KIND_LABEL: Readonly<Record<Kind, string>> = {
  site: "site",
  page: "page",
  contentEntry: "entry",
  taxonomy: "taxonomy",
  term: "term",
  redirect: "redirect",
  menu: "menu",
  glossary: "glossary",
  asset: "media",
};

const PLURAL: Readonly<Record<Kind, string>> = {
  site: "sites",
  page: "pages",
  contentEntry: "entries",
  taxonomy: "taxonomies",
  term: "terms",
  redirect: "redirects",
  menu: "menus",
  glossary: "glossaries",
  asset: "media",
};

/** Studio's order (apps/studio/src/lib/diff.ts): assets before the pages that show them. */
const KIND_ORDER: readonly Kind[] = [
  "site",
  "menu",
  "taxonomy",
  "term",
  "asset",
  "page",
  "contentEntry",
  "redirect",
  "glossary",
];

/** Node lines per group before `… and N more`. */
const MAX_LINES = 20;

type Body = Record<string, unknown>;

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;
const quoted = (value: string) => `"${displayText(value, 80)}"`;
const plain = (value: string) => displayText(value, 80);

/** A per-locale map's value in `locale`. */
function inLocale(map: unknown, locale: string | undefined): unknown {
  return locale && isRecord(map) && Object.hasOwn(map, locale) ? map[locale] : undefined;
}

/** A per-locale map's first value. */
function firstValue(map: unknown): unknown {
  return isRecord(map) ? Object.values(map)[0] : undefined;
}

function withSuffix(title: unknown, suffix: string | undefined): string | undefined {
  const t = text(title);
  if (!t) return undefined;
  return suffix ? `${quoted(t)} (${plain(suffix)})` : quoted(t);
}

const TITLES: Readonly<Record<Kind, (b: Body, locale: string | undefined) => string | undefined>> =
  {
    site: (b) => withSuffix(b.name, undefined),
    page: (b) => withSuffix(b.title, text(b.path)),
    contentEntry: (b) =>
      withSuffix(b.title, text(b.collection) && text(b.slug) && `${b.collection}/${b.slug}`),
    taxonomy: (b, locale) => {
      const label = inLocale(b.labels, locale) ?? firstValue(b.labels);
      const name = isRecord(label) ? text(label.plural) : undefined;
      return name ? quoted(name) : text(b.key) && plain(b.key as string);
    },
    term: (b, locale) =>
      isRecord(b.labels)
        ? quoted(termName(b as never, locale))
        : text(b.slug) && plain(b.slug as string),
    redirect: (b) => text(b.from) && text(b.to) && plain(`${b.from} → ${b.to}`),
    menu: (b) => text(b.key) && plain(b.key as string),
    glossary: () => "glossary",
    asset: (b, locale) => {
      const named =
        text(inLocale(b.title, locale)) ??
        text(inLocale(b.alt, locale)) ??
        text(firstValue(b.title)) ??
        (isRecord(b.source) ? text(b.source.filename) : undefined);
      return named ? quoted(named) : text(b.slug) && plain(b.slug as string);
    },
  };

/** A node's human title from its body (`"About us" (/about)`), else its id. Never the body. */
export function nodeTitle(row: NodeRow, locale: string | undefined): string {
  const title = Object.hasOwn(TITLES, row.kind) ? TITLES[row.kind as Kind] : undefined;
  try {
    const body: unknown = JSON.parse(row.body);
    const shown = title && isRecord(body) ? title(body, locale) : undefined;
    if (shown) return shown;
  } catch {
    // the id below
  }
  return plain(row.id);
}

function label(kind: string): string {
  return Object.hasOwn(KIND_LABEL, kind) ? KIND_LABEL[kind as Kind] : plain(kind);
}

function rank(kind: string): number {
  const i = KIND_ORDER.indexOf(kind as Kind);
  return i < 0 ? KIND_ORDER.length : i;
}

function sorted<T>(items: readonly T[], row: (item: T) => NodeRow): T[] {
  return [...items].sort(
    (a, b) => rank(row(a).kind) - rank(row(b).kind) || row(a).id.localeCompare(row(b).id),
  );
}

/** `(2 pages, 1 entry)`, or nothing for none. */
function byKind(rows: readonly NodeRow[]): string {
  if (rows.length === 0) return "";
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  const parts = [...counts]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([kind, n]) => {
      const many = Object.hasOwn(PLURAL, kind) ? PLURAL[kind as Kind] : plain(kind);
      return `${n} ${n === 1 ? label(kind) : many}`;
    });
  return ` (${parts.join(", ")})`;
}

/** At most `MAX_LINES` lines, then `… and N more`. */
function capped(lines: string[]): string[] {
  if (lines.length <= MAX_LINES) return lines;
  return [...lines.slice(0, MAX_LINES), `  … and ${lines.length - MAX_LINES} more`];
}

function nodeLines(plan: ImportPlan, locale: string | undefined): string[] {
  const { added, changed, removed } = plan.nodes;
  if (plan.unchanged) return ["nodes: unchanged"];
  const line = (sign: string, r: NodeRow) => `  ${sign} ${label(r.kind)} ${nodeTitle(r, locale)}`;
  return [
    `nodes: ${added.length} to add${byKind(added)}, ${changed.length} to change${byKind(changed.map((c) => c.to))}, ${removed.length} to remove${byKind(removed)}`,
    ...capped(sorted(added, (r) => r).map((r) => line("+", r))),
    ...capped(
      sorted(changed, (c) => c.to).map(
        (c) => `${line("~", c.to)}, rev ${c.from.rev} here, ${c.to.rev} in the archive`,
      ),
    ),
    ...capped(sorted(removed, (r) => r).map((r) => line("-", r))),
  ];
}

function bytesOf(media: readonly { bytes: number }[]): number {
  return media.reduce((n, m) => n + m.bytes, 0);
}

function planMediaLine(result: ImportArchiveResult, plan: ImportPlan): string {
  const { present, missing, wrongSize } = plan.media;
  const total = present.length + missing.length + wrongSize.length;
  if (total === 0) return "media: none";
  if (result.manifest.mediaOmitted) {
    const lacking = [
      ...(missing.length > 0 ? [`${missing.length} missing`] : []),
      ...(wrongSize.length > 0 ? [`${wrongSize.length} of another size`] : []),
    ];
    return `media: none in the archive (--no-media); ${present.length} of ${total} already here${lacking.length > 0 ? `, ${lacking.join(", ")}` : ""}`;
  }
  const copy = [...missing, ...wrongSize];
  const damaged = wrongSize.length > 0 ? `, ${wrongSize.length} of them over a damaged copy` : "";
  return `media: ${copy.length} file(s) to copy (${formatBytes(bytesOf(copy))})${damaged}, ${present.length} already here`;
}

function planLines(result: ImportArchiveResult, plan: ImportPlan): string[] {
  const lines = [
    `dry run: bootstrap import into site ${result.site.id}, ${plan.fresh ? "which is new to this project" : "which this project already holds"}`,
  ];
  if (plan.projectAdded)
    lines.push(`project: ${plain(result.site.projectId ?? "its project")} is new to this project`);
  lines.push(...nodeLines(plan, result.site.locale));
  const snaps = plan.snapshots;
  lines.push(
    snaps.length === 0
      ? `snapshots: none to add${plan.blobs > 0 ? `, ${plan.blobs} node bodies` : ""}`
      : `snapshots: ${snaps.length} to add (${snaps.slice(0, 5).join(", ")}${snaps.length > 5 ? ", …" : ""}), with ${plan.blobs} node bodies`,
  );
  lines.push(planMediaLine(result, plan));
  const { listed, bytesHere } = plan.takedowns;
  if (listed > 0)
    lines.push(
      `taken down: ${listed} file(s) in the archive's ledger, never imported${bytesHere.length > 0 ? `; ${bytesHere.length} of them are in this project and would be deleted` : ""}`,
    );
  return lines;
}

function manifestLines(result: ImportArchiveResult): string[] {
  const { manifest, site, mediaNeeded } = result;
  const { counts } = manifest;
  const slug = site.slug ? ` (${plain(site.slug)})` : "";
  const media = manifest.mediaOmitted
    ? "no media (--no-media)"
    : `${counts.media} media file(s) (${formatBytes(counts.mediaBytes)})`;
  const lines = [
    `archive ${displayText(result.file)}: ${manifest.format} (contracts ${manifest.contracts.schemaVersion}), written by @cloudhal/cli ${manifest.createdBy} at ${manifest.createdAt}`,
    `site ${manifest.siteId} ${quoted(manifest.siteName)}${slug}: ${counts.nodes} node(s), ${counts.snapshots} snapshot(s), ${counts.blobs} node bodies, ${media}`,
  ];
  if (manifest.mediaOmitted && mediaNeeded.files > 0)
    lines.push(
      `warning: the archive was written with --no-media; its ${mediaNeeded.files} media file(s) (${formatBytes(mediaNeeded.bytes)}) must already be in this project`,
    );
  return lines;
}

function importedLines(
  result: ImportArchiveResult,
  plan: ImportPlan,
  done: NonNullable<ImportArchiveResult["imported"]>,
): string[] {
  const file = displayText(result.file);
  const { id, slug } = result.site;
  // Recording a takedown or deleting a local copy of taken-down content is a change too.
  const nothing =
    done.nodes.unchanged &&
    done.snapshots === 0 &&
    done.blobs === 0 &&
    done.media.copied === 0 &&
    !plan.projectAdded &&
    done.takedownsDeleted === 0 &&
    plan.takedowns.recorded.length === 0;
  if (nothing)
    return [
      `nothing to import: this project already holds ${file} (site ${id}${slug ? `, ${plain(slug)}` : ""})`,
    ];
  const lines = [
    `imported ${file}: site ${id}${slug ? ` (${plain(slug)})` : ""} is in this project`,
    `nodes: ${done.nodes.unchanged ? "unchanged" : `${done.nodes.inserted} written`}; snapshots: ${done.snapshots} added; node bodies: ${done.blobs} added`,
  ];
  const media = [
    ...(result.mediaNeeded.files > 0
      ? [
          `${done.media.copied} file(s) copied (${formatBytes(done.media.bytes)}), ${done.media.present} already here`,
        ]
      : []),
    ...(done.takedowns > 0
      ? [
          `${done.takedowns} taken down, never imported${done.takedownsDeleted > 0 ? `; ${done.takedownsDeleted} of them deleted from this project` : ""}`,
        ]
      : []),
  ];
  if (media.length > 0) lines.push(`media: ${media.join("; ")}`);
  if (!done.searchRefreshed)
    lines.push("search index not refreshed; run `cloudhal search reindex`");
  return lines;
}

/** The lines `cloudhal import` prints to stdout: the dry run's report, or the import's summary. */
export function describeImport(result: ImportArchiveResult): string[] {
  const { plan, imported } = result;
  if (imported && plan) return importedLines(result, plan, imported);
  return [
    ...manifestLines(result),
    ...(plan ? planLines(result, plan) : []),
    ...result.refusals.map((r) => `would refuse: ${r}`),
    "nothing written (dry run)",
  ];
}
