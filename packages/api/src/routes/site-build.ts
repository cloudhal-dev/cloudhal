/**
 * `/api/sites/:siteId/site-build` (#150): the self-hosted static site's build, for Studio's
 * overview. Whether this server rebuilds the site on publish, whether a build is queued or
 * running now, and the last build's result, read from its `site.build` audit row (duration, the
 * snapshot it rendered, why it failed). Read-only: builds follow publishes.
 */
import type { AuditRow } from "@cloudhal/agent-runtime";
import { Hono } from "hono";
import type { Env } from "../context.ts";
import { notFound } from "../errors.ts";
import { param } from "../params.ts";

/** The audit row's `tool` of a site build. */
export const SITE_BUILD_TOOL = "site.build";

/** What the Node server tells the API about its rebuild queue (`ApiDeps.siteBuild`). */
export interface SiteBuildService {
  /** The site the static build renders (`cloudhal.json` `siteId`); other sites are not built. */
  readonly siteId: string;
  state(): "idle" | "queued" | "running";
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
  /** The build's last output lines, when it failed. */
  readonly error?: string | undefined;
}

export type SiteBuildStatus =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly state: "idle" | "queued" | "running";
      readonly last: SiteBuildLast | null;
    };

function lastOf(row: AuditRow | undefined): SiteBuildLast | null {
  if (!row) return null;
  const input = (row.input ?? {}) as { trigger?: unknown; state?: unknown };
  const state =
    input.state === "published" || input.state === "not-published" ? input.state : undefined;
  return {
    at: row.at,
    ok: row.outcome === "ok",
    ...(row.durationMs !== undefined ? { durationMs: row.durationMs } : {}),
    ...(row.snapshotId ? { snapshotId: row.snapshotId } : {}),
    ...(state ? { state } : {}),
    ...(typeof input.trigger === "string" ? { trigger: input.trigger } : {}),
    ...(row.outcome !== "ok" && row.reason ? { error: row.reason } : {}),
  };
}

export const siteBuild: Hono<Env> = new Hono<Env>().get("/", async (c) => {
  const siteId = param(c, "siteId");
  if (!(await c.get("store").getSite(siteId))) throw notFound("site not found");
  const service = c.get("siteBuild");
  const audit = c.get("audit");
  if (!service || service.siteId !== siteId || !audit)
    return c.json({ enabled: false } satisfies SiteBuildStatus);
  const [row] = await audit.list({ siteId, tool: SITE_BUILD_TOOL, limit: 1 });
  return c.json({
    enabled: true,
    state: service.state(),
    last: lastOf(row),
  } satisfies SiteBuildStatus);
});
