import { access } from "node:fs/promises";
import path from "node:path";
import { ApprovalStore, AuditLog, loadSkills } from "@cloudhal/agent-runtime";
import { createApi } from "@cloudhal/api";
import { serveNode } from "@cloudhal/api/node";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { nodeTransport } from "@cloudhal/core-ts/media-node";
import { assetDir } from "../assets.ts";
import { readProjectConfig } from "../config.ts";
import { localAnalytics, startLocalRollups } from "./analytics.ts";
import { localComments, startLocalCommentsJob } from "./comments-local.ts";
import { resolveSkillsDir } from "./mcp.ts";

export interface StudioOptions {
  readonly projectDir: string;
  readonly port?: number;
  /** Directory of a built Studio (`apps/studio/dist`). Defaults to the monorepo build when present. */
  readonly studioDist?: string;
  /** Skip authentication (local scripts only). */
  readonly noAuth?: boolean;
  /** `false` skips the hourly comments job (tests). */
  readonly commentsJob?: boolean;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Paths the API owns; never answered with the Studio SPA. */
export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * Runs the Cloudhal API (and, when built, the Studio UI) for the project on Node.
 * Authentication is wired by `createAuthFor()` from `@cloudhal/api/auth` when available.
 */
export async function studio(
  options: StudioOptions,
): Promise<{ url: string; stop(): Promise<void> }> {
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  const studioDist = options.studioDist ?? (await assetDir("studio")) ?? "";
  const serveStudio = await exists(path.join(studioDist, "index.html"));

  const skillsDir = await resolveSkillsDir(options.projectDir);
  // Site analytics on the project's SQLite (RFC-0006 L3): read through SqlAnalytics, daily totals
  // rolled up hourly (and raw events pruned) while Studio runs.
  const analytics = localAnalytics(local.sql, cfg);
  const stopRollups = analytics.feature().enabled
    ? startLocalRollups(analytics, local, cfg.analytics)
    : () => {};
  // RFC-0007 §12: the comment routes on the project's SQLite; Node has no cron, so the hourly
  // comments job (retention, threads closed by time, old salts) runs on a timer while Studio runs.
  const comments = await localComments(local.sql, local.dataDir);
  const stopCommentsJob =
    options.commentsJob === false ? () => {} : startLocalCommentsJob(local.store, comments.store);
  let deps: Parameters<typeof createApi>[0] = {
    store: local.store,
    analytics,
    comments,
    requireAuth: !options.noAuth,
    // The Studio dev server (vite, :5173) proxies /api here during Studio development.
    trustedOrigins: [
      "http://localhost:5173",
      ...(process.env.CLOUDHAL_TRUSTED_ORIGINS?.split(",") ?? []),
    ],
    // Without auth anyone who can reach the port could write; answer localhost names only.
    ...(options.noAuth ? { allowedHosts: ["localhost", "127.0.0.1", "[::1]"] } : {}),
    mcp: {
      stateKey: crypto.getRandomValues(new Uint8Array(32)),
      audit: new AuditLog(local.sql),
      approvals: new ApprovalStore(local.sql),
      skills: skillsDir ? await loadSkills(skillsDir) : [],
      media: { fetchTransport: nodeTransport() },
    },
  };
  if (!options.noAuth) {
    const { createAuthFor } = await import("@cloudhal/api/auth/node");
    const auth = await createAuthFor({
      dataDir: local.dataDir,
      baseURL: `http://localhost:${options.port ?? 8787}`,
      // Better Auth checks Origin on browser POSTs itself; the Studio dev server must pass too.
      trustedOrigins: deps.trustedOrigins ?? [],
    });
    deps = {
      ...deps,
      resolveActor: auth.resolveActor,
      resolvePrincipal: auth.resolvePrincipal,
      authHandler: auth.handler,
      agentKeys: auth.agentKeys,
      staff: auth.staff,
      signUp: auth.signUp,
    };
  }
  const app = createApi(deps);

  if (serveStudio) {
    const { serveStatic } = await import("@hono/node-server/serve-static");
    const root = path.relative(process.cwd(), studioDist) || ".";
    app.use("/assets/*", serveStatic({ root }));
    // The SPA fallback is for Studio's own routes only: an /api path the API did not answer (a
    // route that is not mounted, e.g. agent keys without auth) falls through to the API's JSON 404
    // rather than receiving index.html with a 200.
    const spa = serveStatic({ root, path: "index.html" });
    app.get("*", (c, next) => (isApiPath(c.req.path) ? next() : spa(c, next)));
  }

  const { server, port } = await serveNode(app, { port: options.port ?? 8787 });
  return {
    url: `http://localhost:${port}/`,
    stop: async () => {
      stopRollups();
      stopCommentsJob();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await local.close();
    },
  };
}
