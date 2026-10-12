/**
 * The reader-comments section as HTML (RFC-0007 §8.1–§8.2), a pure function of a `CommentsView`
 * so it can be tested as text. `<Comments />` (`components/Comments.astro`) renders it.
 *
 * - Approved comments, oldest first, two visible levels (`<ol>`/`<li id="comment-<id>">`/
 *   `<article>`): the escaped name, a staff badge, `<time datetime>`, the text through
 *   `commentTextHtml` (plain text; only `https:` URLs become links, `rel="ugc nofollow noopener
 *   noreferrer"`), "in reply to <name>" for replies to replies, and a "Report" disclosure with a
 *   small plain form per comment. A removed top-level comment with approved replies reads
 *   "This comment was removed".
 * - Open threads get the plain HTML form (`method=post action=/__cloudhal/comments`, a honeypot,
 *   hidden challenge fields the module fills) and the module tag; closed ones "Comments are
 *   closed"; hidden and off threads render nothing.
 * - The outcome notes (`#comment-pending`, `#comment-invalid`, …) are hidden until the fragment
 *   names them (`:target`), so a JavaScript-less post's `303` lands on the cached page and still
 *   explains itself.
 *
 * No third-party resource, no inline script; the only `<style>` is functional (notes, the
 * honeypot, the live region) and themes style the rest through the `cloudhal-comment*` classes.
 */
import { type Comment, commentTextHtml, escapeHtml, type RenderItem } from "@cloudhal/comments";
import { COMMENTS_PATH, COMMENTS_REPORT_PATH } from "./comments.ts";
import type { CommentsView } from "./comments-view.ts";

export interface CommentStrings {
  readonly heading: (count: number) => string;
  readonly preview: string;
  readonly closed: string;
  readonly removed: string;
  readonly anonymous: string;
  readonly author: string;
  readonly team: string;
  readonly inReplyTo: (name: string) => string;
  readonly reply: string;
  readonly cancelReply: string;
  readonly replyingTo: string;
  readonly report: string;
  readonly reportReason: string;
  readonly reasons: Readonly<
    Record<"spam" | "abuse" | "personal-data" | "illegal-content" | "other", string>
  >;
  readonly reportDetails: string;
  readonly reportEmail: string;
  readonly sendReport: string;
  readonly more: string;
  readonly pages: string;
  readonly formTitle: string;
  readonly name: string;
  readonly nameHint: string;
  readonly email: string;
  readonly emailHint: string;
  readonly comment: string;
  readonly website: string;
  readonly moderation: string;
  readonly scriptRequired: string;
  readonly submit: string;
  readonly sending: string;
  readonly awaiting: string;
  readonly notes: Readonly<
    Record<
      | "pending"
      | "invalid"
      | "closed"
      | "script-required"
      | "slow-down"
      | "try-again"
      | "paused"
      | "reported",
      string
    >
  >;
}

const EN: CommentStrings = {
  heading: (n) => (n === 0 ? "Comments" : n === 1 ? "1 comment" : `${n} comments`),
  preview: "Comments appear on the published page.",
  closed: "Comments are closed.",
  removed: "This comment was removed.",
  anonymous: "Anonymous",
  author: "Author",
  team: "Team",
  inReplyTo: (name) => `in reply to ${name}`,
  reply: "Reply",
  cancelReply: "Cancel reply",
  replyingTo: "Replying to",
  report: "Report",
  reportReason: "Why should we look at this comment?",
  reasons: {
    spam: "Spam",
    abuse: "Abuse or harassment",
    "personal-data": "Someone's personal data",
    "illegal-content": "Illegal content",
    other: "Something else",
  },
  reportDetails: "Details (optional)",
  reportEmail: "Your email (optional, never shown)",
  sendReport: "Send report",
  more: "More comments",
  pages: "Comment pages",
  formTitle: "Leave a comment",
  name: "Name",
  nameHint: "Shown with your comment.",
  email: "Email (optional)",
  emailHint: "Never shown; used only if you ask us about your comment.",
  comment: "Comment",
  website: "Leave this field empty",
  moderation:
    "Comments are reviewed before they appear. We store your name and comment, and your email if you give one; no cookies.",
  scriptRequired: "Comments on this site need JavaScript.",
  submit: "Post comment",
  sending: "Sending…",
  awaiting: "Awaiting moderation",
  notes: {
    pending: "Thanks — your comment will appear once a moderator approves it.",
    invalid: "Please check your name and comment, then try again.",
    closed: "Comments on this article are closed.",
    "script-required": "Comments on this site need JavaScript.",
    "slow-down": "You are commenting a little fast. Please wait a moment and try again.",
    "try-again": "Your comment could not be sent. Please try again.",
    paused: "Comments are paused for today. Please try again tomorrow.",
    reported: "Thank you — a person will look at the comment you reported.",
  },
};

