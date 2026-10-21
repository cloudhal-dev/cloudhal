/**
 * Hosts that only redirect (#49): `www.example.com` → `https://example.com`, 301, path and query
 * kept. `cloudhal deploy` routes them to the site Worker as Custom Domains (so they get a DNS
 * record and certificate) and names them in `CLOUDHAL_REDIRECT_HOSTS`, the target in
 * `CLOUDHAL_REDIRECT_TO`. Runs first, before any site is picked.
 *
 * Worker-safe: no imports.
 */
export interface RedirectEnv {
  /** Comma- or space-separated hostnames that answer with a redirect. */
  readonly CLOUDHAL_REDIRECT_HOSTS?: string;
  /** The hostname they redirect to (the site's custom domain). */
  readonly CLOUDHAL_REDIRECT_TO?: string;
}

/** The 301 for a request on a redirect-only host, or undefined. */
export function hostRedirect(request: Request, env: RedirectEnv): Response | undefined {
  const to = env.CLOUDHAL_REDIRECT_TO?.trim().toLowerCase();
  if (!to || !env.CLOUDHAL_REDIRECT_HOSTS) return undefined;
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === to) return undefined;
  const hosts = env.CLOUDHAL_REDIRECT_HOSTS.toLowerCase().split(/[\s,]+/);
  if (!hosts.includes(host)) return undefined;
  return new Response(null, {
    status: 301,
    headers: {
      location: `https://${to}${url.pathname}${url.search}`,
      "cache-control": "public, max-age=86400",
      // Never in the edge cache (#62): it is shared with the hosts this one redirects to.
      "cloudflare-cdn-cache-control": "no-store",
    },
  });
}
