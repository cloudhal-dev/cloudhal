/**
 * REST is default-deny (RFC-0005 I15): every route declares what it requires here, and a request
 * to a route that is not declared is refused. `test/route-scopes.test.ts` fails for any route the
 * app mounts without a declaration.
 *
 * Requirements:
 * - `public` — anyone (health, Better Auth, invite and reset-link endpoints);
 * - `deploy-token` — the operator's bearer token, checked by the admin router;
 * - `signed-in` — any authenticated actor, agents included (`/api/me`, `/mcp`);
 * - `member` — a person with a membership (any role); handlers may check more;
 * - `owner` — the Owner;
 * - a scope — a person whose role holds it (`holds`, so stronger scopes count).
 *
 * Agents (API keys) are refused everywhere except `public`/`signed-in`: they work through MCP.
 */
import { holds, type Scope } from "@cloudhal/agent-runtime";
import { createMiddleware } from "hono/factory";
import type { Env } from "./context.ts";
import { apiError, missingScope, unauthorized } from "./errors.ts";

export type RouteRequirement = "public" | "deploy-token" | "signed-in" | "member" | "owner" | Scope;

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";

const S = "/api/sites/:siteId";
const T = `${S}/terms/:termId`;
const M = `${S}/menus`;
const A = `${S}/assets`;
const AN = `${S}/analytics`;
const CM = `${S}/comments`;
const RL = `${S}/releases/:releaseId`;
const AU = `${S}/automations`;

