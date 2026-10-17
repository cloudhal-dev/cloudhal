import {
  type AgentMode,
  activeElevation,
  clampMode,
  DEFAULT_AGENT_MODE,
  defaultScopes,
  holds,
  isAgentMode,
  isKeyScope,
  type ModeElevation,
  modeCap,
  narrow,
  type PersonRef,
  type Role,
  roleScopes,
  type Scope,
} from "@cloudhal/agent-runtime";
import type { Actor } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { type MemberRow, StaffStore } from "../staff.ts";
import { type AgentKeySummary, API_KEY_PERMISSION_RESOURCE } from "./types.ts";

export interface ApiKeyRow {
  id: string;
  name?: string | null;
  start?: string | null;
  referenceId?: string | null;
  permissions?: Record<string, string[]> | string | null;
  createdAt: Date | string;
  expiresAt?: Date | string | null;
  enabled?: boolean | number | null;
  metadata?: Record<string, unknown> | string | null;
}

export function metadataOf(row: ApiKeyRow): Record<string, unknown> {
  let meta = row.metadata;
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta) as Record<string, unknown>;
      // older rows were stringified twice
      if (typeof meta === "string") meta = JSON.parse(meta) as Record<string, unknown>;
    } catch {
      meta = null;
    }
  }
  return meta && typeof meta === "object" ? meta : {};
}

export function permissionsOf(row: ApiKeyRow): string[] | undefined {
  let perms = row.permissions;
  if (typeof perms === "string") {
    try {
      perms = JSON.parse(perms) as Record<string, string[]>;
    } catch {
      perms = null;
    }
  }
  const granted = perms && typeof perms === "object" ? perms[API_KEY_PERMISSION_RESOURCE] : null;
  return Array.isArray(granted) ? granted : undefined;
}

/** RFC-0008 §11.2: the automation an automation key belongs to. */
export function automationOf(row: ApiKeyRow): string | undefined {
  const meta = metadataOf(row);
  return meta.purpose === "automation" && typeof meta.automationId === "string"
    ? meta.automationId
    : undefined;
}

export function modeOf(row: ApiKeyRow): AgentMode {
  const mode = metadataOf(row).mode;
  return isAgentMode(mode) ? mode : DEFAULT_AGENT_MODE;
}

/** Better Auth revives ISO strings in metadata as `Date`s; summaries and checks use ISO strings. */
export function isoOf(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  return typeof value === "string" ? value : undefined;
}

/** The key's elevation if one is in force at `now`. */
export function elevationOf(row: ApiKeyRow, now: Date): ModeElevation | undefined {
  const raw = metadataOf(row).elevation as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object" || !isAgentMode(raw.mode)) return undefined;
  const until = isoOf(raw.until);
  if (!until) return undefined;
  const elevation: ModeElevation = {
    mode: raw.mode,
    until,
    grantedBy: typeof raw.grantedBy === "string" ? raw.grantedBy : "",
    grantedAt: isoOf(raw.grantedAt) ?? "",
    ...(typeof raw.reason === "string" ? { reason: raw.reason } : {}),
  };
  return activeElevation(modeOf(row), elevation, now);
}

export interface VerifiedApiKey {
  valid: boolean;
  key: ApiKeyRow | null;
}

/** The agent actor id an API key's calls are recorded under. */
export function agentIdForKey(keyId: string): string {
  return `agent_${keyId
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 32)
    .padEnd(6, "0")}`;
}

/** The scopes stored on a key (legacy keys without permissions get the agent defaults). */
export function storedScopes(row: ApiKeyRow): Scope[] {
  const granted = permissionsOf(row);
  const agent: Actor = { kind: "agent", id: agentIdForKey(row.id) };
  return (granted ?? defaultScopes(agent)).filter(isKeyScope);
}

/** `role`: the creator's current role; `null` when they are no longer a member (the key is dead). */
export function toSummary(
  row: ApiKeyRow,
  now: Date,
  role: Role | null | undefined,
): AgentKeySummary {
  const iso = (d: Date | string | null | undefined) =>
    d == null ? null : typeof d === "string" ? d : d.toISOString();
  const mode = modeOf(row);
  const elevation = elevationOf(row, now);
  const scopes = storedScopes(row);
  const cap = role ? modeCap(role) : "auto";
  const effective = elevation?.mode ?? mode;
  return {
    id: row.id,
    name: row.name ?? null,
    start: row.start ?? null,
    scopes,
    effectiveScopes: role ? narrow(scopes, roleScopes(role)) : role === undefined ? scopes : [],
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
    expiresAt: iso(row.expiresAt),
    enabled: row.enabled !== false && row.enabled !== 0,
    mode,
    ...(elevation ? { elevation } : {}),
    effectiveMode: clampMode(effective, cap),
    agentId: agentIdForKey(row.id),
    ...(automationOf(row) ? { automationId: automationOf(row) as string } : {}),
  };
}

/**
 * An agent key's state read straight from the database, outside any request (RFC-0008 §10.6: the
 * scheduler re-checks an `auto` release's key when it runs): enabled, its creator's role (`null`
 * once they left) and the mode its next call would run in.
 */
export async function agentKeyStateFromSql(
  sql: SqlDriver,
  keyId: string,
  now: Date,
): Promise<{ enabled: boolean; creatorRole: Role | null; effectiveMode: AgentMode } | undefined> {
  const row = await sql.get<ApiKeyRow & Record<string, unknown>>(
    'SELECT * FROM "apikey" WHERE "id" = ?',
    [keyId],
  );
  if (!row) return undefined;
  const role = (await new StaffStore(sql, () => now).member(row.referenceId ?? ""))?.role ?? null;
  const summary = toSummary(row, now, role);
  return { enabled: summary.enabled, creatorRole: role, effectiveMode: summary.effectiveMode };
}

/** Better Auth ids are base62; prefix them so they match the contracts' `Id` pattern. */
export function actorIdForUser(userId: string): string {
  const safe = userId.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
  return `user_${safe.length >= 6 ? safe : safe.padEnd(6, "0")}`;
}

export function personRef(member: MemberRow): PersonRef {
  return {
    id: actorIdForUser(member.userId),
    userId: member.userId,
    role: member.role,
    name: member.name,
  };
}

export function roleScopesHold(role: Role, scope: Scope): boolean {
  return holds(roleScopes(role), scope);
}
