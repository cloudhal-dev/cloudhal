/**
 * Pure helpers for the comment blocks (RFC-0007 §4.3, §6.4, §8.1, §14): turning plain comment text
 * into paragraphs, lines and safe links, building the two-level thread, and formatting times. No
 * React and no DOM: everything here is data in, data out, so it is easy to test and to share.
 *
 * Comment text is **untrusted reader text**. Nothing here produces HTML: the blocks render the
 * segments as React text nodes and Kumo `Link`s, so markup in a comment stays literal text.
 */

import type {
  Comment,
  CommentAuthor,
  CommentLabel,
  CommentModeration,
  CommentStatus,
} from "@cloudhal/core-contracts";
import { dateTimeFormat, relativeTimeFormat } from "@cloudhal/messages/format";

export type CommentLabelName = CommentLabel["label"];
export type CommentLabelSource = CommentLabel["source"];
export type CommentModerationAction = CommentModeration["action"];
export type CommentReasonCode = NonNullable<CommentModeration["reasonCode"]>;
/** The per-entry override of `comment_threads.mode` (RFC-0007 §4.5). */
export type CommentThreadMode = "default" | "open" | "closed" | "hidden";
/** The effective state `threadState` computes (RFC-0007 §4.5). */
export type CommentThreadState = "open" | "closed" | "hidden" | "off";
/** The report reasons a reader may pick (RFC-0007 §5.2, DSA Art. 16). */
export type CommentReportReason = "spam" | "abuse" | "personal-data" | "illegal-content" | "other";

export const COMMENT_STATUSES: readonly CommentStatus[] = [
  "pending",
  "approved",
  "hidden",
  "spam",
  "deleted",
];
export const COMMENT_LABELS: readonly CommentLabelName[] = [
  "spam-suspect",
  "toxic",
  "off-topic",
  "question",
  "needs-reply",
  "praise",
  "personal-data",
  "links",
  "watch-word",
  "instruction-like",
];
export const COMMENT_REASON_CODES: readonly CommentReasonCode[] = [
  "spam",
  "abuse",
  "off-topic",
  "personal-data",
  "illegal-content",
  "legal-order",
  "author-request",
  "erasure-request",
  "duplicate",
  "other",
];
export const COMMENT_THREAD_MODES: readonly CommentThreadMode[] = [
  "default",
  "open",
  "closed",
  "hidden",
];
export const COMMENT_REPORT_REASONS: readonly CommentReportReason[] = [
  "spam",
  "abuse",
  "personal-data",
  "illegal-content",
  "other",
];
/** Levels a thread shows (RFC-0007 §4.3: `COMMENT_DISPLAY_DEPTH`). */
export const COMMENT_DISPLAY_DEPTH = 2;

/** The id of a comment's element, the target of "in reply to" links (`#comment-<id>`). */
export function commentAnchorId(id: string): string {
  return `comment-${id}`;
}

/** True when the comment carries the `instruction-like` label: it talks to an AI (§6.4, §11.2). */
export function isInstructionLike(labels: readonly CommentLabel[] | undefined): boolean {
  return (labels ?? []).some((l) => l.label === "instruction-like");
}

/** The display name of an author, or `undefined` for an erased one (the screen says "Anonymous"). */
export function commentAuthorName(author: CommentAuthor): string | undefined {
  return author.kind === "erased" ? undefined : author.name;
}

// ---- Text → paragraphs, lines, links ---------------------------------------------------------

export type CommentTextSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };
/** One line of a paragraph: text and link segments, in order. */
export type CommentTextLine = CommentTextSegment[];
/** A paragraph: lines separated by single line feeds. */
export type CommentTextParagraph = CommentTextLine[];

