/** Page URLs to the Markdown copies the post-build step writes (`<id>.md`, `index.md` for `/`). */

const HOSTS = new Set(["cloudhal.dev", "www.cloudhal.dev"]);
const ID = /^[a-z0-9][a-z0-9._/-]*$/;

/**
 * A page id from a cloudhal.dev URL or a site path: `https://cloudhal.dev/docs/agents.md#x`,
 * `/docs/agents/` and `docs/agents` all give `docs/agents`; `/` gives `index`. Anything on another
 * host, or not a plain page path, gives `undefined`. `selfHost` also accepts the Worker's own host
 * (`localhost` under `wrangler dev`).
 */
export function pageId(input: string, selfHost?: string): string | undefined {
  let value = input.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) {
    let url: URL;
    try {
      url = new URL(value.startsWith("//") ? `https:${value}` : value);
    } catch {
      return undefined;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (!HOSTS.has(url.hostname) && url.host !== selfHost) return undefined;
    value = url.pathname;
  }
  const path = value
    .replace(/[?#].*$/, "")
    .replace(/^\/+/, "")
    .replace(/(^|\/)index\.md$/, "")
    .replace(/\.md$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  if (path === "" || path === "index") return "index";
  if (!ID.test(path) || path.split("/").some((s) => s === "." || s === "..")) return undefined;
  return path;
}

export const markdownPath = (id: string) => (id === "index" ? "/index.md" : `/${id}.md`);

/** A path that may be a page: no file extension in its last segment. */
export const isPagePath = (pathname: string) => !/\.[^/]*$/.test(pathname);
