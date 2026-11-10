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
  /** Why it failed: the build's last output lines. */
  readonly error?: string | undefined;
  /** What asked for it: `publish`, `rollback`, `release`, … (the first request of the burst). */
  readonly trigger: string;
}

/** What `run` hands back; the queue adds `at`, `durationMs` and `trigger`. */
export type SiteBuildOutcome = Omit<SiteBuildResult, "at" | "durationMs" | "trigger">;

export type SiteRebuildState = "idle" | "queued" | "running";

export interface SiteRebuilderOptions {
  /** One build, start to finish. A throw counts as a failure. */
  readonly run: () => Promise<SiteBuildOutcome>;
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
  /** Drops a queued build and waits for a running one. Later requests are ignored. */
  stop(): Promise<void>;
}

/** A burst of publishes this close together builds once. */
export const SITE_BUILD_DEBOUNCE_MS = 3_000;
/** A build starts at the latest this long after the first request of a burst. */
export const SITE_BUILD_MAX_WAIT_MS = 60_000;

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
    try {
      outcome = await o.run();
    } catch (e) {
      outcome = { ok: false, error: e instanceof Error ? e.message : String(e) };
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
    async stop() {
      stopped = true;
      if (timer !== undefined) clearTimer(timer);
      timer = undefined;
      pending = undefined;
      await running;
      settle();
    },
  };
}