/** What a link candidate looks like (RFC-0007 §6.4 counts `https?://` and `www.`). */
const CANDIDATE = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const TRAILING = /[.,;:!?'"’”»)\]}>]$/;

/** Strips sentence punctuation (and unbalanced closing brackets) from the end of a link. */
function trimCandidate(candidate: string): string {
  let out = candidate;
  while (TRAILING.test(out)) {
    const last = out.at(-1) as string;
    const open = { ")": "(", "]": "[", "}": "{" }[last];
    if (open && out.split(open).length - 1 >= out.split(last).length - 1) break;
    out = out.slice(0, -1);
  }
  return out;
}

/**
 * The public page's link rule (RFC-0007 §6.4, §8.1): only `https:` URLs with a host become links.
 * `http:`, `www.` without a scheme, `javascript:` and every other scheme, and URLs carrying a user
 * name or password (`https://bank.example@evil.example`) stay text. Returns the normalised href.
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
export function linkifyCommentLine(line: string): CommentTextLine {
  const out: CommentTextLine = [];
  let at = 0;
  const pushText = (text: string) => {
    if (!text) return;
    const prev = out.at(-1);
    if (prev?.kind === "text") prev.text += text;
    else out.push({ kind: "text", text });
  };
  for (const m of line.matchAll(CANDIDATE)) {
    const start = m.index ?? 0;
    // A candidate glued to a word ("foohttps://…") is not a link.
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

/**
 * Comment text as paragraphs (split on blank lines) of lines (split on line feeds) of segments.
 * The input is the contract's plain text (already normalised by the server); `\r\n` is folded here
 * too so imported text renders the same.
 */
export function parseCommentText(text: string): CommentTextParagraph[] {
  const normalised = text.replace(/\r\n?/g, "\n").trim();
  if (!normalised) return [];
  return normalised
    .split(/\n[ \t]*\n+/)
    .map((p) => p.replace(/^\n+|\n+$/g, ""))
    .filter((p) => p.trim().length > 0)
    .map((p) => p.split("\n").map(linkifyCommentLine));
}

/** A single-line excerpt for tooltips and dialogs: whitespace collapsed, cut at a word. */
export function commentExcerpt(text: string, max = 280): { text: string; truncated: boolean } {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return { text: flat, truncated: false };
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return { text: `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`, truncated: true };
}

// ---- Threads -------------------------------------------------------------------------------

/** What the thread needs from a comment (the `Comment` contract fits). */
export type ThreadComment = Pick<
  Comment,
  "id" | "parentId" | "inReplyToId" | "createdAt" | "author" | "status"
>;

export interface CommentThreadNode<C extends ThreadComment> {
  /** The top-level comment, or `null` when it is not in the list (removed, or not loaded). */
  comment: C | null;
  /** The top-level id (the comment's, or the missing parent's). */
  id: string;
  /** Replies at the second level, oldest first, including replies to replies (§4.3). */
  replies: C[];
}

const byTime = <C extends ThreadComment>(a: C, b: C) =>
  a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt);

/**
 * The two-level tree of RFC-0007 §4.3: top-level comments oldest first, each with its replies
 * oldest first. `parentId` is always a top-level comment; a reply to a reply sits at the second
 * level with `inReplyToId` naming the comment it answers. Replies whose top-level comment is
 * missing are grouped under a `comment: null` node (the screen shows "This comment was removed").
 */
export function buildCommentThread<C extends ThreadComment>(
  comments: readonly C[],
): CommentThreadNode<C>[] {
  const roots = new Map<string, CommentThreadNode<C>>();
  const replies: C[] = [];
  for (const c of [...comments].sort(byTime)) {
    if (c.parentId && c.parentId !== c.id) replies.push(c);
    else roots.set(c.id, { comment: c, id: c.id, replies: [] });
  }
  for (const r of replies) {
    const parentId = r.parentId as string;
    let node = roots.get(parentId);
    if (!node) {
      node = { comment: null, id: parentId, replies: [] };
      roots.set(parentId, node);
    }
    node.replies.push(r);
  }
  const first = (n: CommentThreadNode<C>) => n.comment ?? n.replies[0];
  return [...roots.values()].sort((a, b) => byTime(first(a) as C, first(b) as C));
}

// ---- Time ------------------------------------------------------------------------------------

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

/**
 * "5 minutes ago" in the Studio locale (`Intl.RelativeTimeFormat`) and the absolute date and time
 * for the tooltip (DESIGN.md §5 "Time"). An unparseable value is returned as it came.
 */
export function formatCommentTime(
  iso: string,
  locale: string,
  now: number = Date.now(),
): { relative: string; absolute: string } {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return { relative: iso, absolute: iso };
  const seconds = Math.round((at - now) / 1000);
  const abs = Math.abs(seconds);
  const [unit, size] = UNITS.find(([, s]) => abs >= s) ?? ["second", 1];
  const rtf = relativeTimeFormat(locale, { numeric: "auto" });
  const relative =
    abs < 45 ? rtf.format(0, "second") : rtf.format(Math.round(seconds / size), unit);
  const absolute = dateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(at);
  return { relative, absolute };
}

/** A calendar date in the Studio locale ("10 Jan 2027"). */
export function formatCommentDate(iso: string, locale: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  return dateTimeFormat(locale, { dateStyle: "medium" }).format(at);
}
