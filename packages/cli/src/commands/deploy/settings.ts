/** What `cloudhal.json` and the flags turn into for the generated configs: analytics, comments, jurisdiction, observability. */

import {
  type AnalyticsDeployment,
  type CommentsDeployment,
  DEFAULT_BEACON_RATE_LIMIT,
  DEFAULT_COMMENTS_RATE_LIMIT,
  type ObservabilityDeployment,
  rateLimitNamespaceId,
  type SchedulerTicker,
} from "../../cloudflare/config.ts";
import { type ProjectConfig, writeProjectConfig } from "../../config.ts";
import type { DeployOptions, DeployResult } from "./options.ts";
import type { Jurisdiction } from "./state.ts";

/** Default daily budget of uncached live analytics queries (RFC-0006 §7.7, open question 6). */
export const DEFAULT_QUERY_BUDGET = 8000;

/** `analytics.rateLimit` as the generated config needs it (RFC-0006 §5.5); `{}` when off. */
export function rateLimitDeployment(
  cfg: Pick<ProjectConfig, "analytics">,
  dataset: string,
): Pick<AnalyticsDeployment, "rateLimit"> {
  const r = cfg.analytics?.rateLimit;
  if (!r) return {};
  const o = r === true ? {} : r;
  return {
    rateLimit: {
      namespaceId: o.namespaceId ?? rateLimitNamespaceId(dataset),
      limit: o.limit ?? DEFAULT_BEACON_RATE_LIMIT,
    },
  };
}

/** `comments.rateLimit` as the generated config needs it (RFC-0007 §6.5); `{}` when off. */
export function commentsRateLimitDeployment(
  cfg: Pick<ProjectConfig, "comments">,
  name: string,
): Pick<CommentsDeployment, "rateLimit"> {
  const r = cfg.comments?.rateLimit;
  if (!r) return {};
  const o = r === true ? {} : r;
  return {
    rateLimit: {
      namespaceId: o.namespaceId ?? rateLimitNamespaceId(name, "comments"),
      limit: o.limit ?? DEFAULT_COMMENTS_RATE_LIMIT,
    },
  };
}

/**
 * Whether this deploy records analytics: `cloudhal.json` decides; a project without the key is
 * asked once in a terminal and the answer is written back (RFC-0006 §11, open question 1).
 */
export async function decideAnalytics(
  options: DeployOptions,
  cfg: ProjectConfig,
  siteName: string,
  log: (line: string) => void,
): Promise<ProjectConfig> {
  if (cfg.analytics !== undefined) return cfg;
  if (!options.prompt) {
    log(
      'analytics: off. Turn on cookie-less analytics with "analytics": { "enabled": true } in cloudhal.json, then deploy again.',
    );
    return cfg;
  }
  const yes = await options.prompt(`Turn on cookie-less analytics for ${siteName}? (Y/n) `);
  const next: ProjectConfig = { ...cfg, analytics: { enabled: yes } };
  await writeProjectConfig(options.projectDir, next);
  log(`analytics: ${yes ? "on" : "off"} (saved in cloudhal.json)`);
  return next;
}

/**
 * Where a database this deploy creates should live (RFC-0007 D7): the flag, else the terminal
 * question, else (non-interactive) the automatic location, saying how to choose.
 */
export function jurisdictionChooser(
  options: DeployOptions,
  log: (line: string) => void,
): () => Promise<Jurisdiction> {
  return async () => {
    if (options.jurisdiction) return options.jurisdiction;
    if (options.askJurisdiction) return options.askJurisdiction();
    log(
      "D1 database: automatic location (non-interactive). To keep the data in the EU, create it with `cloudhal deploy --jurisdiction eu` instead: a jurisdiction cannot be changed once the database exists.",
    );
    return "auto";
  };
}

export function commentsResult(
  c: CommentsDeployment,
  scheduler: SchedulerTicker,
  purged?: boolean,
): DeployResult["comments"] {
  return {
    available: c.available,
    ...(c.available ? { cron: scheduler === "cron" } : {}),
    ...(c.rateLimit ? { rateLimit: true } : {}),
    ...(purged ? { purged } : {}),
  };
}

/** `cloudhal.json` `observability` as the generated configs need it. */
export function observabilityOf(
  cfg: Pick<ProjectConfig, "observability">,
): ObservabilityDeployment {
  const t = cfg.observability?.traces;
  return {
    logs: cfg.observability?.logs ?? 1,
    traces: t === true ? 1 : typeof t === "number" && t > 0 ? t : false,
  };
}
