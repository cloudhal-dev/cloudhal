import { defaultScopes } from "@cloudhal/agent-runtime";
import { createCloudhalMcpHandler } from "@cloudhal/mcp-server/http";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { ApiDeps, Env } from "./context.ts";
import { errorHandler, unauthorized } from "./errors.ts";
import { activity } from "./routes/activity.ts";
import { adminRoutes } from "./routes/admin.ts";
import { agentKeys } from "./routes/agent-keys.ts";
import { entries } from "./routes/entries.ts";
import { instanceRoutes } from "./routes/instance.ts";
import { pages } from "./routes/pages.ts";
import { previewLinks } from "./routes/preview-links.ts";
import { sites } from "./routes/sites.ts";
import { snapshots } from "./routes/snapshots.ts";

/**
 * Builds the Cloudhal API as a Hono app (a `fetch` handler). The same app runs on Node
 * (`@hono/node-server`) and on Cloudflare Workers.
 */
export function createApi(deps: ApiDeps) {
  const requireAuth = deps.requireAuth ?? true;
  const app = new Hono<Env>();
  app.onError(errorHandler);

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
    c.set("audit", deps.audit ?? deps.mcp?.audit);
    c.set("previewSecret", deps.preview?.secret);
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

  app.get("/api/health", (c) => c.json({ ok: true }));
  if (deps.authHandler) {
    const handler = deps.authHandler;
    app.on(["GET", "POST"], "/api/auth/*", (c) => handler(c.req.raw));
  }
  if (deps.admin) {
    if (deps.admin.deployToken.length < 32)
      throw new Error("admin.deployToken must be at least 32 characters");
    app.route("/api/admin", adminRoutes(deps.admin.deployToken, deps.admin.storage));
  }

  app.get("/api/me", (c) => {
    const actor = c.get("actor");
    if (!actor) throw unauthorized();
    return c.json({ actor });
  });

  // Everything below requires an actor when auth is enabled. Agents (API keys) work through the
  // MCP endpoint only, where the policy engine, approvals, snapshots and audit apply; the REST API
  // is for people (Studio) and would otherwise give any key a person's powers.
  const peopleOnly = createMiddleware<Env>(async (c, next) => {
    const actor = c.get("actor");
    if (requireAuth && !actor) throw unauthorized();
    if (actor?.kind === "agent")
      return c.json(
        {
          error: "forbidden",
          message: "agent keys work through the MCP endpoint (/mcp), not the REST API",
        },
        403,
      );
    await next();
  });
  for (const path of [
    "/api/sites",
    "/api/sites/*",
    "/api/instance",
    "/api/skills",
    "/api/agent-keys",
    "/api/agent-keys/*",
  ])
    app.use(path, peopleOnly);

  if (deps.mcp) {
    const mcp = createCloudhalMcpHandler({
      store: deps.store,
      ...deps.mcp,
      previewSecret: deps.mcp.previewSecret ?? deps.preview?.secret,
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
      return mcp.fetch(c.req.raw, principal);
    });
  }

  if (deps.agentKeys) {
    app.use("/api/agent-keys", async (c, next) => {
      if (!c.get("actor")) throw unauthorized();
      await next();
    });
    app.use("/api/agent-keys/*", async (c, next) => {
      if (!c.get("actor")) throw unauthorized();
      await next();
    });
    app.route("/api/agent-keys", agentKeys(deps.agentKeys));
  }

  for (const path of ["/api/instance", "/api/skills"])
    app.use(path, async (c, next) => {
      if (!c.get("actor")) throw unauthorized();
      await next();
    });
  app.route(
    "/api",
    instanceRoutes(
      () => ({
        signUp: deps.signUp ?? "unknown",
        features: {
          agentKeys: Boolean(deps.agentKeys),
          mcp: Boolean(deps.mcp),
          activity: Boolean(deps.audit ?? deps.mcp?.audit),
          previewLinks: Boolean(deps.preview),
          deployTransfer: Boolean(deps.admin),
        },
      }),
      deps.mcp?.skills ?? [],
    ),
  );

  app.route("/api/sites", sites);
  app.route("/api/sites/:siteId/pages", pages);
  app.route("/api/sites/:siteId/entries", entries);
  app.route("/api/sites/:siteId/snapshots", snapshots);
  app.route("/api/sites/:siteId/activity", activity);
  app.route("/api/sites/:siteId/preview-links", previewLinks);

  app.notFound((c) =>
    c.json({ error: "not_found", message: `no route for ${c.req.method} ${c.req.path}` }, 404),
  );
  return app;
}

export type CloudhalApi = ReturnType<typeof createApi>;
