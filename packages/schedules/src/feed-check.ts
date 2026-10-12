/**
 * The `feed-check` built-in's checks (RFC-0008 §11.1, §7.2), pure over the fetched text. The
 * site's own RSS feed and sitemap are fetched through the `SITE` binding (or the local renderer on
 * Node) and checked for: well-formed XML of the right kind; items with a title and a link; no date
 * in the future; the newest published entries present; media URLs that are live assets; and the
 * **gate self-check** — no embargoed or expired node appears, the time-gate helper verified in
 * production.
 *
 * The fetched text is untrusted (§11.4): it is parsed with bounded scans, never evaluated, and
 * whatever of it a finding quotes is one plain line, marked `untrusted`.
 */
import type { FeedFinding, FindingSeverity, GateStateName } from "./findings.ts";
import { instantMs, MINUTE_MS } from "./instant.ts";
import { plainLine } from "./text.ts";

/** Documents larger than this are not parsed (`feed-invalid`). */
export const MAX_DOCUMENT_CHARS = 5_000_000;
/** How many of the newest published entries must appear in the feed and the sitemap. */
export const FEED_NEWEST = 5;
/** Clock skew tolerated before a date counts as "in the future". */
export const FUTURE_TOLERANCE_MS = 5 * MINUTE_MS;

export type FeedDocumentKind = "rss" | "sitemap";

export const FEED_PATHS: Readonly<Record<FeedDocumentKind, string>> = {
  rss: "/rss.xml",
  sitemap: "/sitemap.xml",
};

/** What the live snapshot says the documents must (and must not) contain. */
export interface FeedExpectations {
  readonly now: string;
  /** The newest published, visible entries (by `publishedAt`), newest first. */
  readonly newest: readonly {
    readonly nodeId: string;
    readonly path: string;
    readonly title: string;
  }[];
  /** Live pages and entries gated right now: they must appear nowhere. */
  readonly gated: readonly {
    readonly nodeId: string;
    readonly path: string;
    readonly state: GateStateName;
  }[];
  /** The media URL prefixes (first 16 hex of the SHA-256) of every live asset. */
  readonly mediaPrefixes: readonly string[];
}

export interface FetchedDocument {
  readonly status: number;
  readonly contentType?: string;
  readonly body: string;
}

const finding = (
  document: FeedDocumentKind,
  code: FeedFinding["code"],
  severity: FindingSeverity,
  o: { detail?: string; nodeId?: string; url?: string } = {},
): FeedFinding => ({
  code,
  severity,
  document,
  ...(o.detail !== undefined ? { detail: plainLine(o.detail, 200) } : {}),
  ...(o.nodeId ? { nodeId: o.nodeId } : {}),
  ...(o.url ? { url: plainLine(o.url, 500) } : {}),
  untrusted: true,
});

/** The end of a tag starting after `<` at `from` (quotes respected), or -1. */
function tagEnd(text: string, from: number): number {
  let quote = "";
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i;
  }
  return -1;
}

