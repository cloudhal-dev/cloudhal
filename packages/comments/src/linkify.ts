/**
 * Plain text → safe HTML (RFC-0007 §6.4, §8.1, invariant C7). One function shared by the public
 * renderer and Studio's `CommentText` block, so the preview a moderator sees is the page readers get:
 *
 * - every character is escaped; there is no markup in comments;
 * - only `https:` URLs become anchors, with `rel="ugc nofollow noopener noreferrer"` (Google's
 *   guidance for user content). `http:`, `www.`, `javascript:`, `data:` and everything else stay
 *   text; so do URLs with credentials (`https://bank.example@evil.example`) or without a dotted host;
 * - trailing punctuation and unbalanced closing brackets are left out of the link;
 * - `href` is the parsed URL (international hosts in punycode), the link text is what was typed;
 * - paragraphs split on blank lines, single line breaks become `<br>`.
 */

export const COMMENT_LINK_REL = "ugc nofollow noopener noreferrer";

export type TextSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly href: string };

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

const CANDIDATE = /https:\/\/[^\s<>"'`\u00A0\u2000-\u200B\u3000]+/giu;
const TRAILING = /[.,;:!?'"*_~]$/u;

function trimCandidate(raw: string): string {
  let s = raw;
  for (;;) {
    if (TRAILING.test(s)) {
      s = s.slice(0, -1);
      continue;
    }
    const last = s.at(-1);
    const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
    const open = last ? pairs[last] : undefined;
    if (open && last) {
      const opens = s.split(open).length - 1;
      const closes = s.split(last).length - 1;
      if (closes > opens) {
        s = s.slice(0, -1);
        continue;
      }
    }
    return s;
  }
}

/** The safe `href` for a candidate, or `undefined` when it must stay text. */
export function safeHref(candidate: string): string | undefined {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  if (url.username !== "" || url.password !== "") return undefined;
  const host = url.hostname;
  if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) return undefined;
  return url.href;
}

/** Splits plain text into text and `https:` link segments. */
export function linkify(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let last = 0;
  const push = (t: string) => {
    if (t.length === 0) return;
    const prev = out.at(-1);
    if (prev?.kind === "text") out[out.length - 1] = { kind: "text", text: prev.text + t };
    else out.push({ kind: "text", text: t });
  };
  for (const m of text.matchAll(CANDIDATE)) {
    const start = m.index ?? 0;
    // a match glued to a preceding letter or digit ("xhttps://…") is not a link
    const before = text.slice(Math.max(0, start - 1), start);
    if (/[\p{L}\p{N}]/u.test(before)) continue;
    const candidate = trimCandidate(m[0]);
    const href = safeHref(candidate);
    if (!href || candidate.length <= "https://".length) continue;
    push(text.slice(last, start));
    out.push({ kind: "link", text: candidate, href });
    last = start + candidate.length;
  }
  push(text.slice(last));
  return out;
}

function inlineHtml(text: string): string {
  return linkify(text)
    .map((s) =>
      s.kind === "text"
        ? escapeHtml(s.text).replace(/\n/g, "<br>")
        : `<a href="${escapeHtml(s.href)}" rel="${COMMENT_LINK_REL}">${escapeHtml(s.text)}</a>`,
    )
    .join("");
}

/** Plain text as paragraphs of escaped HTML with `https:` links (the public page and Studio). */
export function commentTextHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/^\n+|\n+$/g, ""))
    .filter((p) => p.length > 0)
    .map((p) => `<p>${inlineHtml(p)}</p>`)
    .join("");
}
