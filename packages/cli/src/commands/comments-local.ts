/**
 * Reader comments for `cloudhal studio` and `cloudhal mcp` (RFC-0007 §15.2): the project's SQLite
 * store, and the keys from `CLOUDHAL_COMMENTS_KEY` or the data directory's `comments.key` (which
 * `cloudhal dev` creates on the first comment request). Without a key the queue, moderation and
 * MCP tools still work; commenter emails and stored secrets answer 503 until there is one.
 * Purges need no queue flush locally: there is no edge cache.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { deriveCommentKeys, MIN_SECRET_LENGTH } from "@cloudhal/comments";
import { SqlCommentStore } from "@cloudhal/comments/sql";
import type { SqlDriver } from "@cloudhal/storage";

const usable = (k: unknown): k is string => typeof k === "string" && k.length >= MIN_SECRET_LENGTH;

export async function localComments(
  sql: SqlDriver,
  dataDir: string,
  env: Record<string, string | undefined> = process.env,
) {
  let secret = env.CLOUDHAL_COMMENTS_KEY;
  if (!usable(secret)) {
    try {
      secret = (await readFile(path.join(dataDir, "comments.key"), "utf8")).trim();
    } catch {
      secret = undefined;
    }
  }
  return {
    store: new SqlCommentStore(sql),
    ...(usable(secret) ? { keys: await deriveCommentKeys(secret) } : {}),
  };
}