/** Every route of `createApi`, with what it requires. */
export const ROUTE_SCOPES: readonly (readonly [Method, string, RouteRequirement])[] = [
  ["GET", "/api/health", "public"],
  ["GET", "/api/auth/*", "public"],
  ["POST", "/api/auth/*", "public"],
  ["ALL", "/mcp", "signed-in"],
  ["GET", "/api/me", "signed-in"],

  // operator (deployment token)
  ["GET", "/api/admin/sites/:siteId/bundle", "deploy-token"],
  ["PUT", "/api/admin/sites/:siteId/bundle", "deploy-token"],
  ["PUT", "/api/admin/sites/:siteId/domains", "deploy-token"],
  // RFC-0004 §4.7: media bytes move before a bundle (GET also answers HEAD)
  ["GET", "/api/admin/sites/:siteId/media/:sha256", "deploy-token"],
  ["PUT", "/api/admin/sites/:siteId/media/:sha256", "deploy-token"],
  ["POST", "/api/admin/owner", "deploy-token"],
  // RFC-0008 §13: `cloudhal schedules status|list|run-due --remote` and the deploy's downgrade guard.
  ["GET", "/api/admin/schedules/status", "deploy-token"],
  ["POST", "/api/admin/schedules/run-due", "deploy-token"],
  ["GET", "/api/admin/sites/:siteId/schedules/releases", "deploy-token"],
  // RFC-0020 open question 7: `cloudhal ai build-eval --remote`
  ["POST", "/api/admin/sites/:siteId/ai/build-eval", "deploy-token"],
  // RFC-0021 21c: `cloudhal ai judge-check --remote`
  ["POST", "/api/admin/sites/:siteId/ai/judge-check", "deploy-token"],
  // RFC-0019 §3: `cloudhal search reindex --remote`
  ["POST", "/api/admin/sites/:siteId/search/reindex", "deploy-token"],
  // RFC-0006 §7.5: analytics backfill and the operator's status and export
  ["POST", "/api/admin/sites/:siteId/analytics/rollup", "deploy-token"],
  ["GET", "/api/admin/sites/:siteId/analytics/status", "deploy-token"],
  ["GET", "/api/admin/sites/:siteId/analytics/export", "deploy-token"],
  // RFC-0007 §12, §15.4: `cloudhal comments status|export|import --remote`
  ["GET", "/api/admin/sites/:siteId/comments/status", "deploy-token"],
  ["GET", "/api/admin/sites/:siteId/comments/export", "deploy-token"],
  ["POST", "/api/admin/sites/:siteId/comments/import", "deploy-token"],

  // deployment
  ["GET", "/api/instance", "member"],
  ["GET", "/api/skills", "member"],
  ["GET", "/api/notifications", "member"],
  ["GET", "/api/activity", "audit:read"],
  // RFC-0008 §8.7: mode, last tick, next wake, 7-day lag, healthy
  ["GET", "/api/scheduler", "signed-in"],

  // agent keys: own keys for every member; others' keys need agents:manage (checked in the service)
  ["GET", "/api/agent-keys", "member"],
  ["POST", "/api/agent-keys", "member"],
  ["PATCH", "/api/agent-keys/:id", "member"],
  ["DELETE", "/api/agent-keys/:id", "member"],
  ["POST", "/api/agent-keys/:id/elevation", "member"],
  ["DELETE", "/api/agent-keys/:id/elevation", "member"],

  // members, invites, password resets (RFC-0005 §10.1)
  ["GET", "/api/members", "member"],
  ["PATCH", "/api/members/:userId", "members:manage"],
  ["DELETE", "/api/members/:userId", "members:manage"],
  ["POST", "/api/members/transfer-ownership", "owner"],
  ["POST", "/api/members/:userId/password-reset", "members:manage"],
  ["GET", "/api/invites", "members:invite"],
  ["POST", "/api/invites", "members:invite"],
  ["DELETE", "/api/invites/:id", "members:invite"],
  ["POST", "/api/invites/inspect", "public"],
  ["POST", "/api/invites/accept", "public"],
  ["POST", "/api/password-reset/request", "public"],
  ["POST", "/api/password-reset/inspect", "public"],
  ["POST", "/api/password-reset/complete", "public"],

  // sites
  ["GET", "/api/sites", "site:read"],
  ["GET", S, "site:read"],
  ["PUT", S, "site:settings"],
  ["GET", `${S}/pages`, "content:read"],
  ["POST", `${S}/pages`, "content:write"],
  ["GET", `${S}/pages/:pageId/preview`, "content:read"],
  // the editors' draft previews: the unsaved form rendered, nothing written (RFC-0014 phase 1c)
  ["POST", `${S}/pages/:pageId/preview`, "content:read"],
  ["GET", `${S}/pages/:pageId`, "content:read"],
  // RFC-0020 §6: Studio's Build view follows a page's changes (server-sent events).
  ["GET", `${S}/pages/:pageId/build/events`, "content:read"],
  ["PUT", `${S}/pages/:pageId`, "content:write"],
  ["DELETE", `${S}/pages/:pageId`, "content:write"],
  // RFC-0014 §4: block operations on a page's markdown rich-text section
  ["PATCH", `${S}/pages/:pageId/sections/:sectionId/body`, "content:write"],
  ["GET", `${S}/entries`, "content:read"],
  ["POST", `${S}/entries`, "content:draft:own"],
  ["GET", `${S}/entries/:entryId/preview`, "content:read"],
  ["POST", `${S}/entries/:entryId/preview`, "content:read"],
  ["GET", `${S}/entries/:entryId`, "content:read"],
  ["PUT", `${S}/entries/:entryId`, "content:draft:own"],
  ["DELETE", `${S}/entries/:entryId`, "content:draft:own"],
  // RFC-0014 §4: block operations on an article body (own limits in the handler)
  ["PATCH", `${S}/entries/:entryId/body`, "content:draft:own"],
  // RFC-0014 body proposals: anyone who reads content sees them; deciding is an entry update
  // (own limits in the handler) or, for page sections, full content:write
  ["GET", `${S}/proposals`, "content:read"],
  ["POST", `${S}/proposals/:proposalId/preview`, "content:read"],
  // RFC-0015: the block registry, for Studio's section menu and forms
  ["GET", `${S}/block-types`, "content:read"],
  ["GET", `${S}/theme-settings`, "content:read"],
  ["PUT", `${S}/theme-settings`, "site:settings"],
  // RFC-0021: the site's design rules
  ["GET", `${S}/design`, "content:read"],
  ["PUT", `${S}/design`, "site:settings"],
  // RFC-0016: in-editor AI — everyone who reads content sees whether it is on; Administrators
  // change it; commands need ai:invoke (every role holds it; the site's switch and cap limit it)
  ["GET", `${S}/ai/settings`, "content:read"],
  ["PUT", `${S}/ai/settings`, "site:settings"],
  ["GET", `${S}/ai/models`, "site:settings"],
  ["POST", `${S}/ai/commands`, "ai:invoke"],
  // RFC-0020 §6: Studio's Build chat changes a page draft (and counts as an AI command).
  ["POST", `${S}/ai/build/:pageId`, "content:write"],
  ["POST", `${S}/proposals/:proposalId/accept`, "content:draft:own"],
  ["POST", `${S}/proposals/:proposalId/reject`, "content:draft:own"],
  ["GET", `${S}/snapshots`, "site:read"],
  ["POST", `${S}/snapshots`, "content:draft:own"],
  ["GET", `${S}/snapshots/:snapshotId`, "site:read"],
  ["GET", `${S}/snapshots/:snapshotId/diff/:otherId`, "site:read"],
  // a node's content in a snapshot (drafts included), for body diffs: content readers only
  ["GET", `${S}/snapshots/:snapshotId/nodes/:nodeId`, "content:read"],
  ["POST", `${S}/snapshots/:snapshotId/publish`, "site:publish:own"],
  ["POST", `${S}/snapshots/:snapshotId/rollback`, "site:rollback"],
  ["GET", `${S}/activity`, "member"],
  ["POST", `${S}/preview-links`, "preview:create"],
  ["GET", `${S}/approvals`, "member"],
  ["POST", `${S}/approvals/:approvalId/:decision`, "member"],
  ["GET", `${S}/taxonomies`, "site:read"],
  ["POST", `${S}/taxonomies`, "site:write"],
  ["GET", `${S}/taxonomies/:taxonomyId`, "site:read"],
  ["PUT", `${S}/taxonomies/:taxonomyId`, "site:write"],
  ["GET", `${S}/terms`, "content:read"],
  ["POST", `${S}/terms`, "content:draft:own"],
  // the term editor's archive preview: saved (GET) or the unsaved draft (POST); writes nothing
  ["GET", `${T}/preview`, "content:read"],
  ["POST", `${T}/preview`, "content:read"],
  ["GET", T, "content:read"],
  ["PUT", T, "content:write"],
  ["POST", `${T}/rename`, "site:write"],
  ["POST", `${T}/merge`, "site:write"],
  ["POST", `${T}/retire`, "site:write"],
  ["POST", `${T}/parent`, "site:write"],
  ["POST", `${T}/visibility`, "site:write"],
  ["POST", `${T}/review`, "site:write"],
  ["GET", `${S}/redirects`, "site:read"],
  ["POST", `${S}/redirects`, "site:write"],
  ["GET", `${S}/redirects/:redirectId`, "site:read"],
  ["PUT", `${S}/redirects/:redirectId`, "site:write"],
  ["DELETE", `${S}/redirects/:redirectId`, "site:write"],
  // navigation menus (RFC-0003 §5): reads site:read, writes site:write (Editor and above, ADR-0019)
  ["GET", M, "site:read"],
  ["POST", M, "site:write"],
  ["POST", `${M}/from-pages`, "site:write"],
  ["POST", `${M}/preview`, "site:read"],
  ["GET", `${M}/references`, "site:read"],
  ["GET", `${M}/:menuId`, "site:read"],
  ["PUT", `${M}/:menuId`, "site:write"],
  ["DELETE", `${M}/:menuId`, "site:write"],
  ["GET", `${M}/:menuId/resolve`, "site:read"],
  ["POST", `${M}/:menuId/ops`, "site:write"],
  // media library (RFC-0004 §6.1, ADR-0020): reads site:read; uploads and edits of one's own
  // uploads asset:upload (the handler checks "own"); status changes and deletes asset:manage;
  // takedown and lifting it the Owner (§4.6), audited
  ["GET", A, "site:read"],
  ["POST", `${A}/uploads`, "asset:upload"],
  ["PUT", `${A}/uploads/:uploadId`, "asset:upload"],
  ["GET", `${A}/:assetId`, "site:read"],
  ["GET", `${A}/:assetId/content`, "site:read"],
  ["PUT", `${A}/:assetId`, "asset:upload"],
  ["POST", `${A}/:assetId/retire`, "asset:manage"],
  ["POST", `${A}/:assetId/restore`, "asset:manage"],
  ["DELETE", `${A}/:assetId`, "asset:manage"],
  ["POST", `${A}/:assetId/purge`, "owner"],
  ["POST", `${S}/media/:sha256/lift-purge`, "owner"],
  // site analytics (RFC-0006 §9.2): aggregates without personal data for Authors and above;
  // settings (privacy decisions, outside the graph) for Administrators, audited
  ["GET", `${AN}/status`, "analytics:read"],
  ["GET", `${AN}/summary`, "analytics:read"],
  ["GET", `${AN}/bots`, "analytics:read"],
  ["GET", `${AN}/series`, "analytics:read"],
  ["GET", `${AN}/top/:dimension`, "analytics:read"],
  ["GET", `${AN}/vitals`, "analytics:read"],
  ["GET", `${AN}/renders/:report`, "analytics:read"],
  ["GET", `${AN}/nodes/:nodeId`, "analytics:read"],
  ["GET", `${AN}/export`, "analytics:read"],
  ["GET", `${AN}/settings`, "analytics:read"],
  ["PUT", `${AN}/settings`, "site:settings"],
  // reader comments (RFC-0007 §12): the queue for Authors and above, moderation and replies on
  // one's own entries (the handler checks "own"), deletes, exports, bans and the last-resort purge
  // for Editors and above, commenter emails and erasure person-only (commenters:data), settings
  // for Administrators
  ["GET", CM, "comments:read"],
  ["GET", `${CM}/summary`, "comments:read"],
  ["GET", `${CM}/reports`, "comments:moderate:own"],
  ["POST", `${CM}/reports/:reportId/resolve`, "comments:moderate:own"],
  ["GET", `${CM}/export`, "comments:moderate"],
  ["GET", `${CM}/settings`, "comments:read"],
  ["PUT", `${CM}/settings`, "site:settings"],
  ["PUT", `${CM}/settings/secrets/:name`, "site:settings"],
  ["DELETE", `${CM}/settings/secrets/:name`, "site:settings"],
  ["POST", `${CM}/moderate`, "comments:moderate:own"],
  ["POST", `${CM}/erase`, "commenters:data"],
  ["POST", `${CM}/purge-site-cache`, "comments:moderate"],
  ["GET", `${CM}/:commentId`, "comments:read"],
  ["PATCH", `${CM}/:commentId/labels`, "comments:moderate:own"],
  ["POST", `${CM}/:commentId/replies`, "comments:reply:own"],
  ["PATCH", `${CM}/:commentId`, "comments:reply:own"],
  ["DELETE", `${CM}/:commentId`, "comments:moderate"],
  ["GET", `${S}/comment-threads/:nodeId`, "comments:read"],
  ["PUT", `${S}/comment-threads/:nodeId`, "comments:moderate:own"],
  ["POST", `${S}/commenters/lookup`, "commenters:data"], // {email} | {commentId}: no email in URLs
  ["GET", `${S}/commenters/:commenterId`, "commenters:data"],
  ["POST", `${S}/commenters/:commenterId/export`, "commenters:data"],
  ["POST", `${S}/commenters/:commenterId/erase`, "commenters:data"],
  ["GET", `${S}/comment-bans`, "comments:moderate"],
  ["POST", `${S}/comment-bans`, "comments:moderate"],
  ["DELETE", `${S}/comment-bans/:banId`, "comments:moderate"],
  // schedules (RFC-0008 §13): reads for everyone with schedules:read; releases and gates of one's
  // own work with schedules:write:own (handlers check "own" and who may approve: own approval
  // when the role allows it, else a request); "Publish now" with releases:publish:own; lifting an
  // embargo is Editor and above (the handler checks releases:publish, D8); automations people-only
  // (automations:manage, D7); the kill switch and daily cap site:settings
  ["GET", `${S}/schedule`, "schedules:read"],
  ["GET", `${S}/releases`, "schedules:read"],
  ["POST", `${S}/releases`, "schedules:write:own"],
  ["GET", RL, "schedules:read"],
  ["GET", `${RL}/diff`, "schedules:read"],
  ["PATCH", RL, "schedules:write:own"],
  ["POST", `${RL}/items`, "schedules:write:own"],
  ["POST", `${RL}/schedule`, "schedules:write:own"],
  ["POST", `${RL}/reschedule`, "schedules:write:own"],
  ["POST", `${RL}/repin`, "schedules:write:own"],
  ["POST", `${RL}/unschedule`, "schedules:write:own"],
  ["POST", `${RL}/cancel`, "schedules:write:own"],
  ["POST", `${RL}/publish-now`, "releases:publish:own"],
  ["POST", `${S}/gates`, "schedules:write:own"],
  ["POST", `${S}/gates/:nodeId/lift`, "releases:publish:own"],
  ["GET", AU, "schedules:read"],
  ["POST", AU, "automations:manage"],
  ["POST", `${AU}/preview-rule`, "schedules:read"],
  ["GET", `${AU}/:automationId`, "schedules:read"],
  ["PATCH", `${AU}/:automationId`, "automations:manage"],
  ["POST", `${AU}/:automationId/pause`, "automations:manage"],
  ["POST", `${AU}/:automationId/resume`, "automations:manage"],
  ["POST", `${AU}/:automationId/run-now`, "automations:manage"],
  ["DELETE", `${AU}/:automationId`, "automations:manage"],
  ["GET", `${S}/runs`, "schedules:read"],
  ["GET", `${S}/runs/:runId`, "schedules:read"],
  ["GET", `${S}/schedule-settings`, "schedules:read"],
  ["PUT", `${S}/schedule-settings`, "site:settings"],
  ["POST", `${S}/migrations/tags-to-terms`, "site:settings"],
  ["POST", `${S}/migrations/tags-to-terms/revert`, "site:settings"],
];

