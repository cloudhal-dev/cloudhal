/** Surfaces in markdown bodies (RFC-0020 §5): fences, parsing and checks. */
import type { SurfaceComponent, SurfaceSection } from "@cloudhal/core-contracts";
import { BUILT_IN_BLOCK_TYPES, type PropsIssue } from "../blocks.ts";
import type { Catalog, CatalogEntry } from "./catalog/index.ts";
import { INPUT_COMPONENTS } from "./catalog/props.ts";
import { checkSurface } from "./checks/index.ts";
import { isObj } from "./shared.ts";

// ── surfaces in markdown bodies (RFC-0020 §5) ────────────────────────────────────────────────

const LINE_BREAK = /[\n\r\u2028\u2029]/;
const isSpace = (c: string) => /\s/.test(c);

/**
 * A line opening a code fence: the fence (```` ``` ```` or `~~~`, three or more), the info string's
 * first word and the rest of the line, as in ```surface {"id":"pricing","catalog":"blog@1"}.
 * What `/^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)(.*)$/` matched, in one pass: that regex was
 * quadratic on a fence followed by many tabs and a lone `\r` (js/polynomial-redos, alert 30).
 */
export function fenceOpen(line: string): [fence: string, word: string, rest: string] | undefined {
  // `.` and `$` (no `m` flag): the regex never matched a line holding a line break.
  if (LINE_BREAK.test(line)) return undefined;
  let i = 0;
  while (i < 3 && line[i] === " ") i++;
  const ch = line[i];
  if (ch !== "`" && ch !== "~") return undefined;
  const start = i;
  while (line[i] === ch) i++;
  if (i - start < 3) return undefined;
  const fence = line.slice(start, i);
  while (line[i] === " " || line[i] === "\t") i++;
  const word = i;
  while (i < line.length && line[i] !== "`" && !isSpace(line[i] as string)) i++;
  return [fence, line.slice(word, i), line.slice(i)];
}
export const SURFACE_ID = /^[a-z][a-z0-9-]{0,40}$/;
export const CATALOG_ID = /^[a-z][a-z0-9-]{0,40}@[0-9]{1,4}$/;

/**
 * Whether `line` closes a fence opened with `fence`: up to three spaces, at least as many of its
 * character, then only spaces or tabs. What `^ {0,3}`{n,}[ \t]*$` tested, without building a
 * RegExp from the body's text for every fence (CodeQL followed the line into it, alert 45).
 */
export function closesFence(line: string, fence: string): boolean {
  let i = 0;
  while (i < 3 && line[i] === " ") i++;
  const start = i;
  while (line[i] === fence[0]) i++;
  if (i - start < fence.length) return false;
  while (line[i] === " " || line[i] === "\t") i++;
  return i === line.length;
}

/** One ```surface fence of a body, parsed line by line. */
export interface BodySurface {
  /** The fence's `id` (unique in the body). */
  id: string;
  catalog: string;
  /** The fence as a surface; its `id` is the fence's. */
  section: SurfaceSection;
  /** Problems with the fence itself: its info string, lines that are not JSON, entry sources. */
  issues: PropsIssue[];
  /** False while the closing fence has not arrived (a body still streaming). */
  complete: boolean;
  /** 0-based line of the opening fence in the body. */
  line: number;
}

/**
 * A fence's lines as a surface: every line one component, or `{"data":{…}}` merged into the data
 * model. Only whole lines count; a body that is still streaming passes `complete: false`.
 */
