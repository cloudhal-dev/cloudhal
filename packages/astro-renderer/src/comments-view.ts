/**
 * Reader comments in a page (RFC-0007 §8.1), the theme boundary: an article route calls
 * `loadComments` in its frontmatter (response headers can only be set there) and places
 * `<Comments view={…} />` after the article.
 *
 * ```astro
 * const comments = route.kind === "entry" ? await loadComments(config, Astro, route.entry) : undefined;
 * if (comments?.notFound) return new Response(null, { status: 404 });
 * …
 * <Comments view={comments} />
 * ```
 *
 * `loadComments`:
 * - returns `undefined` when the deployment has no comments (no usable `CLOUDHAL_COMMENTS_KEY` on
 *   Cloudflare, `comments.available: false`, or a static build, which has no endpoint);
 * - tags the response `cloudhal-comments-<entryId>` (published responses on Cloudflare only), so
 *   moderation purges that article and its comment pages, never archives or feeds — every entry
 *   page carries it, so turning comments on for a collection reaches pages cached while it was off;
 * - previews (and drafts in `cloudhal dev`) get a placeholder and never read comments;
 * - otherwise reads the settings, the thread row and one page of approved comments
 *   (`?comments=<n>`, 50 top-level comments a page; an out-of-range page is `notFound`, which the
 *   route answers with a `404`, never cached) and computes the thread state with `threadState`;
 * - on a page with an **open** form on a Turnstile site, sets the page's own CSP with Turnstile's
 *   origin added (every other page keeps the default).
 *
 * A read error renders no section (fail closed); the page itself still renders.
 */

import { commentsBackend } from "@cloudhal/astro-renderer/runtime";
import {
  type CommentSettings,
  type Protection,
  type RenderPage,
  threadState,
  withoutScriptAllowed,
} from "@cloudhal/comments";
import type { ContentEntry } from "@cloudhal/core-contracts";
import { addCacheTags, commentsCacheTag } from "./cache-tags.ts";
import { turnstileCsp } from "./csp.ts";
import type { CloudhalRendererConfig } from "./integration.ts";
import { entryPath } from "./routing.ts";

export { type CommentStrings, commentStrings, commentsHtml } from "./comments-html.ts";

/** What `<Comments />` renders. */
export interface CommentsView {
  readonly nodeId: string;
  /** The thread's effective state, or `preview` (a placeholder, nothing read). */
  readonly state: "open" | "closed" | "hidden" | "off" | "preview";
  /** One page of approved comments (absent for previews and unreadable threads). */
  readonly page?: RenderPage;
  /** The entry's path (the "more comments" link). */
  readonly path: string;
  readonly locale: string;
  readonly protection: Protection;
  readonly turnstileSiteKey: string | null;
  readonly allowWithoutScript: boolean;
  /** The module URL (`/_cloudhal/c.<hash>.js`), present when the integration built it. */
  readonly script?: string;
  /** `?comments=<n>` named a page that does not exist: answer `404`. */
  readonly notFound: boolean;
}

/** Minimal shape of the Astro global the page passes in. */
export interface CommentsAstro {
  readonly request: Request;
  readonly url: URL;
  readonly response: { readonly headers: Headers };
}

const PAGE_PARAM = "comments";

/** `?comments=<n>`: `1` when absent, `undefined` when malformed. */
export function commentsPageParam(url: URL): number | undefined {
  const raw = url.searchParams.get(PAGE_PARAM);
  if (raw === null) return 1;
  return /^[1-9][0-9]{0,4}$/.test(raw) ? Number(raw) : undefined;
}

/** The JSON-LD the article's `BlogPosting` gains (§8.1): `commentCount` and the first 10. */
export function commentsJsonLd(
  view: CommentsView | undefined,
  origin: string,
): { commentCount: number; comment?: object[] } | undefined {
  if (!view?.page || (view.state !== "open" && view.state !== "closed")) return undefined;
  const url = `${origin}${view.path}`;
  const comments = view.page.items
    .flatMap((i) => ("comment" in i ? [i.comment, ...i.replies] : i.replies))
    .slice(0, 10)
    .map((c) => ({
      "@type": "Comment",
      url: `${url}#comment-${c.id}`,
      dateCreated: c.createdAt,
      ...(c.body ? { text: c.body.text } : {}),
      author: {
        "@type": "Person",
        name: c.author.kind === "erased" ? "Anonymous" : c.author.name,
      },
    }));
  return {
    commentCount: view.page.total,
    ...(comments.length ? { comment: comments } : {}),
  };
}

export async function loadComments(
  config: CloudhalRendererConfig,
  astro: CommentsAstro,
  entry: ContentEntry,
  options: { readonly locale?: string; readonly now?: Date } = {},
): Promise<CommentsView | undefined> {
  const backend = await commentsBackend(config);
  if (!backend) return undefined;
  const headers = astro.response.headers;
  addCacheTags(headers, [commentsCacheTag(entry.id)]);
  const base = {
    nodeId: entry.id,
    path: entryPath(entry),
    locale: options.locale ?? entry.locale,
    ...(config.commentsScript ? { script: config.commentsScript } : {}),
  };
  const preview = (): CommentsView => ({
    ...base,
    state: "preview",
    protection: "pow",
    turnstileSiteKey: null,
    allowWithoutScript: true,
    notFound: false,
  });
  // Previews never read comments; in `cloudhal dev` (live source) a draft is a preview too.
  if (headers.get("x-cloudhal-mode") === "preview" || entry.status !== "published")
    return preview();
  const pageNumber = commentsPageParam(astro.url);
  let settings: CommentSettings;
  let page: RenderPage;
  let state: CommentsView["state"];
  try {
    const store = backend.store;
    const [s, thread] = await Promise.all([
      store.settings(entry.siteId),
      store.thread(entry.siteId, entry.id),
    ]);
    settings = s;
    page = await store.renderPage(entry.siteId, entry.id, pageNumber ?? 1);
    state = threadState({
      settings,
      entry: {
        nodeId: entry.id,
        collection: entry.collection,
        publishedAt: entry.publishedAt ?? null,
      },
      thread,
      hasApproved: page.total > 0,
      now: options.now ?? new Date(),
    });
  } catch (error) {
    console.warn(`cloudhal: comments of ${entry.id} could not be read`, error);
    return undefined;
  }
  const visible = state === "open" || state === "closed";
  const notFound =
    pageNumber === undefined || (pageNumber > 1 && (!visible || pageNumber > page.pageCount));
  if (state === "open" && settings.protection === "turnstile" && settings.turnstileSiteKey)
    headers.set("content-security-policy", turnstileCsp());
  return {
    ...base,
    state,
    page,
    protection: settings.protection,
    turnstileSiteKey: settings.turnstileSiteKey,
    allowWithoutScript: withoutScriptAllowed(settings),
    notFound,
  };
}
