/**
 * The options and requests of `ReleaseService` (RFC-0008 §6, §12), split from `releases.ts`, which
 * re-exports them.
 */
import type { Actor } from "@cloudhal/core-contracts";
import type { WhenInput } from "@cloudhal/schedules";
import type { SqlDriver } from "@cloudhal/storage";
import type { ReleasePublishedHook } from "./release-after.ts";
import type { ReleasePurger, SchedulerRuntime } from "./releases.ts";
import type { SiteGraphStore } from "./store.ts";

export interface ReleaseServiceOptions {
  readonly graph: SiteGraphStore;
  /** The database of `graph` (default `graph.sql`). */
  readonly sql?: SqlDriver | undefined;
  /** The clock for lead times and "Publish now" (default `Date.now`). */
  readonly now?: (() => Date) | undefined;
  /** The ticker, poked when a release's time is set or moved (default: cron, no pokes). */
  readonly scheduler?: SchedulerRuntime | undefined;
  /** "Publish now" purges like a tick does (absent: nothing cached). */
  readonly purge?: ReleasePurger | undefined;
  /** New bodies one call may write (§6.1 step 4; Workers Free: 20). `Infinity` on Node. */
  readonly maxNewBodies?: number | undefined;
  /** After "Publish now" commits a release, as a tick's `onReleasePublished` (the Node server rebuilds, #150). */
  readonly onReleasePublished?: ReleasePublishedHook | undefined;
  readonly log?: ((line: string) => void) | undefined;
  /**
   * RFC-0045: the deployment's tick budget (`CLOUDHAL_TICK_BUDGET`), which sizes "Publish now"'s
   * allowance of blob calls for its purge (default: Workers Free's).
   */
  readonly tickBudget?: { readonly maxQueries: number } | undefined;
}

export interface PinRequest {
  /** Nodes whose current working-copy version goes live. */
  readonly set?: readonly string[] | undefined;
  /** Entries, pages and redirects taken out of the live site. */
  readonly remove?: readonly string[] | undefined;
}

export interface CreateReleaseRequest extends PinRequest {
  readonly siteId: string;
  readonly createdBy: Actor;
  readonly title?: string | undefined;
  /** An instant, a wall-clock time (in `timeZone`, else the site's zone), or `on-approval`. */
  readonly when?: WhenInput | undefined;
  readonly metadata?: Record<string, string> | undefined;
}
