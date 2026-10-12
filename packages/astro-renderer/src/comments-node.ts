/**
 * Reader comments on Node (RFC-0007 §8.5, §15.2): what the `cloudhal()` integration's comments
 * middleware does for `cloudhal dev` (and, later, a Node self-host server). The same
 * `SiteComments` as the Site Worker, on the local SQLite store:
 *
 * - the three endpoints (`/__cloudhal/comments`, `/report`, `/challenge`), resolved against the
 *   **published** snapshot of the local store, with the socket address as the client address;
 * - `/_cloudhal/c.<hash>.js` and `/_cloudhal/cw.<hash>.js` from memory (the Site Worker build ships
 *   them as static assets instead).
 *
 * The comments key is `CLOUDHAL_COMMENTS_KEY` from the environment or, locally, a random key kept
 * in the data directory (`comments.key`, created on first use, never committed: the data directory
 * is ignored), so comments can be tried without any setup. There is no edge cache to purge.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes, toBase64Url } from "@cloudhal/comments";
import { SqlCommentStore } from "@cloudhal/comments/sql";
import type { Site } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { SiteComments, usableCommentsKey } from "./comments.ts";
import type { CommentsClient } from "./comments-client.ts";
import type { GraphSource } from "./source.ts";

export interface NodeCommentsBackend {
  readonly open: () => Promise<SqlDriver>;
  readonly site: () => Promise<Site | undefined>;
  readonly snapshot: (id: string) => Promise<GraphSource>;
}

export interface NodeCommentsOptions {
  readonly siteId: string;
  readonly backend: NodeCommentsBackend;
  /** The built module and worker (dev serves them from memory); `null` = comments unavailable. */
  readonly client: Pick<CommentsClient, "module" | "solver"> | null;
  /** The comments key (environment or the local key file). */
  readonly secret: () => Promise<string | undefined>;
  readonly now?: () => Date;
  readonly onError?: (message: string, error?: unknown) => void;
}

/** The local key file inside the data directory. */
export const LOCAL_KEY_FILE = "comments.key";

/**
 * `CLOUDHAL_COMMENTS_KEY` from the environment, else the data directory's own random key (created
 * once, 256 bits, owner-only).
 */
export async function localCommentsKey(
  dataDir: string,
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  if (usableCommentsKey(env.CLOUDHAL_COMMENTS_KEY)) return env.CLOUDHAL_COMMENTS_KEY;
  const file = path.join(dataDir, LOCAL_KEY_FILE);
  try {
    const stored = (await readFile(file, "utf8")).trim();
    if (usableCommentsKey(stored)) return stored;
  } catch {
    // no key yet
  }
  const key = toBase64Url(randomBytes(32));
  await writeFile(file, `${key}\n`, { mode: 0o600 });
  return key;
}

const JS = { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" };

/** A request handler around the page pipeline (`next`). */
export function createNodeComments(
  options: NodeCommentsOptions,
): (request: Request, next: () => Promise<Response>, clientAddress?: string) => Promise<Response> {
  let comments: Promise<SiteComments> | undefined;
  const get = () => {
    comments ??= (async () => {
      let store: SqlCommentStore | undefined;
      return new SiteComments({
        siteId: options.siteId,
        secret: await options.secret(),
        available: options.client !== null,
        store: async () => {
          store ??= new SqlCommentStore(await options.backend.open());
          return store;
        },
        site: options.backend.site,
        snapshot: options.backend.snapshot,
        // local servers answer on whatever host they are reached by
        acceptRequestHost: () => true,
        ...(options.now ? { now: options.now } : {}),
        ...(options.onError ? { onError: options.onError } : {}),
      });
    })();
    comments.catch(() => {
      comments = undefined;
    });
    return comments;
  };

  return async (request, next, clientAddress) => {
    const url = new URL(request.url);
    if (options.client) {
      for (const file of [options.client.module, options.client.solver])
        if (url.pathname === file.path)
          return new Response(request.method === "HEAD" ? null : file.code, { headers: JS });
    }
    if (url.pathname.startsWith("/__cloudhal/comments")) {
      const answer = await (await get()).handle(request, { clientAddress });
      if (answer) return answer;
    }
    return next();
  };
}