const TR: CommentStrings = {
  heading: (n) => (n === 0 ? "Yorumlar" : `${n} yorum`),
  preview: "Yorumlar yayımlanan sayfada görünür.",
  closed: "Yorumlar kapalı.",
  removed: "Bu yorum kaldırıldı.",
  anonymous: "Anonim",
  author: "Yazar",
  team: "Ekip",
  inReplyTo: (name) => `${name} adlı kişiye yanıt`,
  reply: "Yanıtla",
  cancelReply: "Yanıtı iptal et",
  replyingTo: "Yanıtlanan:",
  report: "Bildir",
  reportReason: "Bu yoruma neden bakmalıyız?",
  reasons: {
    spam: "Spam",
    abuse: "Taciz veya hakaret",
    "personal-data": "Birinin kişisel verisi",
    "illegal-content": "Yasa dışı içerik",
    other: "Başka bir şey",
  },
  reportDetails: "Ayrıntılar (isteğe bağlı)",
  reportEmail: "E-postanız (isteğe bağlı, gösterilmez)",
  sendReport: "Bildirimi gönder",
  more: "Diğer yorumlar",
  pages: "Yorum sayfaları",
  formTitle: "Yorum yazın",
  name: "Ad",
  nameHint: "Yorumunuzla birlikte gösterilir.",
  email: "E-posta (isteğe bağlı)",
  emailHint: "Gösterilmez; yalnızca yorumunuzla ilgili bize yazarsanız kullanılır.",
  comment: "Yorum",
  website: "Bu alanı boş bırakın",
  moderation:
    "Yorumlar yayımlanmadan önce incelenir. Adınızı ve yorumunuzu, verirseniz e-postanızı saklarız; çerez kullanmayız.",
  scriptRequired: "Bu sitede yorum yazmak için JavaScript gerekir.",
  submit: "Yorumu gönder",
  sending: "Gönderiliyor…",
  awaiting: "Onay bekliyor",
  notes: {
    pending: "Teşekkürler — yorumunuz bir moderatör onayladığında görünecek.",
    invalid: "Lütfen adınızı ve yorumunuzu kontrol edip yeniden deneyin.",
    closed: "Bu yazıya yorumlar kapandı.",
    "script-required": "Bu sitede yorum yazmak için JavaScript gerekir.",
    "slow-down": "Biraz hızlı yorum yazıyorsunuz. Lütfen biraz bekleyip yeniden deneyin.",
    "try-again": "Yorumunuz gönderilemedi. Lütfen yeniden deneyin.",
    paused: "Yorumlar bugünlük durduruldu. Lütfen yarın yeniden deneyin.",
    reported: "Teşekkürler — bildirdiğiniz yoruma bir kişi bakacak.",
  },
};

/** The section's words for a locale (English for languages without a translation). */
export function commentStrings(locale: string): CommentStrings {
  return locale.toLowerCase().split("-")[0] === "tr" ? TR : EN;
}

const e = escapeHtml;

/** Only the functional rules; themes style the rest (zero-specificity `:where`). */
const STYLE = `<style>:where(.cloudhal-comment-note){display:none}:where(.cloudhal-comment-note:target){display:block}.cloudhal-comment-hp,.cloudhal-comments-live{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}</style>`;

function authorName(c: Comment, t: CommentStrings): string {
  return c.author.kind === "erased" ? t.anonymous : c.author.name;
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 10);
  }
}

