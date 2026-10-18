import {
  abilities,
  defaultScopes,
  invitableRoles,
  type OwnershipResolver,
  PEOPLE_ONLY_OWNERSHIP,
  PolicyEngine,
} from "@cloudhal/agent-runtime";
import { ANALYTICS_OFF } from "@cloudhal/analytics/service";
import { createCloudhalMcpHandler } from "@cloudhal/mcp-server/http";
import { schedulesAvailable } from "@cloudhal/mcp-server/schedules";
import { defineTools, toolPolicies } from "@cloudhal/mcp-server/tools";
import { Hono } from "hono";
import { createBuildHub } from "./build.ts";
import type { ApiDeps, Env } from "./context.ts";
import { errorHandler, unauthorized } from "./errors.ts";
import { activity, deploymentActivity } from "./routes/activity.ts";
import { adminRoutes } from "./routes/admin.ts";
import { agentKeys } from "./routes/agent-keys.ts";
import { aiRoutes } from "./routes/ai.ts";
import { analytics } from "./routes/analytics.ts";
import { approvals } from "./routes/approvals.ts";
import { assets, siteMedia } from "./routes/assets.ts";
import { blockTypes } from "./routes/block-types.ts";
import { chrome } from "./routes/chrome.ts";
import { comments } from "./routes/comments.ts";
import { design } from "./routes/design.ts";
import { entries } from "./routes/entries.ts";
import {
  agentModesInfo,
  commentsFeature,
  gatesEnforcedEverywhere,
  instanceRoutes,
  invitesInfo,
  rolesInfo,
  schedulesFeature,
} from "./routes/instance.ts";
import { inviteRoutes } from "./routes/invites.ts";
import { memberRoutes } from "./routes/members.ts";
import { menus } from "./routes/menus.ts";
import { migrations } from "./routes/migrations.ts";
import { notificationRoutes } from "./routes/notifications.ts";
import { pages } from "./routes/pages.ts";
import { passwordResetRoutes } from "./routes/password-reset.ts";
import { previewLinks } from "./routes/preview-links.ts";
import { proposals } from "./routes/proposals.ts";
import { redirects } from "./routes/redirects.ts";
import { scheduleRoutes, schedulerRoute } from "./routes/schedules.ts";
import { siteSearch } from "./routes/search.ts";
import { sites } from "./routes/sites.ts";
import { snapshots } from "./routes/snapshots.ts";
import { taxonomies } from "./routes/taxonomies.ts";
import { terms } from "./routes/terms.ts";
import { themeSettings } from "./routes/theme-settings.ts";
import { routeGuard } from "./scopes.ts";
import { randomUploadSecret, type UploadSecret } from "./uploads.ts";

/**
 * Better Auth endpoints that are only used server-side: membership changes go through Cloudhal's
 * audited routes (RFC-0005 I3), and agent keys through `/api/agent-keys` (role caps, I5/I6).
 */
const FENCED_AUTH_PATHS = /^\/api\/auth\/(organization|admin|api-key)(\/|$)/;

/**
 * The site's REST areas for people (agents use the MCP tools), each under
 * `/api/sites/:siteId/<area>`; their requirements are in `ROUTE_SCOPES`.
 */
const SITE_AREAS: readonly (readonly [string, Hono<Env>])[] = [
  ["pages", pages],
  ["entries", entries],
  ["proposals", proposals],
  // RFC-0015: the block registry (built-ins and the theme's types).
  ["block-types", blockTypes],
  ["theme-settings", themeSettings],
  ["chrome", chrome],
  // RFC-0021: the site's design rules (DESIGN.md).
  ["design", design],
  ["snapshots", snapshots],
  ["activity", activity],
  ["preview-links", previewLinks],
  ["approvals", approvals],
  // RFC-0002 §6.1: taxonomy, terms, redirects and the tags migration.
  ["taxonomies", taxonomies],
  ["terms", terms],
  ["redirects", redirects],
  ["migrations", migrations],
  // RFC-0029 §7: the command palette's search over the site's own nodes, drafts included.
  ["search", siteSearch],
  // RFC-0003 §5: navigation menus.
  ["menus", menus],
  // RFC-0004 §6.1: the media library.
  ["assets", assets],
  ["media", siteMedia],
];

/**
 * Builds the Cloudhal API as a Hono app (a `fetch` handler). The same app runs on Node
 * (`@hono/node-server`) and on Cloudflare Workers.
 */
