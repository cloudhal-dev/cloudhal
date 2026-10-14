import { access } from "node:fs/promises";
import path from "node:path";
import { ApprovalStore, AuditLog, loadSkills } from "@cloudhal/agent-runtime";
import { AiStore, createApi, restTransport } from "@cloudhal/api";
import { serveNode } from "@cloudhal/api/node";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { nodeTransport } from "@cloudhal/core-ts/media-node";
import { SqlScheduleStore } from "@cloudhal/schedules/sql";
import { assetDir } from "../assets.ts";
import { loadBlockRegistry } from "../blocks.ts";
import { readProjectConfig } from "../config.ts";
import { localAnalytics, startLocalRollups } from "./analytics.ts";
import { localComments } from "./comments-local.ts";
import { terminalMailSender } from "./mail-local.ts";
import { resolveSkillsDir } from "./mcp.ts";
import { automationsEnabled, startLocalScheduler } from "./scheduler-local.ts";

export interface StudioOptions {
  readonly projectDir: string;
  readonly port?: number;
  /** Directory of a built Studio (`apps/studio/dist`). Defaults to the monorepo build when present. */
  readonly studioDist?: string;
  /** Skip authentication (local scripts only). */
  readonly noAuth?: boolean;
  /** Where printed mail goes (tests); default stdout (RFC-0011). */
  readonly mailOut?: (text: string) => void;
  /** `false` skips the scheduler's Node ticker (tests). */
  readonly scheduler?: boolean;
  /** @deprecated the comments job runs on the scheduler's tick; `false` skips the ticker. */
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
  // The theme's block types (RFC-0015 §6) join the built-ins: validated, offered, listed.
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir), {
    blocks: await loadBlockRegistry(options.projectDir),
  });
  const studioDist = options.studioDist ?? (await assetDir("studio")) ?? "";
  const serveStudio = await exists(path.join(studioDist, "index.html"));

  const skillsDir = await resolveSkillsDir(options.projectDir);
  // Site analytics on the project's SQLite (RFC-0006 L3): read through SqlAnalytics, daily totals
  // rolled up hourly (and raw events pruned) while Studio runs.
  const analytics = localAnalytics(local.sql, cfg);
  const stopRollups = analytics.feature().enabled
    ? startLocalRollups(analytics, local, cfg.analytics)
    : () => {};
  // RFC-0007 §12: the comment routes on the project's SQLite.
  const comments = await localComments(local.sql, local.dataDir);
  // RFC-0008 §8.4: the scheduler's Node ticker (releases, automations, and the hourly comments
  // job behind its watermark) while Studio runs, with a catch-up tick now.
  const ticker =
    options.scheduler === false || options.commentsJob === false
      ? undefined
      : startLocalScheduler({
          sql: local.sql,
          blobs: local.blobs,
          graph: local.store,
          // RFC-0008 §11.1: the broken-link sweep's 404 rows
          ...(analytics.feature().enabled ? { analytics } : {}),
        });
  let deps: Parameters<typeof createApi>[0] = {
    store: local.store,
    analytics,
    comments,
    ...(ticker ? { scheduler: ticker } : {}),
    // RFC-0008 §13: the schedule routes, tools and notifications on the project's SQLite.
    schedules: {
      store: new SqlScheduleStore(local.sql),
      maxNewBodies: Number.POSITIVE_INFINITY,
      // §11.6: `CLOUDHAL_AUTOMATIONS=off` refuses automation keys and stops occurrences.
      automationsEnabled: automationsEnabled(),
    },
    requireAuth: !options.noAuth,
    // RFC-0011: invites and reset links are printed here instead of sent.
    ...(cfg.mail ? { mail: terminalMailSender(cfg.mail, options.mailOut) } : {}),
    // RFC-0016: Workers AI over REST when the environment has an account id and a token (never
    // stored); the settings are kept either way.
    ai: { store: new AiStore(local.sql), ...localAiTransport() },
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
      ticker?.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await local.close();
    },
  };
}

/** Workers AI over REST from `CLOUDFLARE_ACCOUNT_ID` and `CLOUDHAL_AI_TOKEN` (RFC-0016 §1). */
export function localAiTransport(env: Record<string, string | undefined> = process.env): {
  transport?: ReturnType<typeof restTransport>;
} {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = env.CLOUDHAL_AI_TOKEN?.trim();
  return accountId && token ? { transport: restTransport({ accountId, token }) } : {};
}
