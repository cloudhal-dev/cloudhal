import { type AgentMode, isMoreAutonomous, modeCap, type Role } from "@cloudhal/agent-runtime";
import { StaffStore } from "../staff.ts";
import { createInstance } from "./instance.ts";
import { type ApiKeyRow, roleScopesHold, type VerifiedApiKey } from "./key-rows.ts";
import {
  AGENT_KEY_RATE_LIMIT,
  AuthError,
  type AuthOptions,
  NOT_A_MEMBER_MESSAGE,
} from "./types.ts";

export function authDeps(options: AuthOptions) {
  const now = options.now ?? (() => new Date());
  const staffStore = new StaffStore(options.sql, now);
  const keyLimit = options.agentKeyRateLimit ?? AGENT_KEY_RATE_LIMIT;
  const instance = createInstance(options, staffStore);
  const api = instance.api as unknown as {
    verifyApiKey(input: { body: { key: string } }): Promise<VerifiedApiKey>;
    createApiKey(input: {
      body: {
        name: string;
        userId: string;
        permissions: Record<string, string[]>;
        metadata?: Record<string, unknown>;
      };
    }): Promise<ApiKeyRow & { key: string }>;
    updateApiKey(input: {
      body: {
        keyId: string;
        userId: string;
        metadata?: Record<string, unknown>;
        permissions?: Record<string, string[]>;
      };
    }): Promise<ApiKeyRow>;
    createUser(input: {
      body: { email: string; password: string; name: string; data?: Record<string, unknown> };
    }): Promise<{ user: { id: string; name: string; email: string } }>;
    signInEmail(input: {
      body: { email: string; password: string };
      returnHeaders: true;
    }): Promise<{ headers: Headers; response: unknown }>;
  };
  type AdapterLike = {
    findMany<T>(input: {
      model: string;
      where?: { field: string; value: unknown }[];
      limit?: number;
    }): Promise<T[]>;
    findOne<T>(input: {
      model: string;
      where: { field: string; value: unknown }[];
    }): Promise<T | null>;
    delete(input: { model: string; where: { field: string; value: unknown }[] }): Promise<void>;
  };
  type AuthContextLike = {
    adapter: AdapterLike;
    password: {
      hash(password: string): Promise<string>;
      verify(input: { hash: string; password: string }): Promise<boolean>;
    };
    internalAdapter: {
      deleteUserSessions(userId: string): Promise<void>;
      findCredentialAccount(userId: string): Promise<{ password?: string | null } | null>;
      updatePassword(userId: string, hash: string): Promise<void>;
      createAccount(input: Record<string, unknown>): Promise<unknown>;
      findUserByEmail(
        email: string,
      ): Promise<{ user: { id: string; name: string; email: string } } | null>;
      updateUser(userId: string, data: Record<string, unknown>): Promise<unknown>;
    };
  };
  const context = () => (instance as unknown as { $context: Promise<AuthContextLike> }).$context;

  const keyById = async (id: string) =>
    (await context()).adapter.findOne<ApiKeyRow>({
      model: "apikey",
      where: [{ field: "id", value: id }],
    });
  const keysOf = async (userId: string) =>
    (await context()).adapter.findMany<ApiKeyRow>({
      model: "apikey",
      where: [{ field: "referenceId", value: userId }],
      limit: 500,
    });

  /** The signed-in person and their membership (refuses non-members). */
  const caller = async (headers: Headers, message: string) => {
    const session = await instance.api.getSession({ headers });
    if (!session) throw new AuthError(message, { status: 401, code: "unauthorized" });
    const member = await staffStore.member(session.user.id);
    if (!member) throw new AuthError(NOT_A_MEMBER_MESSAGE, { status: 403, code: "not_a_member" });
    return { userId: session.user.id, member };
  };

  /** One of the caller's own keys, or with `manage` any key when the role holds agents:manage. */
  const keyFor = async (headers: Headers, id: string, manage: boolean) => {
    const who = await caller(headers, "sign in to change agent keys");
    const key = await keyById(id);
    if (!key) throw new AuthError("unknown agent key", { status: 404, code: "not_found" });
    if (key.referenceId === who.userId) return { who, key, own: true };
    const canManage = manage && roleScopesHold(who.member.role, "agents:manage");
    // Someone else's key is invisible without agents:manage (no existence oracle).
    if (!canManage) throw new AuthError("unknown agent key", { status: 404, code: "not_found" });
    return { who, key, own: false };
  };

  const capProblem = (role: Role, mode: AgentMode) => {
    const cap = modeCap(role);
    if (isMoreAutonomous(mode, cap))
      throw new AuthError(`your role allows keys up to ${cap.toUpperCase()} mode`, {
        code: "mode_above_role",
      });
  };
  return {
    now,
    staffStore,
    keyLimit,
    instance,
    api,
    context,
    keyById,
    keysOf,
    caller,
    keyFor,
    capProblem,
  };
}

export type AuthDeps = ReturnType<typeof authDeps>;
