/**
 * The static output of `cloudhal build --published` for a site that cannot show its pages
 * (RFC-0043 §1.10): the status page as the whole build, written without an Astro run.
 *
 * - `index.html` and `404.html` are the built-in `not-published` document (`statusPageHtml`, in
 *   the site's default locale), so every route a static host falls back to shows it;
 * - `robots.txt` disallows everything;
 * - `_headers` sets the page's headers on `/*` for hosts that read it (Cloudflare static assets,
 *   Netlify): `no-store`, `noindex` and the status page's own CSP. Those hosts cannot send a 503;
 * - `.cloudhal-status` holds the state. A web server that can set a status turns it into one: the
 *   Docker image's Caddyfile answers every path but `robots.txt` with `index.html`, `503`,
 *   `Retry-After` and `no-store` while the marker exists (docs/guides/self-host.md).
 *
 * A theme's `statusPage` hook (§1.7) is not run here: it is theme code, which only an Astro build
 * loads, and the built-in page is what the hook falls back to anyway.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  retryAfter,
  type SiteState,
  STATUS_CSP,
  statusPageHtml,
} from "@cloudhal/astro-renderer/status-page";
import type { Site } from "@cloudhal/core-contracts";

/** The marker file a status build leaves at the root of its output; it holds the state. */
export const STATUS_MARKER = ".cloudhal-status";

/** The states a static build writes: `not-published` now, `maintenance` from RFC-0043 PR 3. */
export type StaticState = Extract<SiteState, "not-published">;

export interface StatusBuildOptions {
  readonly outDir: string;
  readonly state: StaticState;
  /** The live site node: its name and default locale (§1.6: no logo, no theme tokens). */
  readonly site: Pick<Site, "name" | "defaultLocale">;
  /** Injected clock (RFC-0008 §9.4). */
  readonly now: number;
}

/** What a static host should send with the page (§1.2), as a `_headers` file. */
export function statusHeadersFile(state: StaticState): string {
  return [
    "/*",
    "  Cache-Control: no-store",
    "  X-Robots-Tag: noindex",
    `  X-Cloudhal-State: ${state}`,
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: no-referrer",
    `  Content-Security-Policy: ${STATUS_CSP}`,
    "",
  ].join("\n");
}

/** `Retry-After` for the static state, which the web server sends with its 503 (§1.2). */
export const staticRetryAfter = (state: StaticState): string =>
  retryAfter(state, { now: 0 }) ?? "3600";

/**
 * Replaces `outDir` with the status output. The folder is removed first, as an Astro build
 * empties it: a link at `outDir` is removed as a link, never followed.
 */
export async function writeStatusBuild(options: StatusBuildOptions): Promise<string[]> {
  const { outDir, state, site } = options;
  const html = statusPageHtml(state, {
    site: { name: site.name },
    locale: site.defaultLocale || "en",
    now: options.now,
  });
  const files: Record<string, string> = {
    "index.html": html,
    "404.html": html,
    "robots.txt": "User-agent: *\nDisallow: /\n",
    _headers: statusHeadersFile(state),
    [STATUS_MARKER]: `${state}\n`,
  };
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(outDir, name), content);
  }
  return Object.keys(files);
}
