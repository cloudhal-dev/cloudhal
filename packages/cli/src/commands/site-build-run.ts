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
import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import path from "node:path";
import { type AuditEntry, AuditLog } from "@cloudhal/agent-runtime";
import { SITE_BUILD_TOOL, type SiteBuildService } from "@cloudhal/api";
import type { Actor, Site } from "@cloudhal/core-contracts";
import type { ReleasePublishedHook } from "@cloudhal/core-ts/releases";
import type { SqlDriver } from "@cloudhal/storage";
import {
  createSiteRebuilder,
  type SiteBuildOutcome,
  type SiteBuildResult,
  type SiteRebuilder,
} from "./site-rebuild.ts";

/** Who the audit rows name. */
export const SITE_BUILD_ACTOR: Actor = { kind: "system", id: "sys_sitebuild", name: "Site build" };

/** The build's output kept for a failure's reason: its last lines, at most this many characters. */
const ERROR_TAIL = 600;
/** Output kept in memory while a build runs. */
const OUTPUT_KEEP = 16_384;

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

/**
 * What a finished build rendered, from `cloudhal build --published`'s own lines: `built … from
 * <snapshot> (published)` or `not-published: …`. Line scans, no regex over the output.
 */
export function parseBuildOutput(output: string): Pick<SiteBuildOutcome, "snapshotId" | "state"> {
  for (const line of output.split("\n").reverse()) {
    const text = line.trim();
    if (text.startsWith("not-published:")) return { state: "not-published" };
    const suffix = " (published)";
    if (!text.endsWith(suffix)) continue;
    const at = text.lastIndexOf(" from ");
    if (at === -1) continue;
    const id = text.slice(at + 6, text.length - suffix.length);
    if (id && !id.includes(" ")) return { state: "published", snapshotId: id };
  }
  return {};
}

/** The last lines of `output` within `ERROR_TAIL` characters. */
export function outputTail(output: string): string {
  const lines = output.trimEnd().split("\n");
  let tail = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    const next = tail ? `${lines[i]}\n${tail}` : (lines[i] ?? "");
    if (next.length > ERROR_TAIL) break;
    tail = next;
  }
  return tail || output.slice(-ERROR_TAIL);
}

export interface SiteBuildCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv | undefined;
  /** `site-build:` progress lines and failures (the container log). */
  readonly log?: ((line: string) => void) | undefined;
}

/** One build in a child process: success is exit code 0. */
export function runSiteBuildCommand(o: SiteBuildCommand): Promise<SiteBuildOutcome> {
  return new Promise((resolve) => {
    let output = "";
    let partial = "";
    const keep = (chunk: Buffer) => {
      const text = chunk.toString();
      output = (output + text).slice(-OUTPUT_KEEP);
      // forward the script's own progress lines, not Astro's whole build log
      const lines = (partial + text).split("\n");
      partial = lines.pop() ?? "";
      for (const line of lines) if (line.startsWith("site-build:")) o.log?.(line);
    };
    const child = spawn(o.command, [...o.args], {
      cwd: o.cwd,
      env: o.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", keep);
    child.stderr?.on("data", keep);
    child.once("error", (e) => resolve({ ok: false, error: e.message }));
    child.once("close", (code, signal) => {
      if (code === 0) return resolve({ ok: true, ...parseBuildOutput(output) });
      const why = signal ? `stopped by ${signal}` : `exited with ${code}`;
      const tail = outputTail(output);
      resolve({ ok: false, error: tail ? `${why}: ${tail}` : why });
    });
  });
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
  const rebuilder = createSiteRebuilder({
    run: () => runSiteBuildCommand({ ...run, cwd: o.projectDir, log: o.log }),
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
    rebuilder,
    onPublished: async (site) => {
      if (site.id === o.siteId) rebuilder.schedule("publish");
    },
    onReleasePublished: ({ siteId }) => {
      if (siteId === o.siteId) rebuilder.schedule("release");
    },
    stop: () => rebuilder.stop(),
  };
}
