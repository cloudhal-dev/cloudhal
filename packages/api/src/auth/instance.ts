/** The Better Auth instance: email and password, organization roles, admin, API keys, and the hooks that keep membership and the first owner in Cloudhal's hands. The whole `betterAuth({...})` literal stays in one function so plugin endpoint types infer. */
import { apiKey } from "@better-auth/api-key";
import { type Auth, betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import type { StaffStore } from "../staff.ts";
import type { GrantStore } from "./grants.ts";
import { betterAuthLogger, oauthEndpoints, oauthPlugins } from "./oauth.ts";
import { oauthBeforeHook } from "./oauth-hooks.ts";
import {
  API_KEY_HEADER,
  type AuthOptions,
  NOT_A_MEMBER_MESSAGE,
  SETUP_TOKEN_HEADER,
  signUpMode,
} from "./types.ts";

/**
 * Better Auth access control for the organization plugin: the five role names are registered so
 * the plugin accepts them. Its statements cover only membership; site permissions stay in
 * `ROLE_SCOPES` (RFC-0005 §11). The plugin's HTTP endpoints are not reachable (I3).
 */
export const orgAc = createAccessControl({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
} as const);
export const orgRoles = {
  owner: orgAc.newRole({
    organization: ["update", "delete"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    ac: ["read"],
  }),
  administrator: orgAc.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    ac: ["read"],
  }),
  editor: orgAc.newRole({ invitation: ["create", "cancel"], ac: ["read"] }),
  author: orgAc.newRole({ ac: ["read"] }),
  contributor: orgAc.newRole({ ac: ["read"] }),
};

/** Migration 0012's invitation columns, declared so the adapter knows them. */
export const INVITATION_FIELDS = {
  tokenHash: { type: "string", required: false, input: false, unique: true },
  delivery: { type: "string", required: false, input: false },
  acceptedUserId: { type: "string", required: false, input: false },
  acceptedAt: { type: "date", required: false, input: false },
  canceledBy: { type: "string", required: false, input: false },
  canceledAt: { type: "date", required: false, input: false },
  sites: { type: "string", required: false, input: false },
} as const;

/**
 * Typed as Better Auth's base `Auth`: its inferred plugin type cannot be named outside this
 * module, and callers reach the plugin endpoints through `authDeps`'s typed view of `api`.
 */
