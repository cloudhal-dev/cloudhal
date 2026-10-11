import type { AstroIntegration } from "astro";
import type { AnalyticsClient } from "./analytics-client.ts";

/** Options for the `cloudhal()` integration; made available to pages via `virtual:cloudhal/config`. */
export interface CloudhalRendererConfig {
  /** Directory holding `data.db` and `blobs/` (absolute or relative to the Astro project root). */
  readonly dataDir: string;
  readonly siteId: string;
  /**
   * `live` reads current nodes on every request (dev); `snapshot:<id>` renders a frozen snapshot
   * (build/production). `CLOUDHAL_SOURCE` in the environment overrides this.
   */
  readonly source?: "live" | `snapshot:${string}`;
  /**
   * `node` (default): `cloudhal dev` / static `cloudhal build` from the local store.
   * `cloudflare`: the deployed Site Worker — every page renders on demand from D1/R2 so publish and
   * rollback are pointer flips (needs the `@astrojs/cloudflare` adapter; see ADR-0012).
   */
  readonly target?: "node" | "cloudflare";
  /**
   * Media (RFC-0004 §7.5): `transform: "cdn-cgi"` emits responsive `srcset`s through Cloudflare
   * image transformations on the site's own zone. Opt-in (answer 13): it needs Transformations
   * enabled on a custom domain; the default `"none"` serves originals.
   */
  readonly media?: { readonly transform?: "cdn-cgi" | "none" };
  /**
   * Site analytics (RFC-0006) on **Node** targets: `cloudhal.json`'s `analytics` block. Without it,
   * `CLOUDHAL_ANALYTICS` / `CLOUDHAL_ANALYTICS_DEFAULTS` in the environment decide, as on the
   * Cloudflare Site Worker (where the Worker vars always decide and this is ignored). `dev: true`
   * records `cloudhal dev` traffic into the local SQLite store; by default `cloudhal dev` answers the
   * beacon endpoint and records nothing. Static builds never carry analytics (no endpoint).
   */
  readonly analytics?: {
    readonly enabled?: boolean;
    readonly uniqueVisitors?: boolean;
    readonly vitalsOneIn?: number;
    readonly dev?: boolean;
  };
  /** Set by the integration: URL of the built page-view script (`/_cloudhal/p.<hash>.js`). */
  readonly analyticsScript?: string;
}

const VIRTUAL_ID = "virtual:cloudhal/config";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
/** Dev only: the built analytics scripts, served from memory by the analytics middleware. */
const CLIENT_ID = "virtual:cloudhal/analytics-client";
const RESOLVED_CLIENT_ID = `\0${CLIENT_ID}`;

export function cloudhal(config: CloudhalRendererConfig): AstroIntegration {
  let resolved: CloudhalRendererConfig = config;
  let client: AnalyticsClient | undefined;
  return {
    name: "@cloudhal/astro-renderer",
    hooks: {
      "astro:config:setup": async ({
        updateConfig,
        addMiddleware,
        config: astroConfig,
        command,
      }) => {
        const root = astroConfig.root.pathname;
        resolved = {
          ...config,
          dataDir: config.dataDir.startsWith("/") ? config.dataDir : `${root}${config.dataDir}`,
        };
        const cloudflare = config.target === "cloudflare";
        // `cloudhal dev` answers the media route from the local blob store (RFC-0004 §7.8); the
        // Cloudflare Site Worker answers it in its entry, before Astro.
        if (!cloudflare)
          addMiddleware({ entrypoint: "@cloudhal/astro-renderer/media-middleware", order: "pre" });
        // Analytics (RFC-0006 §5.1, §11): the Site Worker build ships the two hashed scripts as
        // static assets and its entry injects the tag; `cloudhal dev` serves them and answers the
        // beacon from a middleware. Static builds have no endpoint, so no script at all.
        if ((cloudflare && command === "build") || (!cloudflare && command === "dev")) {
          const { buildAnalyticsClient } = await import("./analytics-client.ts");
          client = await buildAnalyticsClient();
          resolved = { ...resolved, analyticsScript: client.script.path };
        }
        if (!cloudflare && command === "dev")
          addMiddleware({
            entrypoint: "@cloudhal/astro-renderer/analytics-middleware",
            order: "pre",
          });
        updateConfig({
          vite: {
            plugins: [
              {
                name: "cloudhal-config",
                resolveId: (id: string) =>
                  id === VIRTUAL_ID
                    ? RESOLVED_ID
                    : id === CLIENT_ID
                      ? RESOLVED_CLIENT_ID
                      : undefined,
                load: (id: string) =>
                  id === RESOLVED_ID
                    ? `export default ${JSON.stringify(resolved)};`
                    : id === RESOLVED_CLIENT_ID
                      ? `export default ${JSON.stringify(cloudflare ? null : (client ?? null))};`
                      : undefined,
              },
            ],
            // Native module must stay external in Node SSR; workerd never loads it.
            ...(cloudflare ? {} : { ssr: { external: ["better-sqlite3"] } }),
          },
        });
      },
      /**
       * Static builds also get `_redirects` (real 301s on hosts that read it; the meta-refresh pages
       * stay as a fallback). The Cloudflare Site Worker answers redirects per request instead, so
       * they follow publishes without a rebuild.
       */
      "astro:build:done": async ({ dir, logger }) => {
        if (config.target === "cloudflare") {
          // the client directory: Workers static assets, served before the Worker runs (A6)
          if (client) {
            const { writeAnalyticsClient } = await import("./analytics-client.ts");
            await writeAnalyticsClient(client, dir);
            logger.info(`wrote ${client.script.path} and ${client.vitals.path}`);
          }
          return;
        }
        const { writeStaticRedirects } = await import("./static-redirects.ts");
        const count = await writeStaticRedirects(resolved, dir);
        if (count > 0) logger.info(`wrote _redirects (${count} redirects)`);
        const { writeStaticMedia } = await import("./static-media.ts");
        const media = await writeStaticMedia(resolved, dir);
        if (media > 0) logger.info(`copied ${media} media file(s) to /media`);
      },
      /** On Cloudflare every project page is rendered per request (pointer-flip publishing). */
      "astro:route:setup": ({ route }) => {
        if (config.target === "cloudflare" && route.component.startsWith("src/pages/"))
          route.prerender = false;
      },
      /**
       * Astro ≥6.3 caches `getStaticPaths()` results across dev requests, so pages added to the
       * graph would not get routes until a restart. Watch the data directory (SQLite writes go to
       * the WAL file, hence the directory, not just data.db) and clear the route cache the same way
       * Astro's content layer does: the `astro:content-changed` HMR event plus a full reload.
       */
      "astro:server:setup": ({ server }) => {
        const dir = resolved.dataDir.replace(/\/$/, "");
        server.watcher.add(dir);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const onChange = (file: string) => {
          if (!file.startsWith(dir)) return;
          clearTimeout(timer);
          timer = setTimeout(() => {
            for (const env of Object.values(server.environments)) {
              env.hot.send("astro:content-changed", {});
            }
            server.hot.send({ type: "full-reload" });
          }, 100);
        };
        server.watcher.on("change", onChange);
        server.watcher.on("add", onChange);
      },
    },
  };
}
