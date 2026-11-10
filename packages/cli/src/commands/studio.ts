import { access } from "node:fs/promises";
import path from "node:path";
import { ApprovalStore, AuditLog, loadSkills } from "@cloudhal/agent-runtime";
import { AiStore, type CloudhalApi, createApi, restTransport } from "@cloudhal/api";
import {
  cimdFetch,
  mcpOauthFor,
  type OauthServer,
  oauthRegistrationFrom,
} from "@cloudhal/api/auth";
import { CLIENT_ADDRESS_HEADER, serveNode } from "@cloudhal/api/node";
import type { SiteGraphStore } from "@cloudhal/core-ts";
import { type LocalStore, openLocalStore } from "@cloudhal/core-ts/local";
import { nodeTransport } from "@cloudhal/core-ts/media-node";
import { SqlScheduleStore } from "@cloudhal/schedules/sql";
import { assetDir } from "../assets.ts";
import { loadBlockRegistry, loadThemeDesign, loadThemeSettings } from "../blocks.ts";
import { readProjectConfig } from "../config.ts";
import { localRender } from "../render-chrome.ts";
import { localAnalytics, startLocalRollups } from "./analytics.ts";
import { localComments } from "./comments-local.ts";
import { terminalMailSender } from "./mail-local.ts";
import { resolveSkillsDir } from "./mcp.ts";
import { automationsEnabled, startLocalScheduler } from "./scheduler-local.ts";
import {
  type LocalSiteBuild,
  type LocalSiteBuildOptions,
  localSiteBuild,
} from "./site-build-run.ts";
import {
  assertNoAuthLocal,
  assertProxyHasBaseUrl,
  hasAccounts,
  noBaseUrlWarning,
  resolveSetupToken,
  type SetupToken,
  type StudioSetup,
} from "./studio-auth.ts";
import {
  initIfEmpty,
  resolveStudioInit,
  resolveStudioServer,
  type StudioInitFlags,
  type StudioServerFlags,
  studioAuthOrigins,
  studioUrl,
} from "./studio-options.ts";

export interface StudioOptions extends StudioServerFlags, StudioInitFlags {
  readonly projectDir: string;
  /** Progress lines (the first-run scaffold, why OAuth is off); default: nothing. */
  readonly log?: (line: string) => void;
  /** Directory of a built Studio (`apps/studio/dist`). Defaults to the monorepo build when present. */
  readonly studioDist?: string;
  /** Skip authentication (local scripts only: a loopback `host` and no `behindProxy`, #165). */
  readonly noAuth?: boolean;
  /** Where printed mail goes (tests); default stdout (RFC-0011). */
  readonly mailOut?: (text: string) => void;
  /** `false` skips the scheduler's Node ticker (tests). */
  readonly scheduler?: boolean;
  /** @deprecated the comments job runs on the scheduler's tick; `false` skips the ticker. */
  readonly commentsJob?: boolean;
  /**
   * Tests: the rebuild's command instead of the image's `site-build --wait`, and its debounce
   * (`CLOUDHAL_SITE_BUILD=on` still switches it on, #150).
   */
  readonly siteBuild?: Pick<LocalSiteBuildOptions, "command" | "debounceMs" | "maxWaitMs">;
  /** The environment `CLOUDHAL_*` is read from (tests); default `process.env`. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Tests: run Better Auth's Origin check under `NODE_ENV=test` too (`AuthOptions.originCheck`). */
  readonly authOriginCheck?: "always";
}

