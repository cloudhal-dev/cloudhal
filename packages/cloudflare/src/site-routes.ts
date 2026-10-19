/**
 * RFC-0034 §4: which site Worker serves a site. The installation's own site Worker is the `SITE`
 * service binding; Workers attached later (another theme) are bound as `SITE_1`, `SITE_2`, … and
 * `CLOUDHAL_SITE_ROUTES` (JSON `{siteId: binding}`, written by `cloudhal deploy`) says which site
 * each one serves. A site with no route goes to `SITE`.
 *
 * Every purge the admin Worker sends names its site in the JSON body, so `routedSite` can wrap
 * the whole purge path: it reads the body's `siteId` and forwards to that site's Worker.
 */

/** The bindings and the route table on the admin Worker's env. */
export interface SiteRoutesEnv {
  SITE?: Fetcher;
  CLOUDHAL_SITE_ROUTES?: string;
}

function routesOf(env: SiteRoutesEnv): Record<string, string> {
  try {
    const parsed = JSON.parse(env.CLOUDHAL_SITE_ROUTES ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

const isFetcher = (v: unknown): v is Fetcher =>
  typeof v === "object" && v !== null && typeof (v as Fetcher).fetch === "function";

/** The Worker that serves `siteId`: its own binding when one is routed, else `SITE`. */
export function bindingFor(env: SiteRoutesEnv, siteId: string | undefined): Fetcher | undefined {
  const name = siteId ? routesOf(env)[siteId] : undefined;
  const bound = name ? (env as unknown as Record<string, unknown>)[name] : undefined;
  return isFetcher(bound) ? bound : env.SITE;
}

/** True when `siteId` is served by an attached Worker (not the installation's own). */
export function attachedSite(env: SiteRoutesEnv, siteId: string): boolean {
  return routesOf(env)[siteId] !== undefined;
}

/**
 * A `Fetcher` for purges: each request goes to the Worker of the `siteId` in its JSON body (`SITE`
 * without one). Undefined when the admin Worker has no site Worker at all.
 */
export function routedSite(env: SiteRoutesEnv): Fetcher | undefined {
  if (!env.SITE && Object.keys(routesOf(env)).length === 0) return undefined;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let siteId: string | undefined;
    if (typeof init?.body === "string")
      try {
        const id = (JSON.parse(init.body) as { siteId?: unknown }).siteId;
        siteId = typeof id === "string" ? id : undefined;
      } catch {
        // not JSON: the installation's own Worker
      }
    const target = bindingFor(env, siteId);
    if (!target) return new Response("no site Worker for this site", { status: 503 });
    return target.fetch(input as never, init as never) as unknown as Promise<Response>;
  };
  return { fetch } as unknown as Fetcher;
}
