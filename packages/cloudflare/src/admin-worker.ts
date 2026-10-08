/**
 * The Cloudhal admin Worker (ADR-0012): one origin for the Studio SPA (static assets), the HTTP
 * API, Better Auth and the MCP endpoint — all over the deployment's D1 database and R2 bucket.
 *
 * After every publish/rollback it purges the site Worker's edge cache through the `SITE` service
 * binding (cache purges are scoped to the Worker that cached the responses): only the tags of what
 * changed between the previously live snapshot and the new one (`purge.ts`), everything when that
 * cannot be worked out.
 *
 * Secrets: BETTER_AUTH_SECRET, MCP_STATE_KEY, CLOUDHAL_PREVIEW_SECRET, CLOUDHAL_PURGE_TOKEN,
 * CLOUDHAL_DEPLOY_TOKEN (all ≥ 32 chars; `cloudhal deploy` generates them).
 */
import {
  ApprovalStore,
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
import { purgeSiteCache } from "./purge.ts";

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
  /** One-time token the first account must present (see `cloudhal deploy` output). */
  CLOUDHAL_SETUP_TOKEN?: string;
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
  // Only plain values survive between requests. Workers do not let one request await I/O started
  // by another (it hangs), so no promise, auth instance or binding wrapper is cached here.
  let migrated = false;

  return {
    async fetch(request: Request, env: AdminEnv, ctx: ExecutionContext): Promise<Response> {
      const url = new URL(request.url);
      // The assets layer answers existing files before the Worker runs, so a request for a file
      // under /assets/ that reaches us is missing (e.g. a chunk from an older Studio build). Answer
      // 404, never the SPA shell: an HTML 200 for a script URL can be cached and shadow the real
      // file once it exists.
      if (url.pathname.startsWith("/assets/"))
        return new Response("not found", {
          status: 404,
          headers: { "content-type": "text/plain", "cache-control": "no-store" },
        });
      if (!WORKER_PATHS.test(url.pathname)) {
        // A client-side route (/sites/…, /login, …): answer with the Studio shell.
        if (!env.ASSETS) return new Response("not found", { status: 404 });
        return env.ASSETS.fetch(new Request(new URL("/", url), { headers: request.headers }));
      }

      const sql = new D1Driver(env.DB);
      const blobs = new R2BlobStore(env.BLOBS);
      if (!migrated) {
        try {
          await migrate(sql, migrations);
        } catch {
          // A concurrent request or isolate applied them first; a second pass sees them as done.
          await migrate(sql, migrations);
        }
        migrated = true;
      }

      // A takedown (RFC-0004 §4.6) purges the asset's media URLs at once, not at the next publish.
      const purgeTags = async (tags: string[], what: string) => {
        if (!env.SITE || !env.CLOUDHAL_PURGE_TOKEN) return;
        const res = await env.SITE.fetch("https://site.internal/__cloudhal/purge", {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.CLOUDHAL_PURGE_TOKEN}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ tags }),
        });
        log(`purge after ${what}: ${res.status} ${await res.text()}`);
      };
      const store: SiteGraphStore = new SiteGraphStore({
        sql,
        blobs,
        onPublished: async (site, change) => {
          const binding = env.SITE;
          if (!binding || !env.CLOUDHAL_PURGE_TOKEN) return;
          // Only what changed between the snapshot that was live and the new one (RFC-0002 §7).
          const result = await purgeSiteCache({
            fetch: (url, init) => binding.fetch(url, init as never) as unknown as Promise<Response>,
            token: env.CLOUDHAL_PURGE_TOKEN,
            store,
            change,
            log: (line) => log(`${site.id}: ${line}`),
          });
          log(
            `purge after publishing ${site.id} (${change.from ?? "nothing"} → ${change.to ?? "nothing"}): ${result.mode}, ${result.tags.length} tag(s), ${result.requests} request(s)`,
          );
        },
        onMediaPurged: async (siteId, assetIds) =>
          purgeTags(
            assetIds.map((id) => `cloudhal-asset-${id}`),
            `taking down media of ${siteId}`,
          ),
        onHookError: (e) => log(`purge failed: ${e instanceof Error ? e.message : String(e)}`),
      });

      // Per request: Better Auth keeps request-scoped state (background tasks, plugin promises),
      // and its construction does no I/O.
      const auth: CloudhalAuth = createAuth({
        database: env.DB,
        sql,
        baseURL: url.origin,
        secret: required(env, "BETTER_AUTH_SECRET"),
        signUp:
          env.CLOUDHAL_SIGNUP === "open" || env.CLOUDHAL_SIGNUP === "closed"
            ? env.CLOUDHAL_SIGNUP
            : "first-user",
        setupToken: env.CLOUDHAL_SETUP_TOKEN,
        workers: { waitUntil: (p) => ctx.waitUntil(p) },
      });
      const audit = new AuditLog(sql);
      const approvals = new ApprovalStore(sql);
      const app = createApi({
        store,
        resolveActor: auth.resolveActor,
        resolvePrincipal: auth.resolvePrincipal,
        authHandler: auth.handler,
        agentKeys: auth.agentKeys,
        staff: auth.staff,
        signUp: auth.signUp,
        audit,
        mcp: {
          stateKey: required(env, "MCP_STATE_KEY"),
          audit,
          skills,
          previewSecret: env.CLOUDHAL_PREVIEW_SECRET,
          approvals,
          // Remote clients must speak the stateless 2026-07-28 protocol or be served statelessly.
          legacy: "stateless",
          // fetch_asset_url never reaches this Worker's own host (Studio, API, purge); each site's
          // domains are refused too. Workers cannot pin DNS: see `workersTransport` (RFC-0004 §5.7).
          media: { blockedHosts: [url.hostname] },
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
