/**
 * RFC-0047 §3, §5: the store, ready before workerd starts. The bucket is created when missing (a
 * cluster cannot start without it), waiting while the store itself starts; then the rule that
 * aborts incomplete multipart uploads is set on a bucket without lifecycle rules. Both need static
 * credentials (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`); with a credentials file they are left
 * to the operator. `CLOUDHAL_S3_CREATE_BUCKET=off` and `CLOUDHAL_S3_LIFECYCLE=off` skip each.
 */
import { ensureBucket, ensureLifecycle, type S3Target } from "./s3.ts";
import type { Env, SelfhostSettings } from "./settings.ts";

const off = (v: string | undefined) => /^(0|off|false|no)$/i.test((v ?? "").trim());

export function storeTarget(s: SelfhostSettings, env: Env): S3Target | undefined {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) return undefined;
  return {
    endpoint: s.s3.endpoint,
    bucket: s.s3.bucket,
    region: s.s3.region,
    key: env.AWS_ACCESS_KEY_ID,
    secret: env.AWS_SECRET_ACCESS_KEY,
    sessionToken: env.AWS_SESSION_TOKEN,
  };
}

export async function prepareStore(
  s: SelfhostSettings,
  env: Env,
  log: (line: string) => void,
  o: { attempts?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const target = storeTarget(s, env);
  if (!target) return;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  if (!off(env.CLOUDHAL_S3_CREATE_BUCKET)) {
    const attempts = o.attempts ?? 60;
    for (let i = 1; ; i++) {
      try {
        if ((await ensureBucket(target)) === "created")
          log(`selfhost: created the bucket ${target.bucket}`);
        break;
      } catch (e) {
        if (i >= attempts)
          throw new Error(
            `selfhost: the store at ${target.endpoint} is not ready (${(e as Error).message})`,
          );
        await sleep(2000);
      }
    }
  }
  if (off(env.CLOUDHAL_S3_LIFECYCLE)) return;
  const r = await ensureLifecycle(target).catch(() => "unsupported" as const);
  if (r === "set") log("selfhost: the bucket now aborts incomplete multipart uploads after a day");
  if (r === "unsupported")
    log(
      "selfhost: could not set the bucket's lifecycle rule for incomplete multipart uploads; set one in the store (docs/guides/self-host.md, The store)",
    );
}
