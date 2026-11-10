/**
 * What a deployment provides for RFC-0008 schedules (§16) — the store, the ticker, the purge, the
 * limits and the release-published hook (#150) — and core-ts's `ReleaseService` over it, as the
 * REST routes and MCP tools use them (re-exported by `schedules.ts`).
 */
import type { SiteGraphStore } from "@cloudhal/core-ts";
import {
  type ReleasePublishedHook,
  type ReleasePurger,
  ReleaseService,
  type SchedulerControl,
} from "@cloudhal/core-ts/releases";
import type { SqlScheduleStore } from "@cloudhal/schedules/sql";

/** What a deployment provides for schedules (RFC-0008 §16). */
export interface SchedulesDeps {
  readonly store: SqlScheduleStore;
  /** `false` when the deployment turned schedules off. Default true. */
  readonly available?: boolean | undefined;
  /** `CLOUDHAL_AUTOMATIONS=off` → false: automations stop, releases and gates go on (§11.6). */
  readonly automationsEnabled?: boolean | undefined;
  /**
   * The deployment's ticker (`ApiDeps.scheduler`): its mode for `/api/instance` and
   * `/api/scheduler`, and `poke` when something becomes due sooner (a release scheduled, approved or
   * moved, a window opened; §8.3).
   */
  readonly scheduler?: SchedulerControl | undefined;
  /** "Publish now" purges the live site's cache like a tick does (absent: nothing is cached). */
  readonly purge?: ReleasePurger | undefined;
  /** New versions one call may pin (§6.1 step 4; Workers Free: 20, the default). */
  readonly maxNewBodies?: number | undefined;
  /** After "Publish now" commits a release (the Node server rebuilds its static site, #150). */
  readonly onReleasePublished?: ReleasePublishedHook | undefined;
}

/** True when the deployment serves schedules. */
export const schedulesAvailable = (deps: SchedulesDeps | undefined): deps is SchedulesDeps =>
  deps !== undefined && deps.available !== false;

/** core-ts's `ReleaseService` over this graph, with the deployment's ticker and purge. */
export function releaseService(
  deps: SchedulesDeps,
  graph: SiteGraphStore,
  now?: () => Date,
): ReleaseService {
  return new ReleaseService({
    graph,
    ...(now ? { now } : {}),
    ...(deps.scheduler ? { scheduler: deps.scheduler } : {}),
    ...(deps.purge ? { purge: deps.purge } : {}),
    ...(deps.maxNewBodies !== undefined ? { maxNewBodies: deps.maxNewBodies } : {}),
    ...(deps.onReleasePublished ? { onReleasePublished: deps.onReleasePublished } : {}),
  });
}

/** Tells the ticker something is due at `at` (never throws, never awaited by callers' answers). */
export function poke(deps: SchedulesDeps, at: string | undefined): void {
  if (!at || !deps.scheduler) return;
  deps.scheduler.poke(at).catch(() => undefined);
}