function reportForm(c: Comment, t: CommentStrings): string {
  const id = `report-${c.id}`;
  const options = Object.entries(t.reasons)
    .map(([value, label]) => `<option value="${e(value)}">${e(label)}</option>`)
    .join("");
  return `<details class="cloudhal-comment-report"><summary>${e(t.report)}</summary><form class="cloudhal-report-form" method="post" action="${COMMENTS_REPORT_PATH}" data-kind="report"><input type="hidden" name="commentId" value="${e(c.id)}"><p><label for="${id}-reason">${e(t.reportReason)}</label> <select id="${id}-reason" name="reason" required>${options}</select></p><p><label for="${id}-details">${e(t.reportDetails)}</label> <textarea id="${id}-details" name="details" maxlength="1000" rows="3"></textarea></p><p><label for="${id}-email">${e(t.reportEmail)}</label> <input id="${id}-email" name="email" type="email" maxlength="254" autocomplete="email"></p><div class="cloudhal-comment-hp" aria-hidden="true"><label for="${id}-website">${e(t.website)}</label><input id="${id}-website" name="website" tabindex="-1" autocomplete="off"></div><input type="hidden" name="challenge" value=""><input type="hidden" name="solution" value=""><div data-turnstile></div><p><button type="submit">${e(t.sendReport)}</button></p></form></details>`;
}

function commentHtml(
  c: Comment,
  view: CommentsView,
  t: CommentStrings,
  names: ReadonlyMap<string, string>,
  top: boolean,
  inner = "",
): string {
  const name = authorName(c, t);
  const badge =
    c.author.kind === "staff"
      ? ` <span class="cloudhal-comment-badge">${e(c.author.badge === "author" ? t.author : t.team)}</span>`
      : "";
  const answered = c.inReplyToId ? names.get(c.inReplyToId) : undefined;
  const context =
    c.inReplyToId && answered !== undefined
      ? ` <a class="cloudhal-comment-context" href="#comment-${e(c.inReplyToId)}">${e(t.inReplyTo(answered))}</a>`
      : "";
  const reply =
    view.state === "open"
      ? `<button type="button" class="cloudhal-comment-reply" data-reply="${e(c.id)}" data-name="${e(name)}" hidden>${e(t.reply)}</button> `
      : "";
  return `<li id="comment-${e(c.id)}" class="cloudhal-comment"${top ? " data-thread" : ""}><article aria-labelledby="comment-${e(c.id)}-author"><header class="cloudhal-comment-meta"><strong class="cloudhal-comment-author" id="comment-${e(c.id)}-author">${e(name)}</strong>${badge} <a class="cloudhal-comment-time" href="#comment-${e(c.id)}"><time datetime="${e(c.createdAt)}">${e(formatDate(c.createdAt, view.locale))}</time></a>${context}</header><div class="cloudhal-comment-body">${c.body ? commentTextHtml(c.body.text) : ""}</div><footer class="cloudhal-comment-actions">${reply}${reportForm(c, t)}</footer></article>${inner}</li>`;
}

function itemHtml(
  item: RenderItem,
  view: CommentsView,
  t: CommentStrings,
  names: ReadonlyMap<string, string>,
): string {
  const replies = item.replies.length
    ? `<ol class="cloudhal-comment-replies">${item.replies.map((r) => commentHtml(r, view, t, names, false)).join("")}</ol>`
    : "";
  if ("comment" in item) return commentHtml(item.comment, view, t, names, true, replies);
  return `<li id="comment-${e(item.removed.id)}" class="cloudhal-comment cloudhal-comment-removed" data-thread><p>${e(t.removed)}</p>${replies}</li>`;
}

