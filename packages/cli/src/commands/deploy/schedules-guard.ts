/** RFC-0008: never deploy code that ignores holds and gates over open releases (the downgrade guard). */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { SCHEDULES_ENGINE_LEVEL } from "@cloudhal/core-ts/releases";
import type { DeployOptions } from "./options.ts";

/** The RFC's words when Cloudflare refuses the trigger (§16). */
export const CRON_REFUSED_MESSAGE =
  "Cloudflare refused the cron trigger: this account uses all its cron triggers (Workers Free allows 5). The scheduler runs on a Durable Object alarm instead.";

/**
 * The schedules level of the code this project deploys: `cloudhal.schedulesLevel` of the
 * `@cloudhal/core-ts` its admin Worker bundles (0 before RFC-0008), else the CLI's own.
 */
export async function projectSchedulesLevel(projectDir: string): Promise<number> {
  const require = createRequire(path.join(projectDir, "package.json"));
  const candidates: string[] = [];
  try {
    candidates.push(require.resolve("@cloudhal/core-ts/package.json"));
  } catch {
    // not a direct dependency of the project
  }
  try {
    const cf = require.resolve("@cloudhal/cloudflare/package.json");
    candidates.push(createRequire(cf).resolve("@cloudhal/core-ts/package.json"));
  } catch {
    // resolved through the CLI below
  }
  for (const file of candidates) {
    try {
      const pkg = JSON.parse(await readFile(file, "utf8")) as {
        cloudhal?: { schedulesLevel?: unknown };
      };
      const level = pkg.cloudhal?.schedulesLevel;
      return typeof level === "number" ? level : 0;
    } catch {
      // try the next
    }
  }
  return SCHEDULES_ENGINE_LEVEL;
}

export interface SchedulesStatus {
  engine?: { schedulesLevel?: number };
  sites?: { siteId: string; openReleases?: unknown[]; gatedNodes?: number }[];
}

/**
 * The downgrade guard (RFC-0008 Compatibility): older code ignores holds (an ordinary publish
 * would release held nodes) and older site Workers ignore gates. A deployment that answers no
 * schedules status predates schedules and has nothing to protect.
 */
export async function downgradeGuard(
  options: DeployOptions,
  adminUrl: string,
  token: string,
  log: (line: string) => void,
): Promise<void> {
  let status: SchedulesStatus;
  try {
    const res = await (options.fetch ?? fetch)(new URL("/api/admin/schedules/status", adminUrl), {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return;
    if (!res.ok) {
      log(
        `could not read the deployment's schedules (${res.status}); the downgrade check is skipped`,
      );
      return;
    }
    status = (await res.json()) as SchedulesStatus;
  } catch (e) {
    log(
      `could not reach the deployment to check its schedules (${e instanceof Error ? e.message : String(e)}); the downgrade check is skipped`,
    );
    return;
  }
  const remote = status.engine?.schedulesLevel ?? 0;
  const local = await projectSchedulesLevel(options.projectDir);
  if (remote <= local) return;
  const open = (status.sites ?? []).reduce((n, s) => n + (s.openReleases?.length ?? 0), 0);
  const gated = (status.sites ?? []).reduce((n, s) => n + (s.gatedNodes ?? 0), 0);
  if (open + gated === 0) return;
  const what = `${open} open release(s) and ${gated} page(s) or entr(ies) with time gates`;
  if (options.forceDowngrade) {
    log(
      `--force-downgrade: deploying schedules level ${local} over level ${remote} with ${what}; held content and embargoes are no longer enforced`,
    );
    return;
  }
  throw new Error(
    `This deploy would downgrade the deployment's schedules (level ${remote} → ${local}) while it has ${what}. Older code ignores scheduled holds and time gates, so they could go live early. Upgrade the @cloudhal packages of this project, cancel the releases and remove the gates (\`cloudhal schedules status --remote\` lists them), or deploy with --force-downgrade.`,
  );
}
