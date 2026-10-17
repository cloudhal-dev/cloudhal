/** The Better Auth instance: email and password, organization roles, admin, API keys, and the hooks that keep membership and the first owner in Cloudhal's hands. The whole `betterAuth({...})` literal stays in one function so plugin endpoint types infer. */
import { apiKey } from "@better-auth/api-key";
import { type Auth, betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import type { StaffStore } from "../staff.ts";
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
} as const;

/**
 * Typed as Better Auth's base `Auth`: its inferred plugin type cannot be named outside this
 * module, and callers reach the plugin endpoints through `authDeps`'s typed view of `api`.
 */
export function createInstance(options: AuthOptions, staff: StaffStore): Auth {
  const mode = signUpMode(options);
  const instance = betterAuth({
    // biome-ignore lint/suspicious/noExplicitAny: Better Auth accepts several concrete DB handles
    database: options.database as any,
    baseURL: options.baseURL,
    secret: options.secret,
    trustedOrigins: [...(options.trustedOrigins ?? [])],
    emailAndPassword: {
      enabled: true,
      disableSignUp: mode === "closed",
      autoSignIn: true,
    },
    telemetry: { enabled: false },
    hooks: {
      // Checked before the endpoint runs (outside Better Auth's write transaction, which would
      // deadlock a second query on single-connection SQLite).
      before: createAuthMiddleware(async (ctx) => {
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
                "Creating the owner account needs the setup link printed by `cloudhal deploy`.",
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
    ...(options.workers
      ? {
          rateLimit: { enabled: true, storage: "database" as const },
          advanced: {
            ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
            ...(options.workers.waitUntil
              ? { backgroundTasks: { handler: options.workers.waitUntil } }
              : {}),
          },
        }
      : {}),
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
      // Non-interactive credentials for agents/CI: `x-api-key` → `agent` actor (ADR-0011).
      apiKey({
        apiKeyHeaders: API_KEY_HEADER,
        enableMetadata: true,
        // Cloudhal limits keys itself (`resolvePrincipal`): the plugin's window only resets after a
        // pause as long as the window, so an agent polling steadily was locked out for good once it
        // had made `maxRequests` calls in total — and the refusal surfaced as "unauthorized".
        rateLimit: { enabled: false },
      }),
    ],
  });
  return instance as unknown as Auth;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= (ea[i] as number) ^ (eb[i] as number);
  return diff === 0;
}