function matches(pattern: string, path: string): boolean {
  const p = pattern.split("/");
  const s = path.replace(/\/+$/, "").split("/");
  for (let i = 0; i < p.length; i++) {
    const part = p[i] as string;
    if (part === "*") return s.length > i;
    if (i >= s.length) return false;
    if (part.startsWith(":")) {
      if (!s[i]) return false;
      continue;
    }
    if (part !== s[i]) return false;
  }
  return p.length === s.length;
}

/** Literal segments first, so `/members/transfer-ownership` wins over `/members/:userId`. */
const SPECIFICITY = [...ROUTE_SCOPES].sort((a, b) => {
  const score = (path: string) =>
    path.split("/").filter((x) => x && !x.startsWith(":") && x !== "*").length;
  return score(b[1]) - score(a[1]);
});

/** What a request to `method path` requires, or undefined when no route is declared. */
export function requirementFor(method: string, path: string): RouteRequirement | undefined {
  const m = method === "HEAD" ? "GET" : method;
  for (const [rm, pattern, req] of SPECIFICITY)
    if ((rm === "ALL" || rm === m) && matches(pattern, path)) return req;
  return undefined;
}

/**
 * Enforces `ROUTE_SCOPES` on `/api/*` once the principal is resolved. `membership` says whether
 * people's scopes come from roles (a `StaffService` is configured); without it people are `*`.
 */
