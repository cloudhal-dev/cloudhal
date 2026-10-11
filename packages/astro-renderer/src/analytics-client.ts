/**
 * Builds the two analytics scripts (RFC-0006 §5.1) from `@cloudhal/analytics/client` with Vite
 * (Astro's own bundler), at integration time: the vitals module first, so its hashed URL can be
 * baked into the page-view script, then the page-view script. Both are minified ES modules named
 * by the first 8 hex characters of their SHA-256 (`/_cloudhal/p.<hash>.js`, `/_cloudhal/v.<hash>.js`),
 * so the static-assets layer can serve them as immutable. Node only (build time).
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENT_DIR, CLIENT_SOURCES, VITALS_URL_DEFINE } from "@cloudhal/analytics/client";

export interface AnalyticsClientFile {
  /** URL path, e.g. `/_cloudhal/p.4f9a1c2e.js`. */
  readonly path: string;
  readonly code: string;
}

export interface AnalyticsClient {
  /** The page-view script (the one the tag loads). */
  readonly script: AnalyticsClientFile;
  /** The sampled vitals module the script imports. */
  readonly vitals: AnalyticsClientFile;
}

function hashed(prefix: "p" | "v", code: string): AnalyticsClientFile {
  const hash = createHash("sha256").update(code).digest("hex").slice(0, 8);
  return { path: `${CLIENT_DIR}${prefix}.${hash}.js`, code };
}

async function bundle(entry: string, define: Record<string, string> = {}): Promise<string> {
  const { build, minify } = await import("vite");
  const result = await build({
    configFile: false,
    envFile: false,
    logLevel: "silent",
    root: path.dirname(entry),
    publicDir: false,
    define,
    build: {
      write: false,
      minify: true,
      target: "es2020",
      copyPublicDir: false,
      reportCompressedSize: false,
      // Library mode: no module-preload helper around the dynamic import, exports kept.
      lib: { entry, formats: ["es"], fileName: "entry" },
      rolldownOptions: {
        // the vitals module is loaded by URL at run time, never bundled into the page-view script
        external: [/^\/_cloudhal\//],
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]) as {
    output?: { type: string; code?: string; isEntry?: boolean }[];
  }[];
  const chunks = outputs.flatMap((o) => o.output ?? []).filter((c) => c.type === "chunk");
  if (chunks.length !== 1 || typeof chunks[0]?.code !== "string")
    throw new Error(`analytics script ${path.basename(entry)} must build to exactly one chunk`);
  // Library mode keeps whitespace in ES output (to keep pure annotations); the scripts are final
  // and tiny, so they are minified once more as whole modules.
  return (await minify("entry.mjs", chunks[0].code)).code;
}

/** Writes both scripts under `dir` (a URL or path of the site's static-assets directory). */
export async function writeAnalyticsClient(
  client: AnalyticsClient,
  dir: URL | string,
): Promise<void> {
  const root = typeof dir === "string" ? dir : fileURLToPath(dir.href);
  for (const file of [client.script, client.vitals]) {
    const target = path.join(root, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.code);
  }
}

let built: Promise<AnalyticsClient> | undefined;

/** Builds both scripts once per process (they depend only on the package sources). */
export function buildAnalyticsClient(): Promise<AnalyticsClient> {
  built ??= (async () => {
    const vitals = hashed("v", await bundle(CLIENT_SOURCES.vitals));
    const script = hashed(
      "p",
      await bundle(CLIENT_SOURCES.pageview, { [VITALS_URL_DEFINE]: JSON.stringify(vitals.path) }),
    );
    return { script, vitals };
  })();
  built.catch(() => {
    built = undefined;
  });
  return built;
}
