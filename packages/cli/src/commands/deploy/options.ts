/** `cloudhal deploy` options and result. */

import type {
  SchedulerTicker,
  SchedulesDeployment,
  WorkersPlan,
  workerNames,
} from "../../cloudflare/config.ts";
import type { WranglerRunner } from "../../cloudflare/wrangler.ts";
import type { StudioBuilder } from "../../studio-build.ts";
import type { Jurisdiction } from "./state.ts";

export interface DeployOptions {
  readonly projectDir: string;
  /** Base name for Workers and resources (default: the site slug). */
  readonly name?: string;
  readonly studioDir?: string;
  readonly dryRun?: boolean;
  readonly log?: (line: string) => void;
  /** Injected in tests. */
  readonly wrangler?: WranglerRunner;
  readonly fetch?: typeof fetch;
  /** How long to wait for a freshly deployed admin Worker to answer. Default 2 minutes. */
  readonly healthTimeoutMs?: number;
  /**
   * Asks a yes/no question in a terminal (the analytics upgrade prompt). Absent: non-interactive,
   * so a project without an `analytics` key keeps analytics off.
   */
  readonly prompt?: (question: string) => Promise<boolean>;
  /** The project's wrangler version (tests); read from its `package.json` otherwise. */
  readonly wranglerVersion?: string;
  /**
   * `--jurisdiction eu`: create the D1 database in the EU jurisdiction (RFC-0007 D7). Only used
   * when this deploy creates the database; a jurisdiction cannot be changed later.
   */
  readonly jurisdiction?: Jurisdiction;
  /**
   * Asks where a new D1 database should live (a terminal). Absent: non-interactive, so a new
   * database gets the automatic location unless `jurisdiction` says otherwise.
   */
  readonly askJurisdiction?: () => Promise<Jurisdiction>;
  /**
   * `--scheduler cron|alarm`: the ticker to deploy with (RFC-0008 §8.3). Default: what the last
   * deploy used, else `cron`; a refused cron trigger always falls back to `alarm`.
   */
  readonly scheduler?: SchedulerTicker;
  /**
   * `--force-downgrade`: deploy code with a lower schedules level than the deployment's even while
   * releases are open or gates are set (RFC-0008 Compatibility). Holds and gates stop working.
   */
  readonly forceDowngrade?: boolean;
  /**
   * `--plan free|paid`: the account's Workers plan, which sizes each scheduler tick (RFC-0008 §8.2,
   * `CLOUDHAL_TICK_BUDGET`). Default: `cloudhal.json` `schedules.plan`, else what the last deploy
   * used, else `free`. Remembered in `state.json`.
   */
  readonly plan?: WorkersPlan;
  /**
   * `--no-build-studio` (`false`): never run the Studio build. Running from the monorepo, a missing
   * `apps/studio/dist` or one older than the Studio sources then fails the deploy instead of being
   * rebuilt. A published install ships Studio prebuilt and is never checked.
   */
  readonly buildStudio?: boolean;
  /** Injected in tests: runs the Studio build. */
  readonly studioBuilder?: StudioBuilder;
  /**
   * Deploying from Cloudflare Workers Builds (the Deploy to Cloudflare button): names from the
   * committed `wrangler.jsonc`, the starter seeded when missing, secrets kept on the Workers.
   * Default: `WORKERS_CI=1` in the environment.
   */
  readonly workersBuilds?: boolean;
}

export interface DeployResult {
  dryRun: boolean;
  names: ReturnType<typeof workerNames>;
  siteConfig: string;
  adminConfig: string;
  siteUrl?: string | undefined;
  adminUrl?: string | undefined;
  pushed?: boolean;
  /** First deploy only: open it to create the owner account. */
  setupUrl?: string;
  /** First deploy from Workers Builds: how to create the owner account (no link is printed). */
  setupInstructions?: string;
  /** Custom domains from cloudhal.json, routed by this deploy. */
  customSiteUrl?: string;
  customStudioUrl?: string;
  /** What drives the scheduler (RFC-0008 §8.3): the minute cron trigger, or the clock's alarm. */
  scheduler: SchedulerTicker;
  /** The tick budget and the automations switch as deployed (RFC-0008 §8.2, §11.6). */
  schedules: SchedulesDeployment;
  /** Site analytics as deployed (RFC-0006 §11). */
  analytics: {
    enabled: boolean;
    dataset?: string;
    /** The cron trigger is in place (false: the scheduler runs on the Durable Object alarm). */
    cron?: boolean;
    /** The site's cache was purged because analytics switched on or off. */
    purged?: boolean;
  };
  /** Reader comments as deployed (RFC-0007 §15.4); off per site until turned on in Studio. */
  comments: {
    available: boolean;
    /** The cron trigger is in place (false: the scheduler runs on the Durable Object alarm). */
    cron?: boolean;
    /** The `COMMENTS_RL` Rate Limiting binding was added. */
    rateLimit?: boolean;
    /** The site's cache was purged because availability changed. */
    purged?: boolean;
  };
  /** Set when this deploy created the D1 database: where it lives (RFC-0007 D7). */
  databaseCreated?: Jurisdiction;
}