export function routeGuard(options: { requireAuth: boolean; membership: boolean }) {
  return createMiddleware<Env>(async (c, next) => {
    // The path the router dispatches on (percent-decoded), not the raw URL: `/comments/%65xport`
    // routes to `/comments/export`, so it must not be checked as `/comments/:commentId`.
    const path = c.req.path;
    const req = requirementFor(c.req.method, path);
    // Default-deny: an undeclared route does not exist.
    if (!req)
      return c.json({ error: "not_found", message: `no route for ${c.req.method} ${path}` }, 404);
    if (req === "public" || req === "deploy-token") return next();
    const principal = c.get("principal");
    const actor = principal?.actor;
    if (!actor) {
      if (!options.requireAuth) return next();
      throw unauthorized();
    }
    if (req === "signed-in") return next();
    // Agents work through the MCP endpoint only, where the policy engine, approvals, snapshots and
    // audit apply; the REST API is for people (Studio) and would otherwise give any key a
    // person's powers.
    if (actor.kind === "agent")
      return c.json(
        {
          error: "forbidden",
          message: "agent keys work through the MCP endpoint (/mcp), not the REST API",
        },
        403,
      );
    if (!options.membership) return next();
    const person = principal.person;
    if (!person)
      throw apiError(
        403,
        "not_a_member",
        "Your access was removed. Ask an administrator for a new invite.",
      );
    if (req === "member") return next();
    if (req === "owner") {
      if (person.role !== "owner") throw apiError(403, "owner_only", "only the Owner can do this");
      return next();
    }
    if (!holds(principal.scopes, req)) throw missingScope(req);
    return next();
  });
}
