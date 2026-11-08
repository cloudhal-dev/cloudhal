/**
 * What the Site Worker entry and the dev middleware need around `statusPage` (RFC-0043 §1.4,
 * §1.6, §1.8): which paths get a page rather than the theme's own answer, the page's locale from
 * the request's host or path prefix, and the site data each state may show. Worker-safe.
 */
import type { Site } from "@cloudhal/core-contracts";
import { isCommentsPath } from "./comments.ts";
import { localeRequest } from "./locales.ts";
import { matchMediaRoute } from "./media-route.ts";
import type { SiteState, StatusPageInput, StatusTheme } from "./status-page.ts";

/** Feeds, sitemaps, `llms.txt`, search JSON, manifests: machines read these (§2.3). */
export const MACHINE_PATH = /\.(?:xml|txt|json|rss|atom|webmanifest)$/i;

/**
 * True for a path that gets the status page before the first publish (§2.3): everything a
 * person opens in a browser. `robots.txt`, media, static assets, `/.well-known/`, the
 * operator endpoints, comment endpoints and machine paths keep their own answers.
 */
export function isStatusPagePath(pathname: string): boolean {
  return !keepsOwnAnswer(pathname) && !MACHINE_PATH.test(pathname);
}

/** `robots.txt`, media, static assets, `/.well-known/`, operator and comment endpoints. */
function keepsOwnAnswer(pathname: string): boolean {
  return (
    pathname === "/robots.txt" ||
    matchMediaRoute(pathname) !== undefined ||
    /^\/(?:_astro|_cloudhal|__cloudhal|\.well-known)\//.test(pathname) ||
    isCommentsPath(pathname)
  );
}

/**
 * How the entry's state step treats a path (§2.3, §2.5): `page` gets the status page, `machine`
 * (feeds, sitemaps, `llms.txt`, search JSON) a short plain or JSON answer where the state calls
 * for one, `undefined` keeps its own answer.
 */
export function statusPathKind(pathname: string): "page" | "machine" | undefined {
  if (keepsOwnAnswer(pathname)) return undefined;
  return MACHINE_PATH.test(pathname) ? "machine" : "page";
}

/**
 * Decision 12: a response served despite a preview token that did not verify (media, and paths
 * the state step leaves to the theme) is kept out of the edge cache and says only that the link
 * is invalid; why it failed (expired, signature, another site, previews off) is never echoed.
 */
export function markInvalidPreview(headers: Headers): void {
  headers.set("cloudflare-cdn-cache-control", "no-store");
  headers.set("x-cloudhal-preview-error", "invalid");
}

/** What choosing the locale needs of a site (`localeRequest` reads nothing else). */
export interface LocaleSite {
  readonly locales: readonly string[];
  readonly defaultLocale: string;
  readonly localization?: Site["localization"] | undefined;
}

/** The path without trailing slashes (`/` for the root), in one linear pass: request text. */
export function trimTrailingSlashes(pathname: string): string {
  let end = pathname.length;
  while (end > 0 && pathname.charCodeAt(end - 1) === 47) end--;
  return end === 0 ? "/" : pathname.slice(0, end);
}

/** §1.4: the locale of the request's host or path prefix when it is the site's, else the default. */
export function statusLocale(site: LocaleSite, host: string, pathname: string): string {
  const path = trimTrailingSlashes(pathname);
  try {
    return localeRequest(site as Site, host, path).locale;
  } catch {
    return site.defaultLocale || "en";
  }
}

const HEX = /^#[0-9a-f]{6}$/i;
const FONTS: Record<string, StatusTheme["font"]> = {
  editorial: "serif",
  classic: "serif",
  technical: "mono",
  system: "sans",
  modern: "sans",
  humanist: "sans",
};

/**
 * §1.3: the site's look as the status page may use it — `brand` (else `seed`), `surface` and
 * `text` when they are `#rrggbb`, and the `typePairing` choice as a system font stack. Read from
 * the published snapshot's site node only; everything else in `theme.config` is ignored.
 */
export function statusTheme(site: Pick<Site, "theme">): StatusTheme | undefined {
  const config = (site.theme.config ?? {}) as Record<string, unknown>;
  const color = (key: string) => {
    const v = config[key];
    return typeof v === "string" && HEX.test(v) ? v.toLowerCase() : undefined;
  };
  const pairing = config.typePairing;
  const theme: StatusTheme = {
    brand: color("brand") ?? color("seed"),
    surface: color("surface"),
    text: color("text"),
    font: typeof pairing === "string" ? FONTS[pairing] : undefined,
  };
  return Object.values(theme).some((v) => v !== undefined) ? theme : undefined;
}

/** The site's logo when it is a same-origin media URL (§1.6). */
export function statusLogo(site: Pick<Site, "brand">): string | undefined {
  const src = site.brand?.logo?.src;
  return src?.startsWith("/media/") ? src : undefined;
}

/**
 * §1.6: the site data a state may show. `live` is the site node as it is now (the name only);
 * `published` the published snapshot's, which also brings the logo and the theme tokens.
 */
export function statusInput(
  state: SiteState,
  sites: { live?: Site | undefined; published?: Site | undefined },
  request: { host: string; pathname: string },
  now: number,
): StatusPageInput {
  const site = sites.published ?? sites.live;
  const locale = site ? statusLocale(site, request.host, request.pathname) : "en";
  if (state === "unavailable" || !site) return { locale, now };
  // `error`: the name of a site this request already read, nothing else (§1.6).
  if (state === "error") return { locale, now, site: { name: site.name } };
  const showsBrand = sites.published !== undefined && state !== "not-published";
  return {
    locale,
    now,
    site: {
      name: site.name,
      ...(showsBrand && sites.published ? { logo: statusLogo(sites.published) } : {}),
    },
    ...(showsBrand && sites.published ? { theme: statusTheme(sites.published) } : {}),
  };
}
