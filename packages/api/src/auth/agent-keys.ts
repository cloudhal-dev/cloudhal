import {
  DEFAULT_AGENT_MODE,
  elevationProblem,
  holds,
  isKeyScope,
  isMoreAutonomous,
  KEY_SCOPES,
  type ModeElevation,
  narrow,
  REMOTE_AGENT_MODES,
  roleScopes,
  type Scope,
  scopesAboveRole,
  scopesForMode,
} from "@cloudhal/agent-runtime";
import type { AuthDeps } from "./deps.ts";
import {
  type ApiKeyRow,
  actorIdForUser,
  agentIdForKey,
  elevationOf,
  modeOf,
  roleScopesHold,
  storedScopes,
  toSummary,
} from "./key-rows.ts";
import {
  ADDABLE_KEY_SCOPES,
  type AgentKeyService,
  API_KEY_PERMISSION_RESOURCE,
  AuthError,
} from "./types.ts";

export function createAgentKeyService(d: AuthDeps): AgentKeyService {
  return { ...keyWrites(d), ...keyReads(d) };
}

/** Creating keys and changing their mode, elevation and scopes (RFC-0005 §5, ADR-0016). */
function keyWrites(
  d: AuthDeps,
): Pick<AgentKeyService, "create" | "setMode" | "elevate" | "endElevation" | "addScopes"> {
  const { now, staffStore, api, caller, keyFor, capProblem } = d;
  return {
    async create({ headers, name, mode = DEFAULT_AGENT_MODE, scopes: requested, automationId }) {
      const who = await caller(headers, "sign in to create agent keys");
      if (!REMOTE_AGENT_MODES.includes(mode))
        throw new AuthError(`mode "${mode}" is not available for API keys (bypass is local only)`);
      capProblem(who.member.role, mode);
      const role = who.member.role;
      let scopes: Scope[];
      if (requested) {
        const bad = requested.filter((s) => !isKeyScope(s));
        if (bad.length)
          throw new AuthError(
            `unknown scopes: ${bad.join(", ")} (keys can hold ${KEY_SCOPES.join(", ")})`,
          );
        const above = scopesAboveRole(requested, role);
        if (above.length)
          throw new AuthError(`your role cannot give a key ${above.join(", ")}`, {
            code: "scope_above_role",
          });
        scopes = [...new Set(requested)];
      } else scopes = narrow(scopesForMode(mode), roleScopes(role));
      // Server-side call (no request/headers): permissions are a server-only property.
      const row = await api.createApiKey({
        body: {
          name,
          userId: who.userId,
          permissions: { [API_KEY_PERMISSION_RESOURCE]: scopes },
          metadata: { mode, ...(automationId ? { automationId, purpose: "automation" } : {}) },
        },
      });
      await staffStore.recordAgent(agentIdForKey(row.id), who.userId, row.id);
      return { ...toSummary(row, now(), role), key: row.key };
    },
    async setMode({ headers, id, mode }) {
      if (!REMOTE_AGENT_MODES.includes(mode))
        throw new AuthError(`mode "${mode}" is not available for API keys (bypass is local only)`);
      const { who, key } = await keyFor(headers, id, false);
      capProblem(who.member.role, mode);
      // An elevation stays in force unless the key's own mode now reaches it.
      const elevation = elevationOf(key, now());
      const keep = elevation && isMoreAutonomous(elevation.mode, mode) ? { elevation } : {};
      const row = await api.updateApiKey({
        body: { keyId: id, userId: who.userId, metadata: { mode, ...keep } },
      });
      return toSummary(row, now(), who.member.role);
    },
    async elevate({ headers, id, mode, minutes, reason }) {
      // Only the key's creator grants an elevation (RFC-0005 §5.2, open question 12).
      const { who, key } = await keyFor(headers, id, false);
      const base = modeOf(key);
      const problem = elevationProblem(base, mode, minutes);
      if (problem) throw new AuthError(problem);
      capProblem(who.member.role, mode);
      const at = now();
      const elevation: ModeElevation = {
        mode,
        until: new Date(at.getTime() + minutes * 60_000).toISOString(),
        grantedBy: actorIdForUser(who.userId),
        grantedAt: at.toISOString(),
        ...(reason?.trim() ? { reason: reason.trim().slice(0, 200) } : {}),
      };
      const row = await api.updateApiKey({
        body: { keyId: id, userId: who.userId, metadata: { mode: base, elevation } },
      });
      return toSummary(row, now(), who.member.role);
    },
    async endElevation({ headers, id }) {
      const { key } = await keyFor(headers, id, true);
      const creator = key.referenceId as string;
      const row = await api.updateApiKey({
        body: { keyId: id, userId: creator, metadata: { mode: modeOf(key) } },
      });
      return toSummary(row, now(), (await staffStore.member(creator))?.role ?? null);
    },
    async addScopes({ headers, id, scopes: requested }) {
      const bad = requested.filter((s) => !ADDABLE_KEY_SCOPES.includes(s));
      if (bad.length || !requested.length)
        throw new AuthError(
          `only ${ADDABLE_KEY_SCOPES.join(", ")} can be added to an existing key${bad.length ? ` (not ${bad.join(", ")})` : ""}`,
          { code: "scope_not_addable" },
        );
      const { who, key } = await keyFor(headers, id, true);
      const creator = key.referenceId as string;
      const creatorRole = (await staffStore.member(creator))?.role ?? null;
      // The key is narrowed to its creator's role on every call anyway; refusing here keeps the
      // stored scopes honest (a Contributor's key cannot hold analytics:read or comments:read).
      const above = [
        ...scopesAboveRole(requested, who.member.role),
        ...(creatorRole ? scopesAboveRole(requested, creatorRole) : requested),
      ];
      if (above.length)
        throw new AuthError(
          `${creatorRole === who.member.role ? "your role" : "the key creator's role"} cannot give a key ${[...new Set(above)].join(", ")}`,
          { code: "scope_above_role" },
        );
      const stored = storedScopes(key);
      const added = [...new Set(requested)].filter((s) => !holds(stored, s));
      if (!added.length) return { key: toSummary(key, now(), creatorRole), added };
      const elevation = elevationOf(key, now());
      const row = await api.updateApiKey({
        body: {
          keyId: id,
          userId: creator,
          permissions: { [API_KEY_PERMISSION_RESOURCE]: [...stored, ...added] },
          metadata: { mode: modeOf(key), ...(elevation ? { elevation } : {}) },
        },
      });
      return { key: toSummary(row, now(), creatorRole), added };
    },
  };
}

