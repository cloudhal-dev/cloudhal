import {
  defaultScopes,
  type OwnershipResolver,
  PEOPLE_ONLY_OWNERSHIP,
  PolicyEngine,
  type Principal,
} from "@cloudhal/agent-runtime";
import { ANALYTICS_OFF } from "@cloudhal/analytics/service";
import { type SchedulesDeps, schedulesAvailable } from "@cloudhal/mcp-server/schedules";
import { defineTools, toolPolicies } from "@cloudhal/mcp-server/tools";
import { type Context, Hono } from "hono";
import { type BuildHub, createBuildHub } from "./build.ts";
import type { ApiDeps, Env } from "./context.ts";
import { errorHandler } from "./errors.ts";
import { mountMcp } from "./mcp-mount.ts";
import { fencedOauthPath, mountClientRegistration, mountOauthServer } from "./oauth-server.ts";
import { PLAYGROUND_PRINCIPAL, playgroundGuard } from "./playground.ts";
import { activity, deploymentActivity } from "./routes/activity.ts";
import { mountAdmin } from "./routes/admin-mount.ts";
import { agentKeys } from "./routes/agent-keys.ts";
import { aiRoutes } from "./routes/ai.ts";
import { analytics } from "./routes/analytics.ts";
import { approvals } from "./routes/approvals.ts";
import { assets, siteMedia } from "./routes/assets.ts";
import { blockTypes } from "./routes/block-types.ts";
import { chrome } from "./routes/chrome.ts";
import { collections } from "./routes/collections.ts";
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
import { meHandler } from "./routes/me.ts";
import { memberRoutes } from "./routes/members.ts";
import { menus } from "./routes/menus.ts";
import { migrations } from "./routes/migrations.ts";
import { notificationRoutes } from "./routes/notifications.ts";
import { pages } from "./routes/pages.ts";
import { passwordResetRoutes } from "./routes/password-reset.ts";
import { previewLinks } from "./routes/preview-links.ts";
import { projects } from "./routes/projects.ts";
import { proposals } from "./routes/proposals.ts";
import { redirects } from "./routes/redirects.ts";
import { scheduleRoutes, schedulerRoute } from "./routes/schedules.ts";
import { siteSearch } from "./routes/search.ts";
import { siteBuild } from "./routes/site-build.ts";
import { sites } from "./routes/sites.ts";
import { snapshots } from "./routes/snapshots.ts";
import { taxonomies } from "./routes/taxonomies.ts";
import { terms } from "./routes/terms.ts";
import { themeSettings } from "./routes/theme-settings.ts";
import { glossary, translations } from "./routes/translations.ts";
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
  // RFC-0040: the collection registry.
  ["collections", collections],
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
  // RFC-0033 §8: language versions, reviews and the glossary.
  ["translations", translations],
  ["glossary", glossary],
  ["migrations", migrations],
  // RFC-0029 §7: the command palette's search over the site's own nodes, drafts included.
  ["search", siteSearch],
  // RFC-0003 §5: navigation menus.
  ["menus", menus],
  // RFC-0004 §6.1: the media library.
  ["assets", assets],
  ["media", siteMedia],
  // #150: the self-hosted static site's rebuild on publish (`enabled: false` elsewhere).
  ["site-build", siteBuild],
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

  // RFC-0036 §5: a playground refuses blocked routes before anything else runs.
  const playground = deps.playground;
  if (playground) app.use("*", playgroundGuard(playground));

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

  // RFC-0020 §6: page changes for Studio's Build view (MCP tools and Studio saves report here).
  const build = deps.build ?? createBuildHub(deps.now);
  const trusted = new Set(deps.trustedOrigins ?? []);
  app.use("/api/*", csrfGuard(trusted)); // CSRF for cookie-carrying writes

  const shared: SharedContext = { build, ownership, policy, defer, clock, uploadSecret, schedules };
  app.use("*", async (c, next) => {
    setContext(c, deps, shared);
    // The fenced Better Auth endpoints never reach credential resolution.
    // Raw and decoded: whichever form Better Auth or Hono would dispatch on is fenced.
    if (fencedAuthPath(new URL(c.req.url).pathname, deps) || fencedAuthPath(c.req.path, deps))
      return c.json({ error: "not_found", message: "not found" }, 404);
    const principal = await resolvePrincipal(c, deps);
    c.set("principal", principal);
    c.set("actor", principal?.actor);
    await next();
  });

  // Default-deny REST (RFC-0005 I15): every route declares its requirement in `ROUTE_SCOPES`.
  const membership = Boolean(deps.staff || playground); // a playground is checked like a role
  app.use("/api/*", routeGuard({ requireAuth, membership }));

  // API answers are per person and change with every write: a GET without its own caching header
  // says `no-store`, because Workers Cache was seen caching header-less GET answers (RFC-0008 §13).
  app.use("/api/*", async (c, next) => {
    await next();
    if ((c.req.method === "GET" || c.req.method === "HEAD") && !c.res.headers.has("cache-control"))
      c.res.headers.set("cache-control", "no-store");
  });

  const problems = mountAdmin(app, deps);
  app.get("/api/health", (c) => c.json(problems.length ? { ok: true, problems } : { ok: true }));
  mountAuthHandler(app, deps);

  app.get("/api/me", meHandler(membership));

  // RFC-0044 §1: with `mcp.oauth`, the route also serves OAuth discovery.
  if (deps.mcp) mountMcp(app, { ...deps, mcp: deps.mcp }, { build, ownership, schedules });

  if (deps.agentKeys) app.route("/api/agent-keys", agentKeys(deps.agentKeys));
  // RFC-0044 Phase 2: the authorization server's metadata, consent and connections.
  if (deps.oauthServer) mountOauthServer(app, deps.oauthServer);

  app.route(
    "/api",
    instanceRoutes(
      async () => ({
        signUp: deps.signUp ?? "unknown",
        features: {
          agentKeys: Boolean(deps.agentKeys),
          mcp: Boolean(deps.mcp),
          ...oauthFeatures(deps),
          activity: Boolean(deps.audit ?? deps.mcp?.audit),
          previewLinks: Boolean(deps.preview),
          deployTransfer: Boolean(deps.admin) && problems.length === 0,
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
          ...(playground ? { playground: await playground.info() } : {}), // RFC-0036 §5
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
  app.route("/api/sites", sites).route("/api/projects", projects);
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

/**
 * RFC-0044: whether remote MCP clients connect by URL (OAuth), and how: the `/mcp` resource they
 * are given and which registrations work here (Studio's "Connect by URL" notes, §11).
 */
function oauthFeatures(deps: ApiDeps) {
  const server = deps.oauthServer;
  const on = Boolean(server && deps.mcp?.oauth);
  return {
    mcpOauth: on,
    ...(on && server
      ? { mcpOauthClients: { resource: server.resource, ...server.registration } }
      : {}),
  };
}

/** Better Auth paths HTTP callers never reach (raw and decoded forms are both checked). */
function fencedAuthPath(path: string, deps: ApiDeps): boolean {
  const open = { register: Boolean(deps.oauthServer?.register) };
  return FENCED_AUTH_PATHS.test(path) || fencedOauthPath(path, open);
}

/** Better Auth's routes; RFC-0044 §3: DCR is Cloudhal's route, ahead of the catch-all. */
function mountAuthHandler(app: Hono<Env>, deps: ApiDeps): void {
  if (deps.oauthServer?.register) mountClientRegistration(app, deps.oauthServer.register);
  const handler = deps.authHandler;
  if (handler) app.on(["GET", "POST"], "/api/auth/*", (c) => handler(c.req.raw));
}

/**
 * CSRF: state-changing requests that may carry a session cookie must come from this origin (or a
 * trusted one). Better Auth checks its own routes; /api/admin uses a bearer token, not cookies.
 */
function csrfGuard(trusted: ReadonlySet<string>) {
  return async (c: Context<Env>, next: () => Promise<void>) => {
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
  };
}

/** What `createApi` builds once and every request reads next to its `ApiDeps`. */
interface SharedContext {
  readonly build: BuildHub;
  readonly ownership: OwnershipResolver;
  readonly policy: () => PolicyEngine;
  readonly defer: (task: Promise<unknown>) => void;
  readonly clock: () => Date;
  readonly uploadSecret: UploadSecret;
  readonly schedules: SchedulesDeps | undefined;
}

/** The per-request variables (`Env["Variables"]`) every route reads. */
function setContext(c: Context<Env>, deps: ApiDeps, shared: SharedContext): void {
  c.set("store", deps.store);
  c.set("build", shared.build);
  c.set("audit", deps.audit ?? deps.mcp?.audit);
  c.set("previewSecret", deps.preview?.secret);
  c.set("approvals", deps.mcp?.approvals);
  c.set("agentKeys", deps.agentKeys);
  c.set("staff", deps.staff);
  c.set("ownership", shared.ownership);
  c.set("policy", shared.policy);
  c.set("mail", deps.mail);
  c.set("defer", shared.defer);
  c.set("now", shared.clock);
  c.set("uploadSecret", shared.uploadSecret);
  c.set("analytics", deps.analytics);
  c.set("comments", deps.comments);
  c.set("schedules", shared.schedules);
  c.set("scheduler", deps.scheduler);
  c.set("siteBuild", deps.siteBuild);
  // #165: where rate limits read the client's address (`ApiDeps.clientAddressHeader`).
  c.set("clientAddressHeader", deps.clientAddressHeader);
}

/** Who is calling: the playground's one principal (RFC-0036 §5), else the deployment's resolver. */
async function resolvePrincipal(c: Context<Env>, deps: ApiDeps): Promise<Principal | undefined> {
  if (deps.playground) return PLAYGROUND_PRINCIPAL;
  if (deps.resolvePrincipal) return deps.resolvePrincipal(c);
  const actor = deps.resolveActor ? await deps.resolveActor(c) : undefined;
  return actor ? { actor, scopes: defaultScopes(actor) } : undefined;
}

export type CloudhalApi = ReturnType<typeof createApi>;