const ENTITY = /&(?!(?:[A-Za-z][A-Za-z0-9]*|#[0-9]+|#x[0-9A-Fa-f]+);)/;

/**
 * Why `text` is not well-formed XML (a bounded, linear scan: elements nest and close, one root,
 * no stray text or `&`), or undefined. Not a validating parser; enough to catch a broken feed.
 */
export function xmlProblem(text: string): string | undefined {
  const stack: string[] = [];
  let rootSeen = false;
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    const chunk = lt < 0 ? text.slice(i) : text.slice(i, lt);
    if (ENTITY.test(chunk)) return "an unescaped & in text";
    if (stack.length === 0 && chunk.trim() !== "") return "text outside the root element";
    if (lt < 0) break;
    if (text.startsWith("<!--", lt)) {
      const e = text.indexOf("-->", lt + 4);
      if (e < 0) return "an unclosed comment";
      i = e + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", lt)) {
      if (stack.length === 0) return "CDATA outside the root element";
      const e = text.indexOf("]]>", lt + 9);
      if (e < 0) return "an unclosed CDATA section";
      i = e + 3;
      continue;
    }
    if (text.startsWith("<?", lt)) {
      const e = text.indexOf("?>", lt + 2);
      if (e < 0) return "an unclosed processing instruction";
      i = e + 2;
      continue;
    }
    if (text.startsWith("<!", lt)) {
      if (rootSeen || stack.length > 0) return "a declaration inside the document";
      const e = text.indexOf(">", lt + 2);
      if (e < 0) return "an unclosed declaration";
      i = e + 1;
      continue;
    }
    const gt = tagEnd(text, lt + 1);
    if (gt < 0) return "an unclosed tag";
    const raw = text.slice(lt + 1, gt);
    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim();
      const open = stack.pop();
      if (open !== name) return open ? `</${name}> closes <${open}>` : `</${name}> closes nothing`;
      i = gt + 1;
      continue;
    }
    const m = /^([A-Za-z_][\w.:-]*)/.exec(raw);
    if (!m) return "a malformed tag";
    if (stack.length === 0 && rootSeen) return "more than one root element";
    if (stack.length === 0) rootSeen = true;
    if (!raw.endsWith("/")) stack.push(m[1] as string);
    i = gt + 1;
  }
  if (stack.length > 0) return `<${stack[stack.length - 1]}> is not closed`;
  return rootSeen ? undefined : "no root element";
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Element text: CDATA unwrapped, the five XML entities and numeric references decoded. */
export function xmlText(raw: string): string {
  const parts: string[] = [];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let last = 0;
  for (const m of raw.matchAll(re)) {
    parts.push(decode(raw.slice(last, m.index)), m[1] as string);
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(decode(raw.slice(last)));
  return parts.join("").trim();
}

function decode(s: string): string {
  return s.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);/g, (all, e: string) => {
    if (e.startsWith("#x")) return safeChar(Number.parseInt(e.slice(2), 16)) ?? all;
    if (e.startsWith("#")) return safeChar(Number.parseInt(e.slice(1), 10)) ?? all;
    return ENTITIES[e] ?? all;
  });
}

function safeChar(code: number): string | undefined {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : undefined;
}

function escapeName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every `<name>…</name>` block (non-nesting elements such as `item`, `url`). */
function blocks(text: string, name: string): string[] {
  const n = escapeName(name);
  return [...text.matchAll(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}\\s*>`, "g"))].map(
    (m) => m[1] as string,
  );
}

/** The text of the first `<name>` child, or undefined. */
function child(block: string, name: string): string | undefined {
  const n = escapeName(name);
  const m = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}\\s*>`).exec(block);
  return m ? xmlText(m[1] as string) : undefined;
}

