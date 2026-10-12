/**
 * The site's Content-Security-Policy (set by the Cloudflare Site Worker entry on HTML responses
 * that do not carry their own).
 *
 * Defence in depth for content written by agents: no inline or third-party scripts, no plugins,
 * no foreign framing. The only client scripts a site ships of its own are Cloudhal's first-party
 * scripts under `/_cloudhal/` (hashed, self-hosted, each switchable off): the analytics script
 * (RFC-0006) and, on pages with an open comment form, the comments module and its proof-of-work
 * worker (RFC-0007) — `worker-src` falls back to `script-src 'self'`. They load from 'self' and
 * post to 'self', as Astro islands do.
 */
export const SITE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";

/** Cloudflare Turnstile's origin (RFC-0007 §7.6). */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * The policy of a page that renders an **open** comment form on a site that opted into Turnstile
 * (RFC-0007 §7.6): Turnstile's script and frame are allowed on that page only; every other page
 * keeps `SITE_CSP` (the entry keeps a policy a route set).
 */
export function turnstileCsp(): string {
  return SITE_CSP.replace("script-src 'self'", `script-src 'self' ${TURNSTILE_ORIGIN}`).replace(
    "object-src 'none'",
    `frame-src ${TURNSTILE_ORIGIN}; object-src 'none'`,
  );
}
