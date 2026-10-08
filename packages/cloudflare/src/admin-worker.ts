/**
 * The Cloudhal admin Worker (ADR-0012): one origin for the Studio SPA (static assets), the HTTP
 * API, Better Auth and the MCP endpoint — all over the deployment's D1 database and R2 bucket.
 *
 * After every publish/rollback it purges the site Worker's edge cache through the `SITE` service
 * binding (cache purges are scoped to the Worker that cached the responses).
 *
 * Secrets: BETTER_AUTH_SECRET, MCP_STATE_KEY, CLOUDHAL_PREVIEW_SECRET, CLOUDHAL_PURGE_TOKEN,
 * CLOUDHAL_DEPLOY_TOKEN (all ≥ 32 chars; `cloudhal deploy` generates them).
 */
import {
  AuditLog,
  type LoadedSkill,
  type SkillSource,
  skillFromSource,
} from "@cloudhal/agent-runtime";
import { createApi } from "@cloudhal/api";
import { type CloudhalAuth, createAuth } from "@cloudhal/api/auth";
import { SiteGraphStore } from "@cloudhal/core-ts";
import { migrate, migrations } from "@cloudhal/storage";
import { D1Driver } from "@cloudhal/storage/d1";
import { R2BlobStore } from "@cloudhal/storage/r2";

export interface AdminEnv {
  DB: D1Database;
  BLOBS: R2Bucket;
  ASSETS?: Fetcher;
  SITE?: Fetcher;
  BETTER_AUTH_SECRET: string;
  MCP_STATE_KEY: string;
  CLOUDHAL_PREVIEW_SECRET?: string;
  CLOUDHAL_PURGE_TOKEN?: string;
  CLOUDHAL_DEPLOY_TOKEN?: string;
  /** `first-user` (default: only the owner can sign up), `closed` or `open`. */
  CLOUDHAL_SIGNUP?: string;
}

export interface AdminWorkerOptions {
  /** Skills exposed over MCP (bundled at deploy time). */
  skills?: SkillSource[];
  log?: (line: string) => void;
}

const WORKER_PATHS = /^\/(api\/|mcp(\/|$)|\.well-known\/)/;

function required(env: AdminEnv, key: keyof AdminEnv): string {
  const value = env[key];
  if (typeof value !== "string" || value.length < 32)
    throw new Error(`secret ${key} is missing or shorter than 32 characters`);
  return value;
}

export function createAdminWorker(options: AdminWorkerOptions = {}) {
  const skills: LoadedSkill[] = (options.skills ?? []).map((s) => skillFromSource(s));
  const log = options.log ?? ((line: string) => console.log(line));
  let migrated: Promise<void> | undefined;
  const auths = new Map<string, CloudhalAuth>();

  return {
    async fetch(request: Request, env: AdminEnv, ctx: ExecutionContext): Promise<Response> {
      const url = new URL(request.url);
      if (!WORKER_PATHS.test(url.pathname)) {
        // Studio SPA (normally served by the assets layer before the Worker runs).
        return env.ASSETS ? env.ASSETS.fetch(request) : new Response("not found", { status: 404 });
      }

      const sql = new D1Driver(env.DB);
      const blobs = new R2BlobStore(env.BLOBS);
      migrated ??= migrate(sql, migrations).then(
        () => undefined,
        (e) => {
          migrated = undefined; // another isolate may have raced us; retry next request
          throw e;
        },
      );
      await migrated;

      const store = new SiteGraphStore({
        sql,
        blobs,
        onPublished: async (site) => {
          if (!env.SITE || !env.CLOUDHAL_PURGE_TOKEN) return;
          const res = await env.SITE.fetch("https://site.internal/__cloudhal/purge", {
            method: "POST",
            headers: { authorization: `Bearer ${env.CLOUDHAL_PURGE_TOKEN}` },
          });
          log(`purge after publishing ${site.id}: ${res.status} ${await res.text()}`);
        },
        onHookError: (e) => log(`purge failed: ${e instanceof Error ? e.message : String(e)}`),
      });

      let auth = auths.get(url.origin);
      if (!auth) {
        auth = createAuth({
          database: env.DB,
          baseURL: url.origin,
          secret: required(env, "BETTER_AUTH_SECRET"),
          signUp:
            env.CLOUDHAL_SIGNUP === "open" || env.CLOUDHAL_SIGNUP === "closed"
              ? env.CLOUDHAL_SIGNUP
              : "first-user",
          workers: { waitUntil: (p) => ctx.waitUntil(p) },
        });
        auths.set(url.origin, auth);
      }
      const audit = new AuditLog(sql);
      const app = createApi({
        store,
        resolveActor: auth.resolveActor,
        resolvePrincipal: auth.resolvePrincipal,
        authHandler: auth.handler,
        agentKeys: auth.agentKeys,
        audit,
        mcp: {
          stateKey: required(env, "MCP_STATE_KEY"),
          audit,
          skills,
          previewSecret: env.CLOUDHAL_PREVIEW_SECRET,
          // Remote clients must speak the stateless 2026-07-28 protocol or be served statelessly.
          legacy: "stateless",
        },
        ...(env.CLOUDHAL_PREVIEW_SECRET
          ? { preview: { secret: env.CLOUDHAL_PREVIEW_SECRET } }
          : {}),
        ...(env.CLOUDHAL_DEPLOY_TOKEN
          ? { admin: { deployToken: env.CLOUDHAL_DEPLOY_TOKEN, storage: { sql, blobs } } }
          : {}),
      });
      return app.fetch(request, env, ctx);
    },
  };
}
