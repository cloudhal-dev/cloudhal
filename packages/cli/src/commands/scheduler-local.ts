/**
 * The scheduler on Node (RFC-0008 §8.4): `cloudhal dev`, `cloudhal studio` and `cloudhal mcp` run
 * the same `runDue` as the admin Worker, on a timer of at most 60 s — re-armed after every tick at
 * `min(nextWakeAt − now, 60 s)` (1 s while there is more), moved earlier by pokes, `unref`'d — with
 * a catch-up tick at start, so releases and occurrences missed while the process was down follow
 * the missed-run rules (within the hour: run; later: `missed`). Several processes on one SQLite
 * file are safe: every effect is claimed with a lease.
 *
 * It replaces the hourly interval of `startLocalCommentsJob`: the comments job (and the schedules
 * retention) are system jobs behind watermarks on the tick. There is no edge cache, so releases
 * purge nothing (`none`).
 */
import { SqlCommentStore } from "@cloudhal/comments/sql";
import type { SiteGraphStore } from "@cloudhal/core-ts";
import {
  runScheduledTick,
  type SchedulerControl,
  type TickReport,
  type TickTrigger,
} from "@cloudhal/core-ts/releases";
import { dailyAt, hourlyAt, type SystemJobDefinition, TICK_BUDGETS } from "@cloudhal/schedules";
import { SqlScheduleStore } from "@cloudhal/schedules/sql";
import type { BlobStore, SqlDriver } from "@cloudhal/storage";
import { runLocalCommentsJob } from "./comments-local.ts";

/** The longest the Node timer sleeps (§8.4). */
export const NODE_TICK_MAX_MS = 60_000;

export interface LocalSchedulerOptions {
  readonly sql: SqlDriver;
  readonly blobs: BlobStore;
  readonly graph: SiteGraphStore;
  /** Runs the comments job hourly (studio, mcp, dev). Default true. */
  readonly comments?: boolean;
  readonly log?: (line: string) => void;
  /** Clock and timers (tests). */
  readonly now?: () => Date;
  readonly maxIntervalMs?: number;
}

/** The deployment's periodic jobs on Node: the comments job and the schedules retention. */
export function localSystemJobs(
  sql: SqlDriver,
  graph: SiteGraphStore,
  o: { comments: boolean; log: (line: string) => void },
): SystemJobDefinition[] {
  const jobs: SystemJobDefinition[] = [
    {
      name: "schedules.retention",
      cost: 3,
      next: dailyAt(3, 27),
      async run({ now }) {
        const r = await new SqlScheduleStore(sql).applyRetention(now.toISOString());
        if (r.runs + r.releases > 0)
          o.log(`schedules retention: ${r.runs} run(s), ${r.releases} release(s) deleted`);
      },
    },
  ];
  if (o.comments)
    jobs.push({
      name: "comments.hourly",
      cost: 20,
      next: hourlyAt(17),
      async run({ now }) {
        const r = await runLocalCommentsJob(graph, new SqlCommentStore(sql), now);
        o.log(
          `comments hourly: ${r.sites} site(s), ${r.retained} row(s) past retention${r.more ? " (more next run)" : ""}, ${r.closed} thread(s) closed`,
        );
      },
    });
  return jobs;
}

/** One tick on the project's SQLite (the Node timer, `cloudhal schedules run-due`). */
export function runLocalTick(
  o: LocalSchedulerOptions & { trigger: TickTrigger; at?: Date },
): Promise<TickReport> {
  const log = o.log ?? (() => {});
  return runScheduledTick({
    sql: o.sql,
    blobs: o.blobs,
    now: o.at ?? (o.now ?? (() => new Date()))(),
    trigger: o.trigger,
    wake: "computed",
    // no platform limit on Node; the same bounded steps
    budget: TICK_BUDGETS.paid,
    log,
    systemJobs: ({ counted }) =>
      localSystemJobs(counted, o.graph, { comments: o.comments !== false, log }),
  });
}

export interface LocalScheduler extends SchedulerControl {
  /** Resolves once the catch-up tick at start has run (tests). */
  readonly started: Promise<void>;
  /** The next timer, as an instant (tests). */
  nextAt(): number | undefined;
  stop(): void;
}

/** Starts the Node ticker (catch-up now, then at most every 60 s). */
export function startLocalScheduler(o: LocalSchedulerOptions): LocalScheduler {
  const log = o.log ?? ((l: string) => process.stderr.write(`${l}\n`));
  const clock = o.now ?? (() => new Date());
  const max = o.maxIntervalMs ?? NODE_TICK_MAX_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let at: number | undefined;
  let running: Promise<TickReport | undefined> | undefined;
  let again = false;
  let stopped = false;

  const arm = (when: number) => {
    if (stopped) return;
    const now = clock().getTime();
    const target = Math.max(now + 1_000, Math.min(when, now + max));
    if (timer && at !== undefined && at <= target) return;
    if (timer) clearTimeout(timer);
    at = target;
    timer = setTimeout(() => {
      timer = undefined;
      at = undefined;
      void tick("node");
    }, target - now);
    timer.unref?.();
  };

  const tick = async (trigger: TickTrigger): Promise<TickReport | undefined> => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      let report: TickReport | undefined;
      try {
        report = await runLocalTick({ ...o, log, trigger, at: clock() });
      } catch (e) {
        log(`schedules tick (${trigger}) failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      const now = clock().getTime();
      const next = !report
        ? now + max
        : report.more
          ? now + 1_000
          : report.nextWakeAt
            ? Date.parse(report.nextWakeAt)
            : now + max;
      arm(next);
      return report;
    })();
    try {
      return await running;
    } finally {
      running = undefined;
      if (again && !stopped) {
        again = false;
        arm(clock().getTime());
      }
    }
  };

  const started = tick("node").then(() => {});
  return {
    mode: "node",
    started,
    async poke(when: string) {
      const t = Date.parse(when);
      arm(Number.isFinite(t) ? t : clock().getTime());
    },
    runDue: (trigger) =>
      tick(trigger).then((r) => r ?? { ran: 0, late: 0, failed: 1, more: false }),
    nextAt: () => at,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
