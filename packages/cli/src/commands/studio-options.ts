/**
 * How `cloudhal studio` is reached when it does not run on the author's own machine (self-hosting,
 * #143): the address it listens on, the public origin behind a reverse proxy, whether the proxy's
 * `X-Forwarded-*` headers are trusted, and the first run on an empty folder (a container's volume).
 * Flags win over the environment: `CLOUDHAL_HOST`, `CLOUDHAL_BASE_URL`, `CLOUDHAL_BEHIND_PROXY`,
 * `CLOUDHAL_INIT` (a starter name), `CLOUDHAL_SITE_NAME`.
 */
import { access, mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { CONFIG_FILE } from "../config.ts";
import { init } from "./init.ts";
import { isLoopbackHost } from "./studio-auth.ts";

type Env = Readonly<Record<string, string | undefined>>;

/** The flags `cloudhal studio` takes for where and how it is served. */
export interface StudioServerFlags {
  readonly port?: number;
  /** `--host`: the address to listen on (default `127.0.0.1`; `0.0.0.0` for every IPv4 address). */
  readonly host?: string;
  /**
   * `--base-url`: the origin browsers open Studio at (scheme, host, port), e.g.
   * `https://studio.example.com`; required behind a reverse proxy, recommended whenever `--host`
   * is not loopback. Without it sign-in accepts each request's own origin (#165).
   */
  readonly baseUrl?: string;
  /** `--behind-proxy`: trust `X-Forwarded-Proto` / `X-Forwarded-Host`. */
  readonly behindProxy?: boolean;
}

/** What `studio()` serves with: flags, then the environment, then the defaults. */
export interface StudioServer {
  readonly port: number;
  readonly hostname: string | undefined;
  /** The public origin, without a trailing slash; undefined means `http://localhost:<port>`. */
  readonly baseUrl: string | undefined;
  readonly behindProxy: boolean;
}

const DEFAULT_PORT = 8787;
const ON = new Set(["1", "true", "yes", "on"]);

function envFlag(value: string | undefined): boolean {
  return value !== undefined && ON.has(value.trim().toLowerCase());
}

function nonEmpty(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

/**
 * `--base-url` / `CLOUDHAL_BASE_URL` as an origin: http or https, host, optional port; a path,
 * query or fragment is refused (Studio is served at the root, and Better Auth's `baseURL` is an
 * origin).
 */
export function parseBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      `--base-url must be an absolute URL such as https://studio.example.com (got "${value}")`,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error(`--base-url must be an http or https URL (got "${value}")`);
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password)
    throw new Error(`--base-url takes an origin only, without a path (got "${value}")`);
  return url.origin;
}

/** Resolves the server options from flags and the environment. */
export function resolveStudioServer(
  flags: StudioServerFlags,
  env: Env = process.env,
): StudioServer {
  const baseUrl = flags.baseUrl ?? nonEmpty(env.CLOUDHAL_BASE_URL);
  return {
    port: flags.port ?? DEFAULT_PORT,
    hostname: nonEmpty(flags.host) ?? nonEmpty(env.CLOUDHAL_HOST),
    baseUrl: baseUrl === undefined ? undefined : parseBaseUrl(baseUrl),
    behindProxy: flags.behindProxy ?? envFlag(env.CLOUDHAL_BEHIND_PROXY),
  };
}

/** Where to open Studio: the public origin when there is one, else this machine. */
export function studioUrl(server: StudioServer, port: number): string {
  if (server.baseUrl) return `${server.baseUrl}/`;
  const h = server.hostname;
  const host =
    h === undefined || h === "127.0.0.1" || h === "0.0.0.0" || h === "::" || h === "::1"
      ? "localhost"
      : h.includes(":")
        ? `[${h}]`
        : h;
  return `http://${host}:${port}/`;
}

/**
 * Better Auth's `baseURL` (the origin browsers use; its cookies are `Secure` for https) and the
 * origins the API accepts state-changing requests from: the Studio dev server, the public origin
 * (so a proxy that keeps the request on http still passes the API's CSRF check), and
 * `CLOUDHAL_TRUSTED_ORIGINS`. Without a public origin (#165) Better Auth also trusts the origin
 * each request was made to, as the API's CSRF check does: any (`"any"`, a server listening beyond
 * loopback, reached at `http://<lan-ip>:8787`), or on a loopback server only this machine's names
 * (`"loopback"`: `localhost`, `127.0.0.1`, `[::1]`, so a rebound DNS name is not). With a public
 * origin (`false`) only it and the list may sign in.
 */