/** `url="…"` attributes of `<enclosure>` and `<media:content>`. */
function mediaAttributes(block: string): string[] {
  return [...block.matchAll(/<(?:enclosure|media:content)\b[^>]*?\burl\s*=\s*(["'])(.*?)\1/g)].map(
    (m) => decode(m[2] as string),
  );
}

/** A URL's path as the site routes it (no query, fragment or trailing slash), or undefined. */
export function urlPath(url: string): string | undefined {
  try {
    const u = new URL(url.trim(), "https://site.invalid");
    let p = u.pathname;
    try {
      p = decodeURI(p);
    } catch {
      // keep the encoded form
    }
    return p.length > 1 ? p.replace(/\/+$/, "") || "/" : p || "/";
  } catch {
    return undefined;
  }
}

function future(at: string | undefined, now: string): boolean {
  if (!at) return false;
  const t = Date.parse(at);
  return Number.isFinite(t) && t > instantMs(now) + FUTURE_TOLERANCE_MS;
}

/** Checks shared by both documents: reachability and well-formedness. */
function documentProblems(
  kind: FeedDocumentKind,
  doc: FetchedDocument | undefined,
  root: RegExp,
): FeedFinding[] | undefined {
  if (doc?.status !== 200)
    return [
      finding(kind, "feed-unreachable", "error", {
        detail: doc ? `HTTP ${doc.status}` : "no answer",
      }),
    ];
  if (doc.body.length > MAX_DOCUMENT_CHARS)
    return [finding(kind, "feed-invalid", "error", { detail: "the document is too large" })];
  const problem = xmlProblem(doc.body);
  if (problem) return [finding(kind, "feed-invalid", "error", { detail: problem })];
  if (!root.test(doc.body))
    return [
      finding(kind, "feed-invalid", "error", {
        detail: kind === "rss" ? "not an RSS 2.0 channel" : "not a sitemap urlset",
      }),
    ];
  return undefined;
}

/** The gate self-check and the asset check over every URL and the raw text. */
function exposure(
  kind: FeedDocumentKind,
  body: string,
  paths: ReadonlySet<string>,
  exp: FeedExpectations,
): FeedFinding[] {
  const out: FeedFinding[] = [];
  for (const g of exp.gated)
    if (paths.has(g.path) || body.includes(g.nodeId))
      out.push(
        finding(kind, "feed-gated-node", "error", {
          nodeId: g.nodeId,
          url: g.path,
          detail: `${g.state} content appears in the ${kind === "rss" ? "feed" : "sitemap"}`,
        }),
      );
  const live = new Set(exp.mediaPrefixes);
  const seen = new Set<string>();
  for (const m of body.matchAll(/\/media\/([0-9a-f]{16})\/[^\s"'<>]*/g)) {
    const prefix = m[1] as string;
    if (live.has(prefix) || seen.has(prefix)) continue;
    seen.add(prefix);
    out.push(finding(kind, "feed-asset-not-live", "warning", { url: m[0] }));
  }
  return out;
}

function missingNewest(
  kind: FeedDocumentKind,
  paths: ReadonlySet<string>,
  exp: FeedExpectations,
): FeedFinding[] {
  return exp.newest
    .slice(0, FEED_NEWEST)
    .filter((e) => !paths.has(e.path))
    .map((e) =>
      finding(kind, "feed-missing-entry", "warning", {
        nodeId: e.nodeId,
        url: e.path,
        detail: `the newest entry "${e.title}" is missing`,
      }),
    );
}

/** Checks the site's RSS 2.0 feed. */
export function checkRss(doc: FetchedDocument | undefined, exp: FeedExpectations): FeedFinding[] {
  const bad = documentProblems("rss", doc, /<rss\b[\s\S]*<channel\b/);
  if (bad || !doc) return bad ?? [];
  const out: FeedFinding[] = [];
  const paths = new Set<string>();
  blocks(doc.body, "item").forEach((item, n) => {
    const title = child(item, "title");
    const link = child(item, "link");
    const guid = child(item, "guid");
    if (!title || !link)
      out.push(
        finding("rss", "feed-item-incomplete", "warning", {
          detail: `item ${n + 1} has no ${title ? "link" : "title"}`,
          ...(link ? { url: link } : {}),
        }),
      );
    for (const u of [link, guid, ...mediaAttributes(item)]) {
      const p = u ? urlPath(u) : undefined;
      if (p) paths.add(p);
    }
    const date = child(item, "pubDate");
    if (future(date, exp.now))
      out.push(
        finding("rss", "feed-future-date", "warning", {
          detail: `pubDate ${date} is in the future`,
          ...(link ? { url: link } : {}),
        }),
      );
  });
  out.push(...missingNewest("rss", paths, exp), ...exposure("rss", doc.body, paths, exp));
  return out;
}

/** Checks the site's sitemap. */
export function checkSitemap(
  doc: FetchedDocument | undefined,
  exp: FeedExpectations,
): FeedFinding[] {
  const bad = documentProblems("sitemap", doc, /<urlset\b/);
  if (bad || !doc) return bad ?? [];
  const out: FeedFinding[] = [];
  const paths = new Set<string>();
  blocks(doc.body, "url").forEach((url, n) => {
    const loc = child(url, "loc");
    if (!loc) {
      out.push(
        finding("sitemap", "feed-item-incomplete", "warning", {
          detail: `url ${n + 1} has no loc`,
        }),
      );
      return;
    }
    const p = urlPath(loc);
    if (p) paths.add(p);
    const lastmod = child(url, "lastmod");
    if (future(lastmod, exp.now))
      out.push(
        finding("sitemap", "feed-future-date", "warning", {
          detail: `lastmod ${lastmod} is in the future`,
          url: loc,
        }),
      );
  });
  out.push(...missingNewest("sitemap", paths, exp), ...exposure("sitemap", doc.body, paths, exp));
  return out;
}
