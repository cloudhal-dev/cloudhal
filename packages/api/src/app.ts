import { defaultScopes } from "@cloudhal/agent-runtime";
import { createCloudhalMcpHandler } from "@cloudhal/mcp-server/http";
import { type Context, Hono } from "hono";
import type { ApiDeps, Env, PrincipalResolver } from "./context.ts";
import { errorHandler, unauthorized } from "./errors.ts";
import { activity } from "./routes/activity.ts";
import { agentKeys } from "./routes/agent-keys.ts";
import { entries } from "./routes/entries.ts";
import { pages } from "./routes/pages.ts";
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

  app.use("*", async (c, next) => {
    c.set("store", deps.store);
    c.set("audit", deps.audit ?? deps.mcp?.audit);
    c.set("actor", deps.resolveActor ? await deps.resolveActor(c) : undefined);
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true }));
  if (deps.authHandler) {
    const handler = deps.authHandler;
    app.on(["GET", "POST"], "/api/auth/*", (c) => handler(c.req.raw));
  }
  app.get("/api/me", (c) => {
    const actor = c.get("actor");
    if (!actor) throw unauthorized();
    return c.json({ actor });
  });

  // Everything below requires an actor when auth is enabled.
  app.use("/api/sites/*", async (c, next) => {
    if (requireAuth && !c.get("actor")) throw unauthorized();
    await next();
  });
  app.use("/api/sites", async (c, next) => {
    if (requireAuth && !c.get("actor")) throw unauthorized();
    await next();
  });

  if (deps.mcp) {
    const mcp = createCloudhalMcpHandler({ store: deps.store, ...deps.mcp });
    const resolvePrincipal: PrincipalResolver =
      deps.resolvePrincipal ??
      (async (c) => {
        const actor = (c as Context<Env>).get("actor");
        return actor ? { actor, scopes: defaultScopes(actor) } : undefined;
      });
    app.all("/mcp", async (c) => {
      const principal = await resolvePrincipal(c);
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

  app.route("/api/sites", sites);
  app.route("/api/sites/:siteId/pages", pages);
  app.route("/api/sites/:siteId/entries", entries);
  app.route("/api/sites/:siteId/snapshots", snapshots);
  app.route("/api/sites/:siteId/activity", activity);

  app.notFound((c) =>
    c.json({ error: "not_found", message: `no route for ${c.req.method} ${c.req.path}` }, 404),
  );
  return app;
}

export type CloudhalApi = ReturnType<typeof createApi>;
