import type { AstroIntegration } from "astro";

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
}

const VIRTUAL_ID = "virtual:cloudhal/config";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

export function cloudhal(config: CloudhalRendererConfig): AstroIntegration {
  let resolved: CloudhalRendererConfig = config;
  return {
    name: "@cloudhal/astro-renderer",
    hooks: {
      "astro:config:setup": ({ updateConfig, config: astroConfig }) => {
        const root = astroConfig.root.pathname;
        resolved = {
          ...config,
          dataDir: config.dataDir.startsWith("/") ? config.dataDir : `${root}${config.dataDir}`,
        };
        const cloudflare = config.target === "cloudflare";
        updateConfig({
          vite: {
            plugins: [
              {
                name: "cloudhal-config",
                resolveId: (id: string) => (id === VIRTUAL_ID ? RESOLVED_ID : undefined),
                load: (id: string) =>
                  id === RESOLVED_ID ? `export default ${JSON.stringify(resolved)};` : undefined,
              },
            ],
            // Native module must stay external in Node SSR; workerd never loads it.
            ...(cloudflare ? {} : { ssr: { external: ["better-sqlite3"] } }),
          },
        });
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
