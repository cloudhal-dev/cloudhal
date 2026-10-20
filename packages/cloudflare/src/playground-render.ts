/**
 * A playground session's rendered site (RFC-0036 §4): private to the session, never cached or
 * tagged at the edge, `noindex`, and its links kept under `/s/<session>/`.
 */

/** Paths the Worker serves itself (static files, media, the API), never under the session prefix. */
const UNPREFIXED = /^\/(?:media|_astro|_cloudhal|assets|api|_playground)(?:\/|$)/;

/** `/about/` → `/s/<id>/about/`; other origins, fragments and Worker paths stay as they are. */
export function prefixPath(href: string, prefix: string): string {
  if (!href.startsWith("/") || href.startsWith("//") || UNPREFIXED.test(href)) return href;
  if (href === prefix || href.startsWith(`${prefix}/`)) return href;
  return `${prefix}${href}`;
}

export function privateSiteResponse(response: Response, prefix: string): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  headers.set("cloudflare-cdn-cache-control", "no-store");
  headers.set("x-robots-tag", "noindex");
  headers.delete("cache-tag");
  const location = headers.get("location");
  if (location) headers.set("location", prefixPath(location, prefix));
  const out = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  const html = headers.get("content-type")?.includes("text/html");
  const Rewriter = (globalThis as { HTMLRewriter?: typeof HTMLRewriter }).HTMLRewriter;
  if (!html || !Rewriter) return out;
  const rewrite = (attr: string) => ({
    element(el: Element) {
      const v = el.getAttribute(attr);
      if (v) el.setAttribute(attr, prefixPath(v, prefix));
    },
  });
  return new Rewriter()
    .on("a[href]", rewrite("href"))
    .on("form[action]", rewrite("action"))
    .transform(out);
}
