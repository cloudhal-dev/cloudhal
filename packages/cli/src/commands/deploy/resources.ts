/** Cloudflare resources a deploy needs (D1, R2, KV, the bundle lifecycle rule), the health wait and the cache purge. */

import { BUNDLE_PREFIX } from "@cloudhal/core-ts";
import type { workerNames } from "../../cloudflare/config.ts";
import type { WranglerRunner } from "../../cloudflare/wrangler.ts";
import type { Jurisdiction } from "./state.ts";

export async function ensureResources(
  run: WranglerRunner,
  {
    cwd,
    names,
    log,
    where,
    databaseId: known,
  }: {
    cwd: string;
    names: ReturnType<typeof workerNames>;
    log: (l: string) => void;
    /** Asked only when the database is created: where it lives. */
    where: () => Promise<Jurisdiction>;
    /** A database already provisioned (Workers Builds): no D1 call at all. */
    databaseId?: string;
  },
): Promise<{ databaseId: string; created?: Jurisdiction }> {
  const info = async () => {
    const r = await run(["d1", "info", names.database, "--json"], { cwd, quiet: true });
    if (r.code !== 0) return undefined;
    try {
      return (JSON.parse(r.stdout) as { uuid?: string }).uuid;
    } catch {
      return undefined;
    }
  };
  let databaseId = known ?? (await info());
  let made: Jurisdiction | undefined;
  if (!databaseId) {
    made = await where();
    log(
      made === "eu"
        ? `creating D1 database ${names.database} in the EU jurisdiction (this cannot be changed later)`
        : `creating D1 database ${names.database}`,
    );
    const created = await run(
      ["d1", "create", names.database, ...(made === "eu" ? ["--jurisdiction", "eu"] : [])],
      { cwd },
    );
    // A failed `d1 info` (e.g. a transient API error) must not stop a redeploy: the database is
    // already there, so read its id again.
    if (created.code !== 0 && !/already exists/i.test(created.stderr + created.stdout))
      throw new Error(
        `wrangler d1 create ${names.database} failed:\n${created.stderr.slice(-2000)}`,
      );
    databaseId = await info();
    if (!databaseId) throw new Error(`could not read the id of D1 database ${names.database}`);
  }
  const bucket = await run(["r2", "bucket", "create", names.bucket], { cwd });
  if (bucket.code !== 0 && !/already exists|already own/i.test(bucket.stderr + bucket.stdout))
    throw new Error(`could not create R2 bucket ${names.bucket}:\n${bucket.stderr.slice(-2000)}`);
  await ensureBundleLifecycle(run, cwd, names.bucket, log);
  // RFC-0029 §3: the bucket the AI Search instance reads (the instance itself is made by hand).
  if (names.searchBucket) {
    const search = await run(["r2", "bucket", "create", names.searchBucket], { cwd });
    if (search.code !== 0 && !/already exists|already own/i.test(search.stderr + search.stdout))
      throw new Error(
        `could not create R2 bucket ${names.searchBucket}:\n${search.stderr.slice(-2000)}`,
      );
  }
  return { databaseId, ...(made ? { created: made } : {}) };
}

/** The R2 lifecycle rule that expires snapshot bundles (RFC-0010 "Retention"). */
export const BUNDLE_LIFECYCLE_RULE = "cloudhal-bundles";
export const BUNDLE_LIFECYCLE_DAYS = 30;

/**
 * Expires `bundles/` after 30 days, once per bucket. Bundles are a cache the site Worker rewrites
 * when one is missing, so a rule that cannot be read or set is a warning, never a failed deploy.
 * `lifecycle add` appends without checking names, hence the list first.
 */
export async function ensureBundleLifecycle(
  run: WranglerRunner,
  cwd: string,
  bucket: string,
  log: (l: string) => void,
): Promise<void> {
  const warn = (why: string) =>
    log(
      `could not set the R2 lifecycle rule for ${BUNDLE_PREFIX} (${why}); snapshot bundles stay until deleted. Add it with \`wrangler r2 bucket lifecycle add ${bucket} ${BUNDLE_LIFECYCLE_RULE} ${BUNDLE_PREFIX} --expire-days ${BUNDLE_LIFECYCLE_DAYS}\``,
    );
  const rule = new RegExp(`\\b${BUNDLE_LIFECYCLE_RULE}\\b`);
  const listed = await run(["r2", "bucket", "lifecycle", "list", bucket], { cwd, quiet: true });
  if (listed.code !== 0) return warn("listing the rules failed");
  if (rule.test(listed.stdout)) return;
  const added = await run(
    [
      "r2",
      "bucket",
      "lifecycle",
      "add",
      bucket,
      BUNDLE_LIFECYCLE_RULE,
      BUNDLE_PREFIX,
      "--expire-days",
      String(BUNDLE_LIFECYCLE_DAYS),
      "--force",
    ],
    { cwd, quiet: true },
  );
  if (added.code !== 0) return warn(added.stderr.trim().split("\n").at(-1) || "wrangler failed");
  log(`R2: snapshot bundles under ${BUNDLE_PREFIX} expire after ${BUNDLE_LIFECYCLE_DAYS} days`);
}

export async function waitForHealth(
  adminUrl: string,
  f: typeof fetch,
  log: (line: string) => void,
  timeoutMs: number,
): Promise<void> {
  const url = new URL("/api/health", adminUrl);
  const deadline = Date.now() + timeoutMs;
  let announced = false;
  for (;;) {
    try {
      const res = await f(url);
      if (res.ok) return;
    } catch {
      // DNS/TLS not ready yet
    }
    if (Date.now() > deadline)
      throw new Error(
        `${adminUrl} did not answer within ${Math.round(timeoutMs / 1000)}s; run \`cloudhal push\` once it is up`,
      );
    if (!announced) {
      log(`waiting for ${new URL(adminUrl).hostname} to come online…`);
      announced = true;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

/** Purges the site Worker's whole cache once (the script tag lives in cached HTML). */
export async function purgeSite(
  siteUrl: string,
  token: string,
  f: typeof fetch,
  log: (line: string) => void,
): Promise<boolean> {
  try {
    const res = await f(new URL("/__cloudhal/purge", siteUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) return true;
    log(`could not purge the site cache (${res.status}); pages pick up the change as they expire`);
  } catch (e) {
    log(`could not purge the site cache: ${e instanceof Error ? e.message : String(e)}`);
  }
  return false;
}
