import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AuditLog, loadSkills } from "@cloudhal/agent-runtime";
import { createApi } from "@cloudhal/api";
import { serveNode } from "@cloudhal/api/node";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { readProjectConfig } from "../config.ts";
import { resolveSkillsDir } from "./mcp.ts";

export interface StudioOptions {
  readonly projectDir: string;
  readonly port?: number;
  /** Directory of a built Studio (`apps/studio/dist`). Defaults to the monorepo build when present. */
  readonly studioDist?: string;
  /** Skip authentication (local scripts only). */
  readonly noAuth?: boolean;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STUDIO_DIST = path.resolve(here, "../../../../apps/studio/dist");

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
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
  const studioDist = options.studioDist ?? DEFAULT_STUDIO_DIST;
  const serveStudio = await exists(path.join(studioDist, "index.html"));

  const skillsDir = await resolveSkillsDir(options.projectDir);
  let deps: Parameters<typeof createApi>[0] = {
    store: local.store,
    requireAuth: !options.noAuth,
    mcp: {
      stateKey: crypto.getRandomValues(new Uint8Array(32)),
      audit: new AuditLog(local.sql),
      skills: skillsDir ? await loadSkills(skillsDir) : [],
    },
  };
  if (!options.noAuth) {
    const { createAuthFor } = await import("@cloudhal/api/auth/node");
    const auth = await createAuthFor({
      dataDir: local.dataDir,
      baseURL: `http://localhost:${options.port ?? 8787}`,
    });
    deps = {
      ...deps,
      resolveActor: auth.resolveActor,
      resolvePrincipal: auth.resolvePrincipal,
      authHandler: auth.handler,
      agentKeys: auth.agentKeys,
    };
  }
  const app = createApi(deps);

  if (serveStudio) {
    const { serveStatic } = await import("@hono/node-server/serve-static");
    const root = path.relative(process.cwd(), studioDist) || ".";
    app.use("/assets/*", serveStatic({ root }));
    app.get("*", serveStatic({ root, path: "index.html" }));
  }

  const { server, port } = await serveNode(app, { port: options.port ?? 8787 });
  return {
    url: `http://localhost:${port}/`,
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await local.close();
    },
  };
}