/** A running `cloudhal studio`. */
export interface StudioHandle {
  readonly url: string;
  readonly port: number;
  /** While nobody has an account: the one-time link that creates the owner (RFC-0005 §7, #165). */
  readonly setup?: StudioSetup;
  /** For the operator: a Studio reachable beyond this machine without `--base-url` (#165). */
  readonly warnings: readonly string[];
  stop(): Promise<void>;
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
export async function studio(options: StudioOptions): Promise<StudioHandle> {
  const env = options.env ?? process.env;
  // Self-hosting (#143): where to listen, the public origin, the proxy headers, the first run.
  const server = resolveStudioServer(options, env);
  // #165: an API without authentication never leaves this machine.
  if (options.noAuth) assertNoAuthLocal(server);
  assertProxyHasBaseUrl(server);
  // RFC-0005 §7, #165: the first account's token, refused (CLOUDHAL_SETUP_TOKEN) before anything starts.
  const setup = options.noAuth ? undefined : resolveSetupToken(env);
  const scaffold = resolveStudioInit(options, env);
  if (scaffold) {
    const log = options.log ?? (() => {});
    if (await initIfEmpty(options.projectDir, { ...scaffold, log }))
      log(`created a new "${scaffold.starter}" project in ${options.projectDir}`);
  }
  const cfg = await readProjectConfig(options.projectDir);
  const { local, siteBuild } = await openStudioStore(options, cfg, env);
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
          // #150: a release run is a publish too
          ...(siteBuild ? { onReleasePublished: siteBuild.onReleasePublished } : {}),
        });
  const origins = studioAuthOrigins(server, env);
  let deps: Parameters<typeof createApi>[0] = {
    store: local.store,
    analytics,
    comments,
    ...(ticker ? { scheduler: ticker } : {}),
    ...(siteBuild ? { siteBuild } : {}),
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
    // The Studio dev server, the public origin and CLOUDHAL_TRUSTED_ORIGINS (studio-options.ts).
    trustedOrigins: origins.trustedOrigins,
    // #165: rate limits count the address `serveNode` derived, never a client-sent header, and
    // invite and reset links name the public origin when there is one.
    clientAddressHeader: CLIENT_ADDRESS_HEADER,
    ...(server.baseUrl ? { studioOrigin: server.baseUrl } : {}),
    // Without auth anyone who can reach the port could write; answer localhost names only.
    ...(options.noAuth ? { allowedHosts: ["localhost", "127.0.0.1", "[::1]"] } : {}),
    mcp: {
      stateKey: crypto.getRandomValues(new Uint8Array(32)),
      audit: new AuditLog(local.sql),
      approvals: new ApprovalStore(local.sql),
      skills: skillsDir ? await loadSkills(skillsDir) : [],
      media: { fetchTransport: nodeTransport() },
      // RFC-0021 §4: render_page with the local Chrome, when there is one.
      render: localRender(),
    },
  };
  let firstOwner: SetupToken | undefined;
  // RFC-0044 §10: the issuer is the public base URL; without one, OAuth stays off.
  const oauth = studioOauth(server.baseUrl, env, { store: local.store, log: options.log });
  if (setup) {
    const { createAuthFor } = await import("@cloudhal/api/auth/node");
    const auth = await createAuthFor({
      dataDir: local.dataDir,
      // The public origin when there is one (its cookies are `Secure` behind https).
      baseURL: origins.baseURL,
      // Better Auth checks Origin on browser POSTs itself; the Studio dev server must pass too.
      trustedOrigins: origins.trustedOrigins,
      trustRequestOrigin: origins.trustRequestOrigin,
      setupToken: setup.token,
      originCheck: options.authOriginCheck,
      ...oauthOption(oauth),
    });
    deps = {
      ...deps,
      resolveActor: auth.resolveActor,
      resolvePrincipal: auth.resolvePrincipal,
      authHandler: auth.handler,
      agentKeys: auth.agentKeys,
      staff: auth.staff,
      signUp: auth.signUp,
      ...withOauthServer(auth.oauth, deps.mcp),
    };
    // RFC-0005 §7, #165: until somebody has an account, the first sign-up needs the token.
    if (!(await hasAccounts(local.sql))) firstOwner = setup;
  }
  const app = createApi(deps);
  if (serveStudio) await serveSpa(app, studioDist);

  const listening = await serveNode(app, {
    port: server.port,
    hostname: server.hostname,
    trustProxy: server.behindProxy,
  });
  // #150: one build at start, through the same queue and audit row as a publish's (the served site
  // follows the new image, and a new volume gets its status page).
  siteBuild?.rebuilder.schedule("start");
  const url = studioUrl(server, listening.port);
  const warning = noBaseUrlWarning(server);
  logOauthOff(options.log, setup ? oauth : undefined);
  return {
    url,
    port: listening.port,
    ...(firstOwner
      ? { setup: { url: `${url}login#setup=${firstOwner.token}`, tokenSource: firstOwner.source } }
      : {}),
    warnings: warning ? [warning] : [],
    stop: async () => {
      stopRollups();
      ticker?.stop();
      await siteBuild?.stop();
      await new Promise<void>((resolve) => listening.server.close(() => resolve()));
      await local.close();
    },
  };
}

/**
 * The project's store for Studio: the theme's block types (RFC-0015 §6) join the built-ins, its
 * design settings (RFC-0017 §1) check `Site.theme.config`, and with CLOUDHAL_SITE_BUILD=on every
 * publish rebuilds the self-hosted static site (#150). The store's hook is bound before the store
 * exists; the rebuild queue needs the store's database.
 */
