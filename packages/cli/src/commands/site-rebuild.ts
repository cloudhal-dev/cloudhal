/**
 * Rebuild the self-hosted static site on publish (#150): the queue. Every member of the
 * `onPublished` family (the API's publish route, approvals, rollbacks, RFC-0008 release runs)
 * calls `schedule`; the queue runs one build at a time, never two at once, and a burst of
 * publishes builds once:
 *
 * - **Debounced.** A build starts `debounceMs` after the last request, and at the latest `maxWaitMs`
 *   after the first one of a burst, so a steady stream of publishes cannot postpone it forever.
 * - **Serialised.** A request while a build runs marks the queue dirty; one more build follows the
 *   running one (after the debounce), however many requests came in meanwhile. Builds in other
 *   processes (the container's start-up build, a cron `site-build`) are kept apart by the lock
 *   `site-build` takes (`site-build-run.ts` runs it with `--wait`).
 * - **A failure is reported, not retried.** The run keeps the previous site (it publishes only a
 *   finished build); the next publish schedules the next attempt.
 * - **Stopping is bounded.** `stop` drops a queued build and gives a running one `deadlineMs` to
 *   finish, then aborts it (`run`'s signal); the interrupted result is still reported.
 *
 * Pure: the build itself is `run`, the clock and timers are injectable (tests).
 */

/** What one build reported. */
export interface SiteBuildResult {
  readonly ok: boolean;
  /** When it started (ISO). */
  readonly at: string;
  readonly durationMs: number;
  /** The snapshot the build rendered, when it rendered one. */
  readonly snapshotId?: string | undefined;
  /** `published`: the site; `not-published`: RFC-0043's status page (nothing is published). */
  readonly state?: "published" | "not-published" | undefined;
  /**
   * The build id `site-build` made live (`site/<id>`), when it got that far: a failure that names
   * one went live, and only a step after the swap failed.
   */
  readonly build?: string | undefined;
  /** Why it failed: the build's last output lines. */
  readonly error?: string | undefined;
  /** What asked for it: `publish`, `rollback`, `release`, … (the first request of the burst). */
  readonly trigger: string;
}

/** What `run` hands back; the queue adds `at`, `durationMs` and `trigger`. */
export type SiteBuildOutcome = Omit<SiteBuildResult, "at" | "durationMs" | "trigger">;

export type SiteRebuildState = "idle" | "queued" | "running";

export interface SiteRebuilderOptions {
  /**
   * One build, start to finish. A throw counts as a failure. `signal` aborts it (`stop`'s deadline;
   * its `reason` is an Error that says why): it ends the build and resolves with a failure.
   */
  readonly run: (signal: AbortSignal) => Promise<SiteBuildOutcome>;
  /** After every build, success or failure (the audit row). Errors are logged. */
  readonly onResult?: ((result: SiteBuildResult) => void | Promise<void>) | undefined;
  readonly debounceMs?: number | undefined;
  readonly maxWaitMs?: number | undefined;
  readonly log?: ((line: string) => void) | undefined;
  readonly now?: (() => number) | undefined;
  readonly setTimer?: ((fn: () => void, ms: number) => unknown) | undefined;
  readonly clearTimer?: ((handle: unknown) => void) | undefined;
}

export interface SiteRebuilder {
  /** Asks for a build (`trigger` names why); returns at once. */
  schedule(trigger: string): void;
  state(): SiteRebuildState;
  /** Resolves when nothing is queued or running (tests). */
  idle(): Promise<void>;
  /**
   * Drops a queued build and waits at most `deadlineMs` (default `SITE_BUILD_STOP_DEADLINE_MS`) for
   * a running one, then aborts it and waits for its result. Later requests are ignored.
   */
  stop(deadlineMs?: number): Promise<void>;
  /** Aborts the running build now (a second Ctrl-C while stopping). */
  abort(): void;
}

