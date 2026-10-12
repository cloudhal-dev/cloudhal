/**
 * Builds the comments module and its proof-of-work worker (RFC-0007 §7.3, §8.2) from
 * `@cloudhal/comments/client` with Vite, at integration time: the worker first, so its hashed URL
 * can be baked into the module. Both are minified ES modules named by the first 8 hex characters of
 * their SHA-256 (`/_cloudhal/c.<hash>.js`, `/_cloudhal/cw.<hash>.js`), so the static-assets layer
 * can serve them as immutable. Node only (build time).
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENT_DIR, COMMENTS_CLIENT_SOURCES, SOLVER_URL_DEFINE } from "@cloudhal/comments/client";
import { type AnalyticsClientFile, bundle } from "./analytics-client.ts";

export interface CommentsClient {
  /** The module the comments section loads (`/_cloudhal/c.<hash>.js`). */
  readonly module: AnalyticsClientFile;
  /** The dedicated worker that solves challenges (`/_cloudhal/cw.<hash>.js`). */
  readonly solver: AnalyticsClientFile;
}

function hashed(prefix: "c" | "cw", code: string): AnalyticsClientFile {
  const hash = createHash("sha256").update(code).digest("hex").slice(0, 8);
  return { path: `${CLIENT_DIR}${prefix}.${hash}.js`, code };
}

/** Writes both files under `dir` (a URL or path of the site's static-assets directory). */
export async function writeCommentsClient(
  client: CommentsClient,
  dir: URL | string,
): Promise<void> {
  const root = typeof dir === "string" ? dir : fileURLToPath(dir.href);
  for (const file of [client.module, client.solver]) {
    const target = path.join(root, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.code);
  }
}

let built: Promise<CommentsClient> | undefined;

/** Builds both files once per process (they depend only on the package sources). */
export function buildCommentsClient(): Promise<CommentsClient> {
  built ??= (async () => {
    const solver = hashed("cw", await bundle(COMMENTS_CLIENT_SOURCES.solver));
    const module = hashed(
      "c",
      await bundle(COMMENTS_CLIENT_SOURCES.module, {
        [SOLVER_URL_DEFINE]: JSON.stringify(solver.path),
      }),
    );
    return { module, solver };
  })();
  built.catch(() => {
    built = undefined;
  });
  return built;
}
