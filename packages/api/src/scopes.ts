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

  // deployment
  ["GET", "/api/instance", "member"],
  ["GET", "/api/skills", "member"],
  ["GET", "/api/notifications", "member"],
  ["GET", "/api/activity", "audit:read"],

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
  ["POST", "/api/password-reset/inspect", "public"],
  ["POST", "/api/password-reset/complete", "public"],

  // sites
  ["GET", "/api/sites", "site:read"],
  ["GET", S, "site:read"],
  ["PUT", S, "site:settings"],
  ["GET", `${S}/pages`, "content:read"],
  ["POST", `${S}/pages`, "content:write"],
  ["GET", `${S}/pages/:pageId/preview`, "content:read"],
  ["GET", `${S}/pages/:pageId`, "content:read"],
  ["PUT", `${S}/pages/:pageId`, "content:write"],
  ["DELETE", `${S}/pages/:pageId`, "content:write"],
  ["GET", `${S}/entries`, "content:read"],
  ["POST", `${S}/entries`, "content:draft:own"],
  ["GET", `${S}/entries/:entryId/preview`, "content:read"],
  ["GET", `${S}/entries/:entryId`, "content:read"],
  ["PUT", `${S}/entries/:entryId`, "content:draft:own"],
  ["DELETE", `${S}/entries/:entryId`, "content:draft:own"],
  ["GET", `${S}/snapshots`, "site:read"],
  ["POST", `${S}/snapshots`, "content:draft:own"],
  ["GET", `${S}/snapshots/:snapshotId`, "site:read"],
  ["GET", `${S}/snapshots/:snapshotId/diff/:otherId`, "site:read"],
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
    const path = new URL(c.req.url).pathname;
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