/** A burst of publishes this close together builds once. */
export const SITE_BUILD_DEBOUNCE_MS = 3_000;
/** A build starts at the latest this long after the first request of a burst. */
export const SITE_BUILD_MAX_WAIT_MS = 60_000;
/** How long `stop` lets a running build finish: well inside Docker's 10 s stop grace period. */
export const SITE_BUILD_STOP_DEADLINE_MS = 5_000;
/** Why a build `stop` aborted reports failure. */
export const SITE_BUILD_STOPPED = "stopped: Studio is shutting down";

export function createSiteRebuilder(o: SiteRebuilderOptions): SiteRebuilder {
  const debounceMs = o.debounceMs ?? SITE_BUILD_DEBOUNCE_MS;
  const maxWaitMs = Math.max(o.maxWaitMs ?? SITE_BUILD_MAX_WAIT_MS, debounceMs);
  const log = o.log ?? (() => {});
  const now = o.now ?? Date.now;
  const setTimer =
    o.setTimer ??
    ((fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      t.unref?.();
      return t;
    });
  const clearTimer =
    o.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let timer: unknown;
  /** The first request of the pending burst: its time and trigger. */
  let pending: { since: number; trigger: string } | undefined;
  let running: Promise<void> | undefined;
  /** Aborts the running build. */
  let controller: AbortController | undefined;
  let stopped = false;
  let waiters: (() => void)[] = [];

  const settle = () => {
    if (timer !== undefined || running || pending) return;
    const ws = waiters;
    waiters = [];
    for (const w of ws) w();
  };

  const arm = () => {
    if (!pending || running || stopped) return;
    if (timer !== undefined) clearTimer(timer);
    const delay = Math.max(0, Math.min(debounceMs, pending.since + maxWaitMs - now()));
    timer = setTimer(fire, delay);
  };

  const fire = () => {
    timer = undefined;
    if (!pending || running || stopped) return settle();
    const trigger = pending.trigger;
    pending = undefined;
    running = build(trigger).finally(() => {
      running = undefined;
      if (pending && !stopped) arm();
      settle();
    });
  };

  const build = async (trigger: string): Promise<void> => {
    const started = now();
    let outcome: SiteBuildOutcome;
    controller = new AbortController();
    try {
      outcome = await o.run(controller.signal);
    } catch (e) {
      outcome = { ok: false, error: e instanceof Error ? e.message : String(e) };
    } finally {
      controller = undefined;
    }
    const result: SiteBuildResult = {
      ...outcome,
      at: new Date(started).toISOString(),
      durationMs: Math.max(0, now() - started),
      trigger,
    };
    log(
      result.ok
        ? `site build (${trigger}): ${result.state === "not-published" ? "the not-published status page" : (result.snapshotId ?? "done")} in ${result.durationMs} ms`
        : result.build
          ? `site build (${trigger}): ${result.build} went live, then the run failed after ${result.durationMs} ms: ${result.error ?? "no output"}`
          : `site build (${trigger}) failed after ${result.durationMs} ms; the previous site is still served: ${result.error ?? "no output"}`,
    );
    try {
      await o.onResult?.(result);
    } catch (e) {
      log(`site build: could not record the result: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return {
    schedule(trigger) {
      if (stopped) return;
      if (!pending) pending = { since: now(), trigger };
      // While a build runs, the next one is armed when it ends.
      if (!running) arm();
    },
    state: () => (running ? "running" : pending ? "queued" : "idle"),
    idle: () =>
      new Promise<void>((resolve) => {
        waiters.push(resolve);
        settle();
      }),
    async stop(deadlineMs = SITE_BUILD_STOP_DEADLINE_MS) {
      stopped = true;
      if (timer !== undefined) clearTimer(timer);
      timer = undefined;
      pending = undefined;
      const current = running;
      if (current) {
        let deadline: unknown;
        const late = new Promise<true>((resolve) => {
          deadline = setTimer(() => resolve(true), deadlineMs);
        });
        const overdue = await Promise.race([current.then(() => false), late]);
        clearTimer(deadline);
        if (overdue) {
          log(`site build: still running after ${deadlineMs} ms; stopping it`);
          controller?.abort(new Error(SITE_BUILD_STOPPED));
          await current;
        }
      }
      settle();
    },
    abort() {
      controller?.abort(new Error(SITE_BUILD_STOPPED));
    },
  };
}
