/**
 * `cloudhal schedules status | list | run-due` (RFC-0008 §16): the scheduler's health, the open
 * releases and gated pages of the project's site, and a tick on demand — on the project's SQLite,
 * or with `--remote` on the deployment (deployment token: `/api/admin/schedules/*`). Self-hosters
 * without a long-running process run `cloudhal schedules run-due` from the system's cron every
 * minute (§8.4).
 */
import path from "node:path";
import { openLocalStore } from "@cloudhal/core-ts/local";
import {
  gatedNodeCount,
  ReleaseService,
  type ReleaseSummary,
  releaseSummary,
  SCHEDULES_ENGINE_LEVEL,
  type SchedulerHealthReport,
  schedulerHealthReport,
  type TickReport,
} from "@cloudhal/core-ts/releases";
import { readProjectConfig } from "../config.ts";
import { runLocalTick } from "./scheduler-local.ts";
import { brief, deployment, type SyncOptions } from "./sync.ts";

export interface SchedulesCliOptions extends SyncOptions {
  /** Talk to the deployment (deployment token) instead of the local SQLite. */
  readonly remote?: boolean;
  /** Clock (tests). */
  readonly now?: () => Date;
}

export interface SchedulesStatusReport {
  readonly where: "local" | "remote";
  readonly engine: { readonly schedulesLevel: number };
  readonly scheduler: SchedulerHealthReport;
  readonly sites: readonly {
    readonly siteId: string;
    readonly name?: string;
    readonly openReleases: readonly ReleaseSummary[];
    readonly gatedNodes: number;
  }[];
}

async function remoteJson<T>(
  options: SchedulesCliOptions,
  p: string,
  init: RequestInit = {},
): Promise<{ cfg: Awaited<ReturnType<typeof deployment>>["cfg"]; body: T }> {
  const { cfg, adminUrl, token, fetch: f } = await deployment(options);
  const res = await f(new URL(p.replace(":siteId", cfg.siteId), adminUrl), {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (res.status === 404 && p.startsWith("/api/admin/schedules"))
    throw new Error(
      "the deployment does not run schedules yet (deploy this version with `cloudhal deploy` first)",
    );
  if (!res.ok) throw new Error(`the deployment answered ${res.status}: ${brief(text)}`);
  return { cfg, body: JSON.parse(text) as T };
}

async function withLocal<T>(
  projectDir: string,
  fn: (l: Awaited<ReturnType<typeof openLocalStore>>, siteId: string) => Promise<T>,
): Promise<T> {
  const cfg = await readProjectConfig(projectDir);
  const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
  try {
    return await fn(local, cfg.siteId);
  } finally {
    await local.close();
  }
}

/** `cloudhal schedules status`. */
export async function schedulesStatus(
  options: SchedulesCliOptions,
): Promise<SchedulesStatusReport> {
  if (options.remote) {
    const { body } = await remoteJson<Omit<SchedulesStatusReport, "where">>(
      options,
      "/api/admin/schedules/status",
    );
    return { ...body, where: "remote" };
  }
  const now = (options.now ?? (() => new Date()))();
  return withLocal(options.projectDir, async (local) => {
    const releases = new ReleaseService({ graph: local.store });
    const sites = [];
    for (const site of await local.store.listSites())
      sites.push({
        siteId: site.id,
        name: site.name,
        openReleases: (await releases.openReleases(site.id)).map(releaseSummary),
        gatedNodes: await gatedNodeCount(local.sql, site.id, now),
      });
    return {
      where: "local" as const,
      engine: { schedulesLevel: SCHEDULES_ENGINE_LEVEL },
      scheduler: await schedulerHealthReport(local.sql, { now, mode: "node" }),
      sites,
    };
  });
}

const HEALTH_WORDS: Record<SchedulerHealthReport["state"], string> = {
  running: "running",
  late: "late (work is due and the last tick is over two minutes behind)",
  stopped: "stopped (no tick for over ten minutes)",
  unknown: "never ticked",
};

export function describeSchedulesStatus(s: SchedulesStatusReport): string[] {
  const h = s.scheduler;
  const lines = [
    `scheduler (${s.where}, ${h.mode}): ${HEALTH_WORDS[h.state]}${h.lastTickAt ? `; last tick ${h.lastTickAt}${h.lastTrigger ? ` (${h.lastTrigger})` : ""}` : ""}${h.nextWakeAt ? `; next by ${h.nextWakeAt}` : ""}`,
    ...(h.nextDueAt ? [`next due: ${h.nextDueAt}`] : []),
    `schedules level: ${s.engine.schedulesLevel}`,
  ];
  for (const site of s.sites) {
    lines.push(
      `${site.name ?? site.siteId} (${site.siteId}): ${site.openReleases.length} open release(s), ${site.gatedNodes} gated page(s)/entr(ies)`,
    );
    for (const r of site.openReleases) lines.push(`  ${describeRelease(r)}`);
  }
  return lines;
}

export function describeRelease(r: ReleaseSummary): string {
  return `${r.id}  ${r.state.padEnd(17)} ${r.executeAt ?? "(no time)".padEnd(24)}  ${r.items} item(s)${r.title ? `  ${r.title}` : ""}`;
}

/** `cloudhal schedules list`: the site's releases, open first by time, then recent ones. */
export async function schedulesList(
  options: SchedulesCliOptions & { limit?: number },
): Promise<ReleaseSummary[]> {
  const limit = options.limit ?? 50;
  if (options.remote) {
    const { body } = await remoteJson<{ releases: ReleaseSummary[] }>(
      options,
      `/api/admin/sites/:siteId/schedules/releases?limit=${limit}`,
    );
    return body.releases;
  }
  return withLocal(options.projectDir, async (local, siteId) =>
    (await new ReleaseService({ graph: local.store }).list(siteId, { limit })).map(releaseSummary),
  );
}

/** `cloudhal schedules run-due`: one tick now (`manual`), locally or on the deployment. */
export async function schedulesRunDue(options: SchedulesCliOptions): Promise<TickReport> {
  if (options.remote)
    return (
      await remoteJson<TickReport>(options, "/api/admin/schedules/run-due", { method: "POST" })
    ).body;
  return withLocal(options.projectDir, (local) =>
    runLocalTick({
      sql: local.sql,
      blobs: local.blobs,
      graph: local.store,
      trigger: "manual",
      ...(options.now ? { now: options.now } : {}),
      log: (l) => process.stderr.write(`${l}\n`),
    }),
  );
}

export function describeTick(r: TickReport): string {
  return `tick: ${r.ran} ran, ${r.late} late, ${r.failed} failed${r.more ? ", more is due (run again)" : ""}${r.nextWakeAt ? `; next due ${r.nextWakeAt}` : ""}`;
}
