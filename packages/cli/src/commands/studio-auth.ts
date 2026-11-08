/**
 * What `cloudhal studio` does about authentication where it does not run on the author's own
 * machine (#165): `--no-auth` stays on this machine, the first account needs a one-time setup
 * token (RFC-0005 §7; `CLOUDHAL_SETUP_TOKEN`, or one printed at start) so a fresh Studio on a
 * network cannot be claimed by whoever reaches it first, and a Studio reachable beyond loopback
 * without a public origin is warned about.
 */
import type { SqlDriver } from "@cloudhal/storage";
import type { StudioServer } from "./studio-options.ts";

type Env = Readonly<Record<string, string | undefined>>;

/** Loopback addresses: the default bind (`127.0.0.1`), and the only ones `--no-auth` may use. */
export function isLoopbackHost(host: string | undefined): boolean {
  if (host === undefined) return true;
  const h = host
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1");
  return (
    h === "localhost" ||
    h === "::1" ||
    h === "::ffff:127.0.0.1" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
  );
}

/**
 * `--no-auth` publishes every scope to whoever reaches the port (its only guard is a `Host` allow
 * list any client can satisfy), so it is for this machine only: a loopback address and no proxy in
 * front (#165).
 */
export function assertNoAuthLocal(server: StudioServer): void {
  if (isLoopbackHost(server.hostname) && !server.behindProxy) return;
  const why = server.behindProxy ? "--behind-proxy is set" : `--host is ${server.hostname}`;
  throw new Error(
    `--no-auth is for this machine only: it needs a loopback --host (127.0.0.1, the default, or ::1) and no --behind-proxy, but ${why}. Run with authentication to serve Studio beyond localhost.`,
  );
}

/** The token the first account must present, and where it came from. */
export interface SetupToken {
  readonly token: string;
  readonly source: "env" | "generated";
}

/** A `CLOUDHAL_SETUP_TOKEN` must be hard to guess (the same floor `cloudhal deploy` asks for). */
const MIN_SETUP_TOKEN_LENGTH = 32;
/**
 * The characters a token may use: it travels in a URL fragment, where Studio's login page reads
 * `+` as a space and `%`, `&` or `#` change the value (base64url, hex and UUIDs fit).
 */
const SETUP_TOKEN_CHARS = /^[A-Za-z0-9._~-]+$/;

/**
 * The one-time token the first account must present (header `x-cloudhal-setup-token`; RFC-0005 §7,
 * #165): `CLOUDHAL_SETUP_TOKEN` when set, else a fresh random one for this process. It is only
 * asked for while nobody has an account.
 */
export function resolveSetupToken(env: Env = process.env): SetupToken {
  const given = env.CLOUDHAL_SETUP_TOKEN?.trim();
  if (given) {
    if (given.length < MIN_SETUP_TOKEN_LENGTH)
      throw new Error(
        `CLOUDHAL_SETUP_TOKEN must be at least ${MIN_SETUP_TOKEN_LENGTH} characters (a random value); unset it and cloudhal studio prints a setup link instead`,
      );
    if (!SETUP_TOKEN_CHARS.test(given))
      throw new Error(
        "CLOUDHAL_SETUP_TOKEN may only use letters, digits and - . _ ~ (it travels in the setup link): use e.g. `openssl rand -hex 32`",
      );
    return { token: given, source: "env" };
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return { token: Buffer.from(bytes).toString("base64url"), source: "generated" };
}

/** Whether anybody has an account yet (Better Auth's `user` table, storage migration 0002). */
export async function hasAccounts(sql: Pick<SqlDriver, "get">): Promise<boolean> {
  const row = await sql.get<{ n: number }>('SELECT COUNT(*) AS n FROM "user"');
  return (row?.n ?? 0) > 0;
}

/** The setup link `studio()` reports while nobody has an account. */
export interface StudioSetup {
  /** `<studio url>login#setup=<token>`: the token travels in the fragment, never to a server. */
  readonly url: string;
  readonly tokenSource: "env" | "generated";
}

/**
 * What `cloudhal studio` prints for a `StudioSetup` (an operator reads it from the container's
 * log). A token the operator set themselves is not repeated: logs may be kept.
 */
export function describeSetup(setup: StudioSetup): string {
  const fromEnv = setup.tokenSource === "env";
  const link = fromEnv
    ? setup.url.replace(/#setup=.*$/, "#setup=<CLOUDHAL_SETUP_TOKEN>")
    : setup.url;
  return [
    "No account yet. Create the owner account (once) at this one-time setup link:",
    `  ${link}`,
    fromEnv
      ? "  (the token is the value of CLOUDHAL_SETUP_TOKEN; it is not printed)"
      : "  (printed only here; without it nobody can sign up)",
    "  If you open Studio at another address, keep the #setup=… part of the link.",
  ].join("\n");
}

/** One line for a Studio reachable beyond this machine, or behind a proxy, without a public origin (#165). */
export function noBaseUrlWarning(server: StudioServer): string | undefined {
  if (server.baseUrl !== undefined) return undefined;
  if (server.behindProxy)
    return "--behind-proxy without --base-url: sign-in accepts only this machine's own addresses; set --base-url (CLOUDHAL_BASE_URL) to the public origin browsers open Studio at";
  if (isLoopbackHost(server.hostname)) return undefined;
  return `--host ${server.hostname} without --base-url: sign-in accepts the origin of each request; set --base-url (CLOUDHAL_BASE_URL) to the origin browsers open Studio at, e.g. http://<this machine's address>:${server.port}`;
}