export function studioAuthOrigins(
  server: StudioServer,
  env: Env = process.env,
): { baseURL: string; trustedOrigins: string[]; trustRequestOrigin: "any" | "loopback" | false } {
  const baseURL = server.baseUrl ?? `http://localhost:${server.port}`;
  const trustedOrigins = [
    // The Studio dev server (vite, :5173) proxies /api here during Studio development.
    "http://localhost:5173",
    ...(server.baseUrl ? [server.baseUrl] : []),
    ...(env.CLOUDHAL_TRUSTED_ORIGINS?.split(",") ?? []),
  ];
  return {
    baseURL,
    trustedOrigins: [...new Set(trustedOrigins.map((o) => o.trim()))].filter(Boolean),
    trustRequestOrigin:
      server.baseUrl !== undefined ? false : isLoopbackHost(server.hostname) ? "loopback" : "any",
  };
}

/** `--init-if-empty` and its `--starter` / `--name`; from the environment, `CLOUDHAL_INIT=<starter>`. */
export interface StudioInitFlags {
  readonly initIfEmpty?: boolean;
  readonly starter?: string;
  readonly name?: string;
}

/** The first-run scaffold to perform, or undefined when none was asked for. */
export function resolveStudioInit(
  flags: StudioInitFlags,
  env: Env = process.env,
): { starter: string; name: string | undefined } | undefined {
  const envStarter = nonEmpty(env.CLOUDHAL_INIT);
  if (!flags.initIfEmpty && !envStarter) return undefined;
  return {
    starter: flags.starter ?? envStarter ?? "blog",
    name: flags.name ?? nonEmpty(env.CLOUDHAL_SITE_NAME),
  };
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** The folder inside the project where `--init-if-empty` stages the scaffold before moving it up. */
export const INIT_STAGING_DIR = ".cloudhal-init";

/**
 * Creates the project the way `cloudhal init` does when the folder has no `cloudhal.json` (a
 * container starting on an empty volume). A folder that has other files but no config is refused,
 * as `init` refuses it, so a volume mounted at the wrong path is never written over. The scaffold
 * is staged in `.cloudhal-init` inside the folder and moved up entry by entry, `cloudhal.json`
 * last, so a container stopped at any point starts again cleanly: a staging folder without a
 * config is redone, one with a config is moved the rest of the way (#165; before, a stop
 * mid-scaffold crash-looped on "is not empty"). Returns whether a project was created.
 */
export async function initIfEmpty(
  projectDir: string,
  options: { starter: string; name?: string | undefined; log?: (line: string) => void },
): Promise<boolean> {
  if (await exists(path.join(projectDir, CONFIG_FILE))) return false;
  await mkdir(projectDir, { recursive: true });
  const staging = path.join(projectDir, INIT_STAGING_DIR);
  const staged = await exists(path.join(staging, CONFIG_FILE));
  const others = (await readdir(projectDir)).filter((entry) => entry !== INIT_STAGING_DIR);
  if (others.length > 0 && !staged) throw new Error(`${projectDir} is not empty`);
  if (!staged) {
    // whatever an earlier start left unfinished, then a fresh scaffold
    await rm(staging, { recursive: true, force: true });
    await init({
      dir: staging,
      finalDir: projectDir,
      starter: options.starter,
      name: options.name ?? path.basename(path.resolve(projectDir)),
      ...(options.log ? { log: options.log } : {}),
    });
  }
  for (const entry of (await readdir(staging)).filter((entry) => entry !== CONFIG_FILE))
    await moveUp(staging, projectDir, entry);
  await moveUp(staging, projectDir, CONFIG_FILE);
  await rm(staging, { recursive: true, force: true });
  return true;
}

/** One staged entry into the project; one that an earlier start already moved stays as it is. */
async function moveUp(staging: string, projectDir: string, entry: string): Promise<void> {
  const target = path.join(projectDir, entry);
  if (await exists(target)) await rm(path.join(staging, entry), { recursive: true, force: true });
  else await rename(path.join(staging, entry), target);
}
