/**
 * The click-to-load video player (RFC-0015 §4): a small first-party module under `/_cloudhal/`,
 * so the site's `script-src 'self'` stays as it is. An `embed` block renders a link card to the
 * video; with this module, following the link swaps the card for the player's iframe, and only
 * then does the reader's browser contact the video host (YouTube's no-cookie domain or Vimeo's
 * player, with Do Not Track). Without JavaScript the link still opens the video page.
 *
 * Worker-safe: the code is a constant, written as a static asset by the build (`integration.ts`)
 * and served from memory by `cloudhal dev` (`embed-middleware.ts`). The file name carries a
 * version (`/_cloudhal/*` is cached as immutable): bump it with any change to the code; a test
 * pins the code's hash to the version.
 */

/** The only hosts an `embed` player may load from (also the CSP `frame-src`). */
export const EMBED_FRAME_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
] as const;

const code = `const ok=/^https:\\/\\/(www\\.youtube-nocookie\\.com\\/embed\\/[A-Za-z0-9_-]{11}|player\\.vimeo\\.com\\/video\\/[0-9]{1,12})(\\?[^"<>]*)?$/;
document.addEventListener("click",(e)=>{
const link=e.target instanceof Element?e.target.closest(".ch-embed__link"):null;
const fig=link&&link.closest("figure[data-embed-src]");
const src=fig&&fig.getAttribute("data-embed-src");
if(!src||!ok.test(src)||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
e.preventDefault();
const f=document.createElement("iframe");
f.src=src+(src.includes("?")?"&":"?")+"autoplay=1";
f.title=fig.getAttribute("data-embed-title")||"";
f.allow="autoplay; encrypted-media; picture-in-picture; fullscreen";
f.allowFullscreen=true;
f.referrerPolicy="strict-origin-when-cross-origin";
f.className="ch-embed__frame";
link.replaceWith(f);
f.focus();
});
`;

export const EMBED_SCRIPT = { path: "/_cloudhal/embed.1.js", code } as const;

/**
 * The player's address for a video page, or `undefined`: YouTube (`watch?v=`, `youtu.be/`,
 * `shorts/`, `embed/`, any youtube or youtube-nocookie host) and Vimeo (`vimeo.com/<id>`,
 * `player.vimeo.com/video/<id>`).
 */
export function embedPlayerSrc(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const youtube = (id: string | null | undefined) =>
    id && /^[A-Za-z0-9_-]{11}$/.test(id)
      ? `https://www.youtube-nocookie.com/embed/${id}`
      : undefined;
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    if (parts[0] === "watch") return youtube(u.searchParams.get("v"));
    if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live")
      return youtube(parts[1]);
    return undefined;
  }
  if (host === "youtu.be") return youtube(parts[0]);
  const vimeo = (id: string | undefined) =>
    id && /^[0-9]{1,12}$/.test(id) ? `https://player.vimeo.com/video/${id}?dnt=1` : undefined;
  if (host === "vimeo.com") return vimeo(parts.at(-1));
  if (host === "player.vimeo.com" && parts[0] === "video") return vimeo(parts[1]);
  return undefined;
}

/** A page's CSP with the video players allowed in frames (kept as is when already there). */
export function withEmbedFrames(csp: string): string {
  const missing = EMBED_FRAME_ORIGINS.filter((o) => !csp.includes(o));
  if (!missing.length) return csp;
  if (/(^|;\s*)frame-src /.test(csp))
    return csp.replace(/((?:^|;\s*)frame-src [^;]*)/, `$1 ${missing.join(" ")}`);
  return csp.replace("object-src", `frame-src ${missing.join(" ")}; object-src`);
}

/** Response header a page sets when it shows a player (the Site Worker widens the CSP, then drops it). */
export const EMBED_HEADER = "x-cloudhal-embeds";

/** Whether markdown or sections may show a video player (a cheap, generous check). */
export function usesEmbeds(content: {
  markdown?: string | undefined;
  sections?: readonly { kind: string; type?: string; format?: string; body?: string }[] | undefined;
}): boolean {
  const md = (s: string | undefined) => !!s && /(^|\n)\s*(?:>\s*)*::embed\b/.test(s);
  if (md(content.markdown)) return true;
  return (content.sections ?? []).some(
    (s) =>
      (s.kind === "component" && s.type === "embed") ||
      (s.kind === "richText" && s.format === "markdown" && md(s.body)),
  );
}
