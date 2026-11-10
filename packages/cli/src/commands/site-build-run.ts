/**
 * Rebuild the self-hosted static site on publish (#150): how `cloudhal studio` builds. Each build
 * is the Docker image's own `site-build` in a child process, run with `--wait`: the same staging
 * copy, `cloudhal build --published` and atomic swap of `/data/site/current` as a hand-started or
 * cron run, so a failed build keeps the previous site. `--wait` makes it wait for the lock
 * `site-build` takes (the container's start-up build, a cron run) instead of giving up, so two
 * builds never overlap across processes; the queue (`site-rebuild.ts`) keeps this process's own
 * builds apart and debounces bursts of publishes.
 *
 * `CLOUDHAL_SITE_BUILD=on|off` switches it: the image sets `on`; a plain `cloudhal studio` has no
 * site output to swap and defaults to `off` (and stays off, with a warning, when `on` finds no
 * `site-build` command on its PATH).
 */
import { access, constants } from "node:fs/promises";
import path from "node:path";
import { type AuditEntry, AuditLog } from "@cloudhal/agent-runtime";
import { SITE_BUILD_TOOL, type SiteBuildService } from "@cloudhal/api";
import type { Actor, Site } from "@cloudhal/core-contracts";
import type { ReleasePublishedHook } from "@cloudhal/core-ts/releases";
import type { SqlDriver } from "@cloudhal/storage";
import { runSiteBuildCommand, SITE_BUILD_TIMEOUT_MS } from "./site-build-child.ts";
import { readServed } from "./site-build-served.ts";
import { createSiteRebuilder, type SiteBuildResult, type SiteRebuilder } from "./site-rebuild.ts";

export {
  outputTail,
  parseBuildOutput,
  plainText,
  runSiteBuildCommand,
  type SiteBuildCommand,
} from "./site-build-child.ts";

/** Who the audit rows name. */
export const SITE_BUILD_ACTOR: Actor = { kind: "system", id: "sys_sitebuild", name: "Site build" };

/** The longest `CLOUDHAL_SITE_BUILD_TIMEOUT` taken (a day; timers cap at about 24.8 days). */
const MAX_TIMEOUT_S = 86_400;

/**
 * `CLOUDHAL_SITE_BUILD_TIMEOUT`: a running build's deadline in seconds (whole, 1 to a day; the
 * wait for another build's lock counts). Unset: 30 minutes; anything else is reported and ignored.
 */
export function siteBuildTimeoutMs(
  env: Readonly<Record<string, string | undefined>>,
  log: (line: string) => void = () => {},
): number {
  const v = env.CLOUDHAL_SITE_BUILD_TIMEOUT?.trim();
  if (!v) return SITE_BUILD_TIMEOUT_MS;
  const n = Number(v);
  if (Number.isInteger(n) && n >= 1 && n <= MAX_TIMEOUT_S) return n * 1000;
  log(
    `CLOUDHAL_SITE_BUILD_TIMEOUT must be whole seconds from 1 to ${MAX_TIMEOUT_S} (got ${JSON.stringify(v)}); using 30 minutes`,
  );
  return SITE_BUILD_TIMEOUT_MS;
}

/** `CLOUDHAL_SITE_BUILD`: `on` (`1`, `true`, `yes`) or `off` (anything else, and unset). */
export function siteBuildEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  const v = env.CLOUDHAL_SITE_BUILD?.trim().toLowerCase();
  return v === "on" || v === "1" || v === "true" || v === "yes";
}

