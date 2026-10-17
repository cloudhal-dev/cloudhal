import {
  clampMode,
  isMoreAutonomous,
  modeCap,
  narrow,
  type OwnershipResolver,
  roleScopes,
} from "@cloudhal/agent-runtime";
import type { AuthDeps } from "./deps.ts";
import { actorIdForUser, elevationOf, modeOf, permissionsOf, storedScopes } from "./key-rows.ts";
import { API_KEY_PERMISSION_RESOURCE, type KeyNarrowing, type StaffService } from "./types.ts";

export function createStaffService(d: AuthDeps): StaffService {
  const { now, staffStore, instance, api, context, keysOf } = d;
  const ownership: OwnershipResolver = {
    async personOf(actor) {
      if (actor.kind === "human") return actor.id;
      if (actor.kind !== "agent") return undefined;
      const userId = await staffStore.userOfAgent(actor.id);
      return userId ? actorIdForUser(userId) : undefined;
    },
  };

  const staff: StaffService = {
    store: staffStore,
    ownership,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    async sessionUserId(headers) {
      return (await instance.api.getSession({ headers }))?.user.id;
    },
    async userByEmail(email) {
      const found = await (await context()).internalAdapter.findUserByEmail(email.toLowerCase());
      return found
        ? { id: found.user.id, name: found.user.name, email: found.user.email }
        : undefined;
    },
    async verifyPassword(userId, password) {
      const ctx = await context();
      const account = await ctx.internalAdapter.findCredentialAccount(userId);
      if (!account?.password) return false;
      return ctx.password.verify({ hash: account.password, password });
    },
    async createUser({ email, name, password, emailVerified }) {
      const { user } = await api.createUser({
        body: { email, password, name, data: { emailVerified } },
      });
      return { id: user.id, name: user.name, email: user.email };
    },
    async markEmailVerified(userId) {
      await (await context()).internalAdapter.updateUser(userId, { emailVerified: true });
    },
    async signIn(email, password) {
      const { headers } = await api.signInEmail({ body: { email, password }, returnHeaders: true });
      return headers;
    },
    async revokeSessions(userId) {
      await (await context()).internalAdapter.deleteUserSessions(userId);
    },
    async setPassword(userId, password) {
      const ctx = await context();
      const hash = await ctx.password.hash(password);
      if (await ctx.internalAdapter.findCredentialAccount(userId))
        await ctx.internalAdapter.updatePassword(userId, hash);
      else
        await ctx.internalAdapter.createAccount({
          userId,
          providerId: "credential",
          accountId: userId,
          password: hash,
        });
    },
    async narrowKeys(userId, role) {
      const out: KeyNarrowing[] = [];
      const cap = modeCap(role);
      const at = now();
      for (const key of await keysOf(userId)) {
        const from = storedScopes(key);
        const to = narrow(from, roleScopes(role));
        const mode = modeOf(key);
        const nextMode = clampMode(mode, cap);
        const elevation = elevationOf(key, at);
        const elevationEnded = elevation !== undefined && isMoreAutonomous(elevation.mode, cap);
        const scopesChanged =
          to.length !== from.length || to.some((s, i) => s !== from[i]) || !permissionsOf(key);
        if (!scopesChanged && nextMode === mode && !elevationEnded) continue;
        await api.updateApiKey({
          body: {
            keyId: key.id,
            userId,
            permissions: { [API_KEY_PERMISSION_RESOURCE]: to },
            metadata: {
              mode: nextMode,
              ...(elevation && !elevationEnded ? { elevation } : {}),
            },
          },
        });
        out.push({
          keyId: key.id,
          name: key.name ?? null,
          scopes: { from, to },
          mode: { from: mode, to: nextMode },
          elevationEnded,
        });
      }
      return out;
    },
  };
  return staff;
}
