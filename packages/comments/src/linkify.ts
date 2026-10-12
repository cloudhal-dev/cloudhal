/**
 * Plain text → paragraphs, lines and safe links (RFC-0007 §6.4, §8.1, §14, invariant C7). The one
 * link rule shared by the public renderer and Studio's comment blocks, so the preview a moderator
 * sees is the page readers get. Worker-safe; no DOM.
 *
 * - Candidates are `https?://…` and `www.…` runs up to whitespace, `<`, `>`, quotes or a backtick
 *   (what §6.4 counts as links). A candidate glued to a letter, digit or `_` is not a link.
 * - Sentence punctuation and unbalanced closing brackets are trimmed from the end.
 * - Only `https:` URLs with a dotted host and no user name or password become links
 *   (`https://bank.example@evil.example` stays text); `http:`, bare `www.`, `javascript:` and every
 *   other scheme stay literal text. `href` is the parsed URL (international hosts in punycode);
 *   the link text is what was typed.
 * - Paragraphs split on blank lines, lines on single line feeds.
 *
 * These rules are identical to the interim copy in `@cloudhal/ui` (`blocks/comment-model.ts`,
 * `parseCommentText`/`safeCommentHref`), checked by the shared fixture
 * `@cloudhal/comments/fixtures/comment-text.json`. `commentTextHtml` adds the escaping for
 * server-rendered HTML.
 */

export const COMMENT_LINK_REL = "ugc nofollow noopener noreferrer";

export type TextSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly href: string };
/** One line of a paragraph: text and link segments, in order. */
export type TextLine = TextSegment[];
/** A paragraph: lines separated by single line feeds. */
export type TextParagraph = TextLine[];

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

const CANDIDATE = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const TRAILING = /[.,;:!?'"’”»)\]}>]$/;
const PAIRS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/** Strips sentence punctuation (and unbalanced closing brackets) from the end of a candidate. */
function trimCandidate(candidate: string): string {
  let out = candidate;
  while (TRAILING.test(out)) {
    const last = out.at(-1) as string;
    const open = PAIRS[last];
    if (open && out.split(open).length - 1 >= out.split(last).length - 1) break;
    out = out.slice(0, -1);
  }
  return out;
}

/**
 * The link rule: the normalised `href` of an `https:` URL with a dotted host and no credentials,
 * or `undefined` when the candidate must stay text.
 */
export function safeCommentHref(candidate: string): string | undefined {
  if (!/^https:\/\//i.test(candidate)) return undefined;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username || url.password) return undefined;
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) return undefined;
  return url.href;
}

/** Splits one line into text and link segments. */
export function linkifyCommentLine(line: string): TextLine {
  const out: TextLine = [];
  let at = 0;
  const pushText = (text: string) => {
    if (!text) return;
    const prev = out.at(-1);
    if (prev?.kind === "text") out[out.length - 1] = { kind: "text", text: prev.text + text };
    else out.push({ kind: "text", text });
  };
  for (const m of line.matchAll(CANDIDATE)) {
    const start = m.index ?? 0;
    // a candidate glued to a word ("foohttps://…") is not a link
    if (start > 0 && /[\p{L}\p{N}_]/u.test(line[start - 1] as string)) continue;
    const text = trimCandidate(m[0]);
    const href = safeCommentHref(text);
    if (!href) continue;
    pushText(line.slice(at, start));
    out.push({ kind: "link", text, href });
    at = start + text.length;
  }
  pushText(line.slice(at));
  return out;
}

/** Segments of a whole text; line feeds stay inside text segments. */
export function linkify(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  const push = (s: TextSegment) => {
    const prev = out.at(-1);
    if (s.kind === "text" && prev?.kind === "text")
      out[out.length - 1] = { kind: "text", text: prev.text + s.text };
    else out.push(s);
  };
  text.split("\n").forEach((line, i) => {
    if (i > 0) push({ kind: "text", text: "\n" });
    for (const s of linkifyCommentLine(line)) push(s);
  });
  return out;
}

/**
 * Comment text as paragraphs (split on blank lines) of lines (split on line feeds) of segments.
 * `\r\n` is folded too, so imported text renders the same.
 */
export function parseCommentText(text: string): TextParagraph[] {
  const normalised = text.replace(/\r\n?/g, "\n").trim();
  if (!normalised) return [];
  return normalised
    .split(/\n[ \t]*\n+/)
    .map((p) => p.replace(/^\n+|\n+$/g, ""))
    .filter((p) => p.trim().length > 0)
    .map((p) => p.split("\n").map(linkifyCommentLine));
}

/**
 * Server-rendered HTML for the public page: `<p>` per paragraph, `<br>` between lines, every
 * character escaped, links with `rel="ugc nofollow noopener noreferrer"`. No `target`: the public
 * page leaves that to the reader (Studio's block opens links in a new tab).
 */
export function commentTextHtml(text: string): string {
  const segment = (s: TextSegment) =>
    s.kind === "text"
      ? escapeHtml(s.text)
      : `<a href="${escapeHtml(s.href)}" rel="${COMMENT_LINK_REL}">${escapeHtml(s.text)}</a>`;
  return parseCommentText(text)
    .map((p) => `<p>${p.map((line) => line.map(segment).join("")).join("<br>")}</p>`)
    .join("");
}