export function createApi(deps: ApiDeps) {
  const requireAuth = deps.requireAuth ?? true;
  const app = new Hono<Env>();
  app.onError(errorHandler);
  const clock = deps.now ?? (() => new Date());
  const defer =
    deps.defer ??
    ((task: Promise<unknown>) => {
      task.catch(() => {});
    });
  const ownership: OwnershipResolver = deps.staff?.ownership ?? PEOPLE_ONLY_OWNERSHIP;
  // Upload tickets (RFC-0004 §5.5) are signed with a secret every instance shares when there is
  // one; a server without one (local tools) signs with a key of its own process.
  const uploadSecret: UploadSecret =
    [deps.preview?.secret, deps.mcp?.stateKey].find(
      (s): s is string | Uint8Array =>
        s !== undefined &&
        (typeof s === "string" ? new TextEncoder().encode(s) : s).byteLength >= 32,
    ) ?? randomUploadSecret();
  // RFC-0008: the schedule routes and tools use the deployment's ticker (`ApiDeps.scheduler`)
  // unless `schedules.scheduler` names another.
  const schedules =
    deps.schedules && !deps.schedules.scheduler && deps.scheduler
      ? { ...deps.schedules, scheduler: deps.scheduler }
      : deps.schedules;
  let engine: PolicyEngine | undefined;
  const policy = () => {
    engine ??= new PolicyEngine(toolPolicies(defineTools()));
    return engine;
  };

  // DNS rebinding: a server without auth (local scripts) only answers its own host names.
  if (deps.allowedHosts) {
    const allowed = new Set(deps.allowedHosts.map((h) => h.toLowerCase()));
    app.use("*", async (c, next) => {
      const host = new URL(c.req.url).hostname.toLowerCase();
      if (!allowed.has(host))
        return c.json({ error: "forbidden", message: `host ${host} is not allowed` }, 403);
      await next();
    });
  }

  // CSRF: state-changing requests that may carry a session cookie must come from this origin (or a
  // trusted one). Better Auth checks its own routes; /api/admin uses a bearer token, not cookies.
  // RFC-0020 §6: page changes for Studio's Build view (MCP tools and Studio saves report here).
  const build = deps.build ?? createBuildHub(deps.now);
  const trusted = new Set(deps.trustedOrigins ?? []);
  app.use("/api/*", async (c, next) => {
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
    if (path.startsWith("/api/auth/") || path.startsWith("/api/admin/")) return next();
    const origin = c.req.header("origin");
    const own = new URL(c.req.url).origin;
    const fetchSite = c.req.header("sec-fetch-site");
    const ok =
      origin !== undefined
        ? origin === own || trusted.has(origin)
        : fetchSite === undefined || fetchSite === "same-origin" || fetchSite === "none";
    if (!ok) return c.json({ error: "forbidden", message: "cross-origin request refused" }, 403);
    await next();
  });

  app.use("*", async (c, next) => {
    c.set("store", deps.store);
    c.set("build", build);
    c.set("audit", deps.audit ?? deps.mcp?.audit);
    c.set("previewSecret", deps.preview?.secret);
    c.set("approvals", deps.mcp?.approvals);
    c.set("agentKeys", deps.agentKeys);
    c.set("staff", deps.staff);
    c.set("ownership", ownership);
    c.set("policy", policy);
    c.set("mail", deps.mail);
    c.set("defer", defer);
    c.set("now", clock);
    c.set("uploadSecret", uploadSecret);
    c.set("analytics", deps.analytics);
    c.set("comments", deps.comments);
    c.set("schedules", schedules);
    c.set("scheduler", deps.scheduler);
    // The fenced Better Auth endpoints never reach credential resolution.
    // Raw and decoded: whichever form Better Auth or Hono would dispatch on is fenced.
    if (FENCED_AUTH_PATHS.test(new URL(c.req.url).pathname) || FENCED_AUTH_PATHS.test(c.req.path))
      return c.json({ error: "not_found", message: "not found" }, 404);
    if (deps.resolvePrincipal) {
      const principal = await deps.resolvePrincipal(c);
      c.set("principal", principal);
      c.set("actor", principal?.actor);
    } else {
      const actor = deps.resolveActor ? await deps.resolveActor(c) : undefined;
      c.set("actor", actor);
      c.set("principal", actor ? { actor, scopes: defaultScopes(actor) } : undefined);
    }
    await next();
  });

  // Default-deny REST (RFC-0005 I15): every route declares its requirement in `ROUTE_SCOPES`.
  app.use("/api/*", routeGuard({ requireAuth, membership: Boolean(deps.staff) }));

  // API answers are per person and change with every write: a GET without its own caching header
  // says `no-store`, because Workers Cache was seen caching header-less GET answers (RFC-0008 §13).
  app.use("/api/*", async (c, next) => {
    await next();
    if ((c.req.method === "GET" || c.req.method === "HEAD") && !c.res.headers.has("cache-control"))
      c.res.headers.set("cache-control", "no-store");
  });

  app.get("/api/health", (c) => c.json({ ok: true }));
  if (deps.authHandler) {
    const handler = deps.authHandler;
    app.on(["GET", "POST"], "/api/auth/*", (c) => handler(c.req.raw));
  }
  if (deps.admin) {
    if (deps.admin.deployToken.length < 32)
      throw new Error("admin.deployToken must be at least 32 characters");
    app.route(
      "/api/admin",
      adminRoutes(deps.admin.deployToken, deps.admin.storage, deps.ai?.transport, deps.mcp?.render),
    );
  }

  /**
   * Who is calling and what they may do (RFC-0005 §10.1): `role` (null without a membership),
   * `scopes`, the `can` ability map for UI gating (cosmetic, I16) and the roles they may invite.
   * Agents see their actor and their effective scopes.
   */
  app.get("/api/me", (c) => {
    const principal = c.get("principal");
    if (!principal) throw unauthorized();
    const membership = Boolean(deps.staff);
    const role = principal.person?.role ?? null;
    const person = principal.actor.kind !== "agent";
    return c.json({
      actor: principal.actor,
      role,
      member: !membership || role !== null,
      scopes: principal.scopes,
      ...(person
        ? {
            can: abilities(membership ? (role ?? "contributor") : undefined, principal.scopes),
            invitableRoles: membership
              ? role
                ? invitableRoles(role)
                : []
              : invitableRoles("owner"),
            ...(principal.person ? { userId: principal.person.userId } : {}),
          }
        : principal.person
          ? { person: { id: principal.person.id, role: principal.person.role } }
          : {}),
    });
  });

  if (deps.mcp) {
    const mcp = createCloudhalMcpHandler({
      store: deps.store,
      build,
      ...deps.mcp,
      previewSecret: deps.mcp.previewSecret ?? deps.preview?.secret,
      now: deps.now,
      ownership,
      analytics: deps.analytics,
      comments: deps.comments,
      schedules,
    });
    app.all("/mcp", async (c) => {
      // DNS-rebinding / cross-site protection: browsers send Origin; it must be this origin.
      const origin = c.req.header("origin");
      if (origin && origin !== new URL(c.req.url).origin)
        return c.json(
          { error: "forbidden", message: "cross-origin MCP requests are not allowed" },
          403,
        );
      const principal = c.get("principal");
      if (!principal) throw unauthorized();
      // A signed-in person without a membership has no scopes; refuse rather than list tools.
      if (deps.staff && principal.actor.kind === "human" && !principal.person)
        return c.json(
          { error: "not_a_member", message: "Your access was removed. Ask an administrator." },
          403,
        );
      return mcp.fetch(c.req.raw, principal);
    });
  }

  if (deps.agentKeys) app.route("/api/agent-keys", agentKeys(deps.agentKeys));

  app.route(
    "/api",
    instanceRoutes(
      async () => ({
        signUp: deps.signUp ?? "unknown",
        features: {
          agentKeys: Boolean(deps.agentKeys),
          mcp: Boolean(deps.mcp),
          activity: Boolean(deps.audit ?? deps.mcp?.audit),
          previewLinks: Boolean(deps.preview),
          deployTransfer: Boolean(deps.admin),
          approvals: Boolean(deps.mcp?.approvals),
          elevationRequests: Boolean(deps.mcp?.approvals && deps.agentKeys),
          members: Boolean(deps.staff),
          // RFC-0006 §8: where events go, whether Studio can read them, the budget.
          analytics: deps.analytics?.feature() ?? ANALYTICS_OFF,
          // RFC-0007 §12: whether comments are served, bot protections, purges waiting.
          comments: await commentsFeature(deps.comments),
          // RFC-0008 §13: whether schedules are served, the ticker, gates, the limits.
          // RFC-0016: how this deployment reaches Workers AI (the binding, REST, or not at all).
          ai: deps.ai?.transport?.kind ?? "none",
          schedules: schedulesFeature(
            schedules,
            schedulesAvailable(schedules) && (await gatesEnforcedEverywhere(deps.store)),
          ),
        },
        agentModes: agentModesInfo(),
        roles: rolesInfo(),
        invites: invitesInfo(Boolean(deps.mail)),
        passwordReset: deps.staff && deps.mail ? ["admin", "email"] : ["admin"],
      }),
      deps.mcp?.skills ?? [],
    ),
  );

  if (deps.staff) {
    const links = { studioOrigin: deps.studioOrigin, trustedOrigins: trusted };
    app.route("/api/members", memberRoutes(links));
    app.route("/api/invites", inviteRoutes(links));
    app.route("/api/password-reset", passwordResetRoutes(links));
  }
  app.route("/api/activity", deploymentActivity);
  app.route("/api/notifications", notificationRoutes(clock));
  app.route("/api/sites", sites);
  for (const [area, routes] of SITE_AREAS) app.route(`/api/sites/:siteId/${area}`, routes);
  // RFC-0016: in-editor AI settings, the model picker and commands.
  // RFC-0021 21c: Build chat renders with the same browser as `render_page`.
  app.route(
    "/api/sites/:siteId/ai",
    aiRoutes(deps.ai && deps.mcp?.render ? { ...deps.ai, render: deps.mcp.render } : deps.ai),
  );
  // RFC-0006 §9.2: site analytics (people; agents use the MCP analytics tools).
  if (deps.analytics) app.route("/api/sites/:siteId/analytics", analytics);
  // RFC-0007 §12: reader comments (people; agents use the MCP comment tools).
  if (deps.comments) app.route("/api/sites/:siteId", comments);
  // RFC-0008 §13: schedules (people; agents use the MCP schedule tools).
  if (schedules) {
    app.route("/api/sites/:siteId", scheduleRoutes);
    app.route("/api/scheduler", schedulerRoute);
  }

  app.notFound((c) =>
    c.json({ error: "not_found", message: `no route for ${c.req.method} ${c.req.path}` }, 404),
  );
  return app;
}

export type CloudhalApi = ReturnType<typeof createApi>;
