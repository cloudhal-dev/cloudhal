/**
 * `/api/sites/:siteId/site-build` (#150): the self-hosted static site's build, for Studio's
 * overview. Whether this server rebuilds the site on publish, whether a build is queued or
 * running now, the last build Studio ran, read from its `site.build` audit row (duration, the
 * snapshot it rendered, why it failed), and what visitors see now (`served`, whoever built it: a
 * cron or hand-started `site-build` too). Read-only: builds follow publishes.
 *
 * The failure's output tail is a system audit row's text: like `/activity` (RFC-0005 §10.1), only
 * callers holding `audit:read` get it; everyone else sees that the build failed.
 */
import { type AuditRow, holds } from "@cloudhal/agent-runtime";
import { type Context, Hono } from "hono";
import type { Env } from "../context.ts";
import { notFound } from "../errors.ts";
import { param } from "../params.ts";

/** The audit row's `tool` of a site build. */
export const SITE_BUILD_TOOL = "site.build";

/** What the static site serves now, from the last build that published (any process's). */
export interface SiteBuildServed {
  /** When that build went live (ISO). */
  readonly at: string;
  /** Its build id (`/data/site/<id>`), when known: Studio's last build went live if it matches. */
  readonly build?: string | undefined;
  readonly snapshotId?: string | undefined;
  /** `published`: the site; `not-published`: the status page (RFC-0043 §1.10). */
  readonly state?: "published" | "not-published" | undefined;
  /** Who ran it: `studio`, `cron`, `manual`, `start`. */
  readonly source?: string | undefined;
}

/** What the Node server tells the API about its rebuild queue (`ApiDeps.siteBuild`). */
export interface SiteBuildService {
  /** The site the static build renders (`cloudhal.json` `siteId`); other sites are not built. */
  readonly siteId: string;
  state(): "idle" | "queued" | "running";
  /** What visitors see now; null when nothing was ever built. Absent: unknown. */
  served?(): Promise<SiteBuildServed | null>;
}

/** The last build, as Studio shows it. */
export interface SiteBuildLast {
  readonly at: string;
  readonly ok: boolean;
  readonly durationMs?: number | undefined;
  readonly snapshotId?: string | undefined;
  /** `published`: the site; `not-published`: the status page (RFC-0043 §1.10). */
  readonly state?: "published" | "not-published" | undefined;
  readonly trigger?: string | undefined;
  /** The build id it made live, when it got that far (a failure with one failed after the swap). */
  readonly build?: string | undefined;
  /** The build's last output lines, when it failed (callers with `audit:read` only). */
  readonly error?: string | undefined;
}

export type SiteBuildStatus =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly state: "idle" | "queued" | "running";
      readonly last: SiteBuildLast | null;
      /** What visitors see now (null: nothing is online); absent when the server cannot tell. */
      readonly served?: SiteBuildServed | null | undefined;
    };

function lastOf(row: AuditRow | undefined, withError: boolean): SiteBuildLast | null {
  if (!row) return null;
  const input = (row.input ?? {}) as { trigger?: unknown; state?: unknown; build?: unknown };
  const state =
    input.state === "published" || input.state === "not-published" ? input.state : undefined;
  return {
    at: row.at,
    ok: row.outcome === "ok",
    ...(row.durationMs !== undefined ? { durationMs: row.durationMs } : {}),
    ...(row.snapshotId ? { snapshotId: row.snapshotId } : {}),
    ...(state ? { state } : {}),
    ...(typeof input.trigger === "string" ? { trigger: input.trigger } : {}),
    ...(typeof input.build === "string" && input.build.length <= 64 ? { build: input.build } : {}),
    ...(withError && row.outcome !== "ok" && row.reason ? { error: row.reason } : {}),
  };
}

/** Whether the caller may read system audit text (no principal: a local server without auth). */
function readsAudit(c: Context<Env>): boolean {
  const principal = c.get("principal");
  return !principal || holds(principal.scopes, "audit:read");
}

export const siteBuild: Hono<Env> = new Hono<Env>().get("/", async (c) => {
  const siteId = param(c, "siteId");
  if (!(await c.get("store").getSite(siteId))) throw notFound("site not found");
  const service = c.get("siteBuild");
  const audit = c.get("audit");
  if (!service || service.siteId !== siteId || !audit)
    return c.json({ enabled: false } satisfies SiteBuildStatus);
  const [row] = await audit.list({ siteId, tool: SITE_BUILD_TOOL, limit: 1 });
  const served = service.served ? await service.served().catch(() => undefined) : undefined;
  return c.json({
    enabled: true,
    state: service.state(),
    last: lastOf(row, readsAudit(c)),
    ...(served !== undefined ? { served } : {}),
  } satisfies SiteBuildStatus);
});