/** Listing, reading and deleting keys. */
function keyReads(d: AuthDeps): Pick<AgentKeyService, "list" | "state" | "delete"> {
  const { now, staffStore, context, keyById, keysOf, caller, keyFor } = d;
  return {
    async list({ headers, all }) {
      const who = await caller(headers, "sign in to list agent keys");
      const at = now();
      if (!all) {
        const rows = await keysOf(who.userId);
        return rows
          .map((row) => toSummary(row, at, who.member.role))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }
      if (!roleScopesHold(who.member.role, "agents:manage"))
        throw new AuthError("listing every key needs agents:manage", {
          status: 403,
          code: "missing_scope",
        });
      const members = new Map((await staffStore.list()).map((m) => [m.userId, m]));
      const rows = await (await context()).adapter.findMany<ApiKeyRow>({
        model: "apikey",
        limit: 1000,
      });
      return rows
        .map((row) => {
          const owner = members.get(row.referenceId ?? "");
          return {
            ...toSummary(row, at, owner?.role ?? null),
            owner: {
              userId: row.referenceId ?? "",
              name: owner?.name ?? null,
              role: owner?.role ?? null,
            },
          };
        })
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async state(keyId) {
      const key = await keyById(keyId);
      if (!key) return undefined;
      const role = (await staffStore.member(key.referenceId ?? ""))?.role ?? null;
      const summary = toSummary(key, now(), role);
      return { enabled: summary.enabled, creatorRole: role, effectiveMode: summary.effectiveMode };
    },
    async delete({ headers, id }) {
      const { key } = await keyFor(headers, id, true);
      const summary = toSummary(
        key,
        now(),
        (await staffStore.member(key.referenceId ?? ""))?.role ?? null,
      );
      await (await context()).adapter.delete({
        model: "apikey",
        where: [{ field: "id", value: id }],
      });
      return summary;
    },
  };
}