/** The first executable `name` on `PATH`. */
export async function findOnPath(name: string, pathEnv: string | undefined) {
  for (const dir of (pathEnv ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const file = path.join(dir, name);
    try {
      await access(file, constants.X_OK);
      return file;
    } catch {
      // not here
    }
  }
  return undefined;
}

/** The `site.build` audit row of one result. */
export function siteBuildAuditEntry(siteId: string, r: SiteBuildResult): AuditEntry {
  return {
    at: r.at,
    actor: SITE_BUILD_ACTOR,
    siteId,
    tool: SITE_BUILD_TOOL,
    decision: "allow",
    outcome: r.ok ? "ok" : "error",
    durationMs: r.durationMs,
    ...(r.snapshotId ? { snapshotId: r.snapshotId } : {}),
    ...(r.error ? { reason: r.error } : {}),
    input: { trigger: r.trigger, ...(r.state ? { state: r.state } : {}) },
  };
}

/** The rebuild as `cloudhal studio` wires it: the hooks, the API's view, and its end. */
export interface LocalSiteBuild extends SiteBuildService {
  /** The store's `onPublished` (publish, approvals, rollbacks, `notifyPublished`). */
  readonly onPublished: (site: Site) => Promise<void>;
  /** The scheduler's release hook (RFC-0008 release runs). */
  readonly onReleasePublished: ReleasePublishedHook;
  readonly rebuilder: SiteRebuilder;
  /**
   * Drops a queued build and gives a running one `stopDeadlineMs` (5 s) to finish, then ends it and
   * records it as stopped. A second Ctrl-C or SIGTERM meanwhile ends it at once.
   */
  stop(): Promise<void>;
}

export interface LocalSiteBuildOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly projectDir: string;
  readonly siteId: string;
  readonly sql: SqlDriver;
  readonly log: (line: string) => void;
  /** Tests: the command instead of `site-build --wait`, and the queue's timing. */
  readonly command?: { readonly command: string; readonly args: readonly string[] } | undefined;
  readonly debounceMs?: number | undefined;
  readonly maxWaitMs?: number | undefined;
  readonly stopDeadlineMs?: number | undefined;
  /** Tests: a build's deadline instead of `CLOUDHAL_SITE_BUILD_TIMEOUT`'s. */
  readonly timeoutMs?: number | undefined;
}

/**
 * The rebuild for `cloudhal studio`, or undefined when `CLOUDHAL_SITE_BUILD` is off (or `on`
 * finds no `site-build`). Only `siteId` — the site the static build renders — is rebuilt.
 */
export async function localSiteBuild(
  o: LocalSiteBuildOptions,
): Promise<LocalSiteBuild | undefined> {
  if (!siteBuildEnabled(o.env)) return undefined;
  let command = o.command;
  if (!command) {
    const bin = await findOnPath("site-build", o.env.PATH);
    if (!bin) {
      o.log(
        "CLOUDHAL_SITE_BUILD=on, but there is no site-build command on PATH (it comes with the Docker image): the site is not rebuilt on publish",
      );
      return undefined;
    }
    command = { command: bin, args: ["--wait"] };
  }
  const audit = new AuditLog(o.sql);
  const run = command;
  const timeoutMs = o.timeoutMs ?? siteBuildTimeoutMs(o.env, o.log);
  // `site-build` records who ran it in site/current.json
  const env = { ...process.env, CLOUDHAL_SITE_BUILD_SOURCE: "studio" };
  const rebuilder = createSiteRebuilder({
    run: (signal) =>
      runSiteBuildCommand({ ...run, cwd: o.projectDir, env, log: o.log, signal, timeoutMs }),
    onResult: async (r) => {
      await audit.record(siteBuildAuditEntry(o.siteId, r));
    },
    debounceMs: o.debounceMs,
    maxWaitMs: o.maxWaitMs,
    log: o.log,
  });
  return {
    siteId: o.siteId,
    state: () => rebuilder.state(),
    served: () => readServed(o.projectDir),
    rebuilder,
    onPublished: async (site) => {
      if (site.id === o.siteId) rebuilder.schedule("publish");
    },
    onReleasePublished: ({ siteId }) => {
      if (siteId === o.siteId) rebuilder.schedule("release");
    },
    stop: async () => {
      // the build is its own process group: a terminal's second Ctrl-C reaches only us
      const now = () => rebuilder.abort();
      process.once("SIGINT", now);
      process.once("SIGTERM", now);
      try {
        await rebuilder.stop(o.stopDeadlineMs);
      } finally {
        process.off("SIGINT", now);
        process.off("SIGTERM", now);
      }
    },
  };
}