function formHtml(view: CommentsView, t: CommentStrings): string {
  const noScript = view.allowWithoutScript
    ? ""
    : `<noscript><p class="cloudhal-comment-noscript">${e(t.scriptRequired)}</p></noscript>`;
  return `<form id="comment-form" class="cloudhal-comment-form" method="post" action="${COMMENTS_PATH}" data-kind="comment" aria-labelledby="comment-form-title"><h3 id="comment-form-title">${e(t.formTitle)}</h3><p class="cloudhal-comment-replying" data-replying hidden></p>${noScript}<input type="hidden" name="nodeId" value="${e(view.nodeId)}"><input type="hidden" name="parentId" value=""><p><label for="comment-name">${e(t.name)}</label> <input id="comment-name" name="name" required maxlength="80" autocomplete="name" aria-describedby="comment-name-hint"> <small id="comment-name-hint">${e(t.nameHint)}</small></p><p><label for="comment-email">${e(t.email)}</label> <input id="comment-email" name="email" type="email" maxlength="254" autocomplete="email" aria-describedby="comment-email-hint"> <small id="comment-email-hint">${e(t.emailHint)}</small></p><p><label for="comment-body">${e(t.comment)}</label> <textarea id="comment-body" name="body" required minlength="2" maxlength="5000" rows="6"></textarea></p><div class="cloudhal-comment-hp" aria-hidden="true"><label for="comment-website">${e(t.website)}</label><input id="comment-website" name="website" tabindex="-1" autocomplete="off"></div><input type="hidden" name="challenge" value=""><input type="hidden" name="solution" value=""><div data-turnstile></div><p class="cloudhal-comment-privacy">${e(t.moderation)}</p><p class="cloudhal-comment-submit"><button type="submit">${e(t.submit)}</button> <button type="button" data-cancel-reply hidden>${e(t.cancelReply)}</button></p></form>`;
}

/**
 * The section's HTML for a view, or `""` when nothing is shown (hidden and off threads, or no
 * view). Previews get a placeholder and never show comments.
 */
export function commentsHtml(view: CommentsView | undefined, strings?: CommentStrings): string {
  if (!view) return "";
  const t = strings ?? commentStrings(view.locale);
  if (view.state === "preview")
    return `<section class="cloudhal-comments cloudhal-comments-preview" id="comments"><p>${e(t.preview)}</p></section>`;
  if (view.state !== "open" && view.state !== "closed") return "";
  const page = view.page;
  const items = page?.items ?? [];
  const names = new Map<string, string>();
  for (const item of items)
    for (const c of "comment" in item ? [item.comment, ...item.replies] : item.replies)
      names.set(c.id, authorName(c, t));
  const open = view.state === "open";
  const notes = Object.entries(t.notes)
    .map(
      ([id, text]) =>
        `<p class="cloudhal-comment-note" id="comment-${id}" tabindex="-1">${e(text)}</p>`,
    )
    .join("");
  const attrs = [
    `class="cloudhal-comments"`,
    `id="comments"`,
    `aria-labelledby="comments-title"`,
    `data-cloudhal-comments`,
    `data-state="${view.state}"`,
    ...(open
      ? [
          `data-protection="${e(view.protection)}"`,
          ...(view.protection === "turnstile" && view.turnstileSiteKey
            ? [`data-sitekey="${e(view.turnstileSiteKey)}"`]
            : []),
          `data-sending="${e(t.sending)}"`,
          `data-pending-label="${e(t.awaiting)}"`,
          `data-reply-label="${e(t.replyingTo)}"`,
        ]
      : []),
  ].join(" ");
  const list = `<ol class="cloudhal-comment-list"${items.length ? "" : " hidden"}>${items.map((i) => itemHtml(i, view, t, names)).join("")}</ol>`;
  const more =
    page && page.page < page.pageCount
      ? `<nav class="cloudhal-comments-pages" aria-label="${e(t.pages)}"><a href="${e(view.path)}?comments=${page.page + 1}#comments" data-more>${e(t.more)}</a></nav>`
      : "";
  const tail = open
    ? `${formHtml(view, t)}${view.script ? `<script type="module" src="${e(view.script)}"></script>` : ""}`
    : `<p class="cloudhal-comments-closed">${e(t.closed)}</p>`;
  return `<section ${attrs}>${STYLE}<h2 id="comments-title">${e(t.heading(page?.total ?? 0))}</h2><div class="cloudhal-comment-notes">${notes}</div><p class="cloudhal-comments-live" data-live aria-live="polite"></p>${list}${more}${tail}</section>`;
}