async function openStudioStore(
  options: StudioOptions,
  cfg: Awaited<ReturnType<typeof readProjectConfig>>,
  env: Readonly<Record<string, string | undefined>>,
): Promise<{ local: LocalStore; siteBuild: LocalSiteBuild | undefined }> {
  let siteBuild: LocalSiteBuild | undefined;
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir), {
    blocks: await loadBlockRegistry(options.projectDir),
    themeSettings: await loadThemeSettings(options.projectDir),
    themeDesign: await loadThemeDesign(options.projectDir),
    onPublished: async (site) => siteBuild?.onPublished(site),
  });
  siteBuild = await localSiteBuild({
    env,
    projectDir: options.projectDir,
    siteId: cfg.siteId,
    sql: local.sql,
    log: options.log ?? ((l) => console.log(`  ${l}`)),
    ...options.siteBuild,
  });
  return { local, siteBuild };
}

/**
 * The authorization server's options (RFC-0044 §10). §3: client metadata documents come through
 * the media import's pinning Node transport, never from this Studio's own host or a site's
 * domain; `CLOUDHAL_MCP_CIMD`, `_DCR` and `_CLIENT_HOSTS` switch registration.
 */
function studioOauth(
  baseUrl: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
  o: { store: Pick<SiteGraphStore, "listSites">; log: ((line: string) => void) | undefined },
): ReturnType<typeof mcpOauthFor> {
  const ownHosts = async () => [
    ...(baseUrl ? [new URL(baseUrl).hostname] : []),
    ...(await o.store.listSites()).flatMap((s) => s.domains.map((d) => d.hostname)),
  ];
  const cimd = cimdFetch({ transport: nodeTransport(), blockedHosts: ownHosts });
  const registration = oauthRegistrationFrom(env, cimd);
  if (registration.problem) o.log?.(`OAuth client registration is off: ${registration.problem}`);
  return mcpOauthFor(baseUrl, env.CLOUDHAL_MCP_OAUTH, registration);
}

/** Logs why remote MCP clients cannot connect by URL (RFC-0044 §10); nothing when they can. */
function logOauthOff(
  log: ((line: string) => void) | undefined,
  oauth: ReturnType<typeof mcpOauthFor> | undefined,
): void {
  if (oauth && "off" in oauth)
    log?.(`OAuth for remote MCP clients is off: ${oauth.off}. Agent keys still work.`);
}

/** `createAuthFor`'s `mcpOauth` when the authorization server runs. */
function oauthOption(oauth: ReturnType<typeof mcpOauthFor>) {
  return "mcpOauth" in oauth ? { mcpOauth: oauth.mcpOauth } : {};
}

/** RFC-0044 Phase 2: remote MCP clients connect by URL; discovery names this issuer. */
function withOauthServer(
  server: OauthServer | undefined,
  mcp: Parameters<typeof createApi>[0]["mcp"],
): Partial<Parameters<typeof createApi>[0]> {
  if (!server || !mcp) return {};
  return {
    oauthServer: server,
    mcp: { ...mcp, oauth: { issuer: server.issuer, resource: server.resource } },
  };
}

/** A built Studio next to the API: its assets, and `index.html` for every path that is not the API's. */
async function serveSpa(app: CloudhalApi, studioDist: string): Promise<void> {
  const { serveStatic } = await import("@hono/node-server/serve-static");
  const root = path.relative(process.cwd(), studioDist) || ".";
  app.use("/assets/*", serveStatic({ root }));
  // The SPA fallback is for Studio's own routes only: an /api path the API did not answer (a
  // route that is not mounted, e.g. agent keys without auth) falls through to the API's JSON 404
  // rather than receiving index.html with a 200.
  const spa = serveStatic({ root, path: "index.html" });
  app.get("*", (c, next) => (isApiPath(c.req.path) ? next() : spa(c, next)));
}

/** Workers AI over REST from `CLOUDFLARE_ACCOUNT_ID` and `CLOUDHAL_AI_TOKEN` (RFC-0016 §1). */
export function localAiTransport(env: Record<string, string | undefined> = process.env): {
  transport?: ReturnType<typeof restTransport>;
} {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = env.CLOUDHAL_AI_TOKEN?.trim();
  return accountId && token ? { transport: restTransport({ accountId, token }) } : {};
}