export function parseSurfaceFence(
  info: string,
  lines: readonly string[],
  complete = true,
  line = 0,
): BodySurface {
  const issues: PropsIssue[] = [];
  let meta: Record<string, unknown> = {};
  try {
    const parsed = info.trim() ? (JSON.parse(info) as unknown) : {};
    if (isObj(parsed)) meta = parsed;
    else
      issues.push({
        path: "/info",
        message: 'an object such as {"id":"pricing","catalog":"blog@1"}',
      });
  } catch {
    issues.push({ path: "/info", message: 'JSON such as {"id":"pricing","catalog":"blog@1"}' });
  }
  const id = typeof meta.id === "string" ? meta.id : "";
  const catalog = typeof meta.catalog === "string" ? meta.catalog : "";
  if (!SURFACE_ID.test(id))
    issues.push({ path: "/info/id", message: "a lower-case id such as pricing" });
  if (!CATALOG_ID.test(catalog))
    issues.push({ path: "/info/catalog", message: "the catalog, such as blog@1 (get_catalog)" });
  const components: SurfaceComponent[] = [];
  const data: Record<string, unknown> = {};
  lines.forEach((raw, i) => {
    const text = raw.trim();
    if (!text) return;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      issues.push({ path: `/lines/${i}`, message: "not one JSON object" });
      return;
    }
    if (isObj(value) && Object.keys(value).length === 1 && isObj(value.data)) {
      for (const [k, v] of Object.entries(value.data)) {
        if (isObj(v) && "$source" in v)
          issues.push({
            path: `/lines/${i}/data/${k}`,
            message: "entry sources work in page surfaces only",
          });
        data[k] = v;
      }
    } else if (isObj(value)) components.push(value as unknown as SurfaceComponent);
    else issues.push({ path: `/lines/${i}`, message: 'a component or {"data":{…}}' });
  });
  const section = {
    id,
    kind: "surface",
    catalog,
    components,
    ...(Object.keys(data).length ? { data } : {}),
  } as unknown as SurfaceSection;
  return { id, catalog, section, issues, complete, line };
}

/**
 * Whether a surface needs the interaction runtime (RFC-0020 §4): it has an input, or a button
 * with an action. Everything else is complete as server-rendered HTML.
 */
export function isInteractive(surface: Pick<SurfaceSection, "components">): boolean {
  return surface.components.some(
    (c) =>
      INPUT_COMPONENTS.has(c.component) ||
      // Opening and closing overlays is the browser's (and the overlay module's), not the runtime's.
      (c.component === "Button" &&
        isObj(c.props) &&
        isObj(c.props.onClick) &&
        c.props.onClick.action !== "open" &&
        c.props.onClick.action !== "close") ||
      // RFC-0024 §3: a scroll story writes the step being read into the data.
      c.component === "Scrolly",
  );
}

/** Every ```surface fence of a markdown body, in order; fences inside other code blocks are not. */
export function bodySurfaces(markdown: string): BodySurface[] {
  if (!markdown.includes("surface")) return [];
  const lines = markdown.split(/\r?\n/);
  const out: BodySurface[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = fenceOpen(lines[i] as string);
    if (!m) continue;
    const [fence, word, rest] = m;
    let j = i + 1;
    while (j < lines.length && !closesFence(lines[j] as string, fence)) j++;
    if (word === "surface")
      out.push(parseSurfaceFence(rest.trim(), lines.slice(i + 1, j), j < lines.length, i));
    i = j;
  }
  return out;
}

const BUILT_IN = new Set(BUILT_IN_BLOCK_TYPES.map((t) => t.name));

/**
 * Whether a catalog component may sit in an article body's surface: every primitive and built-in
 * block (Cloudhal draws them anywhere), and a theme's block only when its type allows `body`. A
 * section-only theme block (`where: ["section"]`) is drawn by the theme's page sections alone.
 */
export function allowedInBody(entry: CatalogEntry): boolean {
  return (
    entry.kind === "primitive" || BUILT_IN.has(entry.name) || entry.type.where.includes("body")
  );
}

/** Problems with a body's surfaces (paths start with the fence's id); unknown components pass. */
export function checkBodySurfaces(markdown: string, catalog: Catalog): PropsIssue[] {
  const out: PropsIssue[] = [];
  const seen = new Set<string>();
  for (const f of bodySurfaces(markdown)) {
    const at = `/surface/${f.id || `line-${f.line + 1}`}`;
    if (!f.complete) out.push({ path: at, message: "the fence is not closed" });
    if (f.id && seen.has(f.id))
      out.push({ path: `${at}/info/id`, message: "used by another fence" });
    seen.add(f.id);
    for (const i of f.issues) out.push({ path: `${at}${i.path}`, message: i.message });
    for (const i of checkSurface(f.section, catalog).issues)
      out.push({ path: `${at}${i.path}`, message: i.message });
    f.section.components.forEach((c, n) => {
      const entry = catalog.get(c.component);
      if (entry && !allowedInBody(entry))
        out.push({
          path: `${at}/components/${n}/component`,
          message: `${c.component} is a section block of the theme, not allowed in article bodies; put it in a page section`,
        });
    });
  }
  return out;
}