export function createInstance(
  options: AuthOptions,
  staff: StaffStore,
  internal: InternalKeys,
): Auth {
  const mode = signUpMode(options);
  const clock = options.now ?? (() => new Date());
  const ipHeader = options.workers ? "cf-connecting-ip" : options.clientAddressHeader;
  // RFC-0044 §2: the authorization server, when the runtime has a stable public origin.
  const oauth = options.mcpOauth
    ? oauthPlugins(oauthEndpoints(options.baseURL).issuer, options.mcpOauth, {
        fromServer: (headers) =>
          constantTimeEqual(headers.get(SERVER_KEY_HEADER) ?? "", internal.serverKey),
        grantOf: async (userId, clientId) => (await internal.grants.live(userId, clientId))?.id,
      })
    : [];
  const instance = betterAuth({
    // biome-ignore lint/suspicious/noExplicitAny: Better Auth accepts several concrete DB handles
    database: options.database as any,
    baseURL: options.baseURL,
    secret: options.secret,
    trustedOrigins:
      typeof options.trustedOrigins === "function"
        ? options.trustedOrigins
        : [...(options.trustedOrigins ?? [])],
    emailAndPassword: {
      enabled: true,
      disableSignUp: mode === "closed",
      autoSignIn: true,
    },
    telemetry: { enabled: false },
    // Through Cloudhal's logging; an expected refusal (a wrong API key) is not an error (#159).
    logger: betterAuthLogger(options.log),
    // Every signed-in API request reads the session; signed into a cookie for 60 s, it costs no
    // D1 round trip. A revoked session or a sign-out on another device takes effect within 60 s
    // (the person's own sign-out clears the cookie at once).
    session: { cookieCache: { enabled: true, maxAge: 60 } },
    hooks: {
      // Checked before the endpoint runs (outside Better Auth's write transaction, which would
      // deadlock a second query on single-connection SQLite).
      before: createAuthMiddleware(async (ctx) => {
        // RFC-0044 §4: consent is given through Studio's screen (`/api/agent-grants/consent`),
        // which narrows the scopes by role and writes the grant; a direct call is refused.
        if (ctx.path === "/oauth2/consent" && ctx.request) {
          const given = ctx.headers?.get(SERVER_KEY_HEADER) ?? "";
          if (!constantTimeEqual(given, internal.serverKey))
            throw new APIError("FORBIDDEN", { message: "consent is given on Studio's screen" });
          return;
        }
        // RFC-0044: stale consent memory, DPoP and the refresh family's absolute lifetime.
        if (options.mcpOauth && OAUTH_HOOK_PATHS.has(ctx.path))
          return oauthBeforeHook(ctx, { grants: internal.grants, staff, now: clock });
        if (!ctx.path.startsWith("/sign-up") || mode !== "first-user") return;
        const existing = await ctx.context.adapter.count({ model: "user" });
        if (existing > 0)
          throw new APIError("FORBIDDEN", {
            message:
              "Sign-up is closed: this Studio already has an owner. Ask an administrator for an invite.",
          });
        if (options.setupToken) {
          const given = ctx.headers?.get(SETUP_TOKEN_HEADER) ?? "";
          if (!constantTimeEqual(given, options.setupToken))
            throw new APIError("FORBIDDEN", {
              message:
                "Creating the owner account needs the setup link: `cloudhal deploy` prints it, and `cloudhal studio` prints it in its log while nobody has an account.",
            });
        }
      }),
      // After the endpoint: the first account becomes the Owner in the same request; `open`
      // sign-ups join as Contributors (RFC-0005 §7.5). A sign-in without a membership is refused.
      after: createAuthMiddleware(async (ctx) => {
        const fresh = ctx.context.newSession;
        if (!fresh) return;
        if (ctx.path === "/sign-up/email") {
          await staff.joinAsOwnerOr(fresh.user.id, mode === "open" ? "contributor" : undefined);
          return;
        }
        if (ctx.path === "/sign-in/email" && !(await staff.member(fresh.user.id))) {
          await ctx.context.internalAdapter.deleteSession(fresh.session.token);
          throw new APIError("FORBIDDEN", { message: NOT_A_MEMBER_MESSAGE });
        }
      }),
    },
    ...(ipHeader
      ? {
          // Stored in the database (D1 on Workers, the project's SQLite on Node), so the limit holds
          // across isolates and does not depend on NODE_ENV=production, Better Auth's default
          // (#165); each limited call costs a read and a write. Reading the session is not a
          // brute-force target and Studio asks for it often: it is not limited.
          rateLimit: {
            enabled: true,
            storage: "database" as const,
            customRules: { "/get-session": false as const },
          },
        }
      : {}),
    advanced: {
      // The client's address for rate limits and sessions: the header the runtime vouches for
      // (Cloudflare's, or the one `serveNode` writes on Node), never a client-sent one (#165).
      ...(ipHeader ? { ipAddress: { ipAddressHeaders: [ipHeader] } } : {}),
      // Under NODE_ENV=test Better Auth skips its Origin check; tests of the check turn it on.
      ...(options.originCheck === "always"
        ? { disableCSRFCheck: false, disableOriginCheck: false }
        : {}),
      ...(options.workers?.waitUntil
        ? { backgroundTasks: { handler: options.workers.waitUntil } }
        : {}),
    },
    plugins: [
      // One organization per deployment (RFC-0005 §11). Used for its tables only: membership
      // changes go through Cloudhal's audited routes; the HTTP endpoints answer 404 (I3).
      organization({
        ac: orgAc,
        roles: orgRoles,
        creatorRole: "owner",
        allowUserToCreateOrganization: false,
        schema: { invitation: { additionalFields: INVITATION_FIELDS } },
      }),
      admin(),
      // Non-interactive credentials for agents/CI: `x-api-key` or `Authorization: Bearer` → `agent`
      // actor (ADR-0011); `resolvePrincipal` reads them (`agentKeyFrom`).
      apiKey({
        apiKeyHeaders: API_KEY_HEADER,
        enableMetadata: true,
        // Cloudhal limits keys itself (`resolvePrincipal`): the plugin's window only resets after a
        // pause as long as the window, so an agent polling steadily was locked out for good once it
        // had made `maxRequests` calls in total — and the refusal surfaced as "unauthorized".
        rateLimit: { enabled: false },
      }),
      ...oauth,
    ],
  });
  return instance as unknown as Auth;
}

/** Per-instance secrets of the server's own internal calls (never sent to a client). */
export interface InternalKeys {
  /**
   * Marks calls the server makes to the provider itself: the consent `AgentGrantService.consent`
   * forwards, and server-side client registration (`OauthServer.createClient`).
   */
  readonly serverKey: string;
  /** The `agent_grants` rows (RFC-0044 §5): the token claim and the authorize checks read them. */
  readonly grants: GrantStore;
}

/** Provider endpoints Cloudhal checks first (`oauth-hooks.ts`). */
const OAUTH_HOOK_PATHS: ReadonlySet<string> = new Set(["/oauth2/authorize", "/oauth2/token"]);

/** The header that carries `InternalKeys.serverKey`. */
export const SERVER_KEY_HEADER = "x-cloudhal-server-key";

export function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= (ea[i] as number) ^ (eb[i] as number);
  return diff === 0;
}
