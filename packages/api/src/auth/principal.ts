import {
  clampMode,
  isMoreAutonomous,
  modeCap,
  narrow,
  type Principal,
  roleScopes,
} from "@cloudhal/agent-runtime";
import type { Actor } from "@cloudhal/core-contracts";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { PrincipalResolver } from "../context.ts";
import type { AuthDeps } from "./deps.ts";
import {
  actorIdForUser,
  agentIdForKey,
  automationOf,
  elevationOf,
  modeOf,
  personRef,
  storedScopes,
} from "./key-rows.ts";
import { API_KEY_HEADER } from "./types.ts";

export function createPrincipalResolver(d: AuthDeps): PrincipalResolver {
  const { now, staffStore, keyLimit, instance, api } = d;
  const resolvePrincipal: PrincipalResolver = async (
    c: Context,
  ): Promise<Principal | undefined> => {
    const key = c.req.header(API_KEY_HEADER);
    if (key) {
      const verified = await api.verifyApiKey({ body: { key } });
      if (!verified.valid || !verified.key) return undefined;
      // A fixed window per key (`rateLimit` table): it resets every window however busy the key is.
      if (
        !(await staffStore.hit(`cloudhal:key:${verified.key.id}`, keyLimit.windowMs, keyLimit.max))
      )
        throw new HTTPException(429, {
          res: Response.json(
            {
              error: "rate_limited",
              message: `this API key made more than ${keyLimit.max} requests in ${Math.round(keyLimit.windowMs / 1000)} s; wait and try again`,
            },
            {
              status: 429,
              headers: { "retry-after": String(Math.ceil(keyLimit.windowMs / 1000)) },
            },
          ),
        });
      // An agent never exceeds its creator (I5): no creator membership, no key.
      const creator = verified.key.referenceId
        ? await staffStore.member(verified.key.referenceId)
        : undefined;
      if (!creator) return undefined;
      const actor: Actor = {
        kind: "agent",
        id: agentIdForKey(verified.key.id),
        name: verified.key.name ?? "API key",
      };
      const scopes = narrow(storedScopes(verified.key), roleScopes(creator.role));
      // The mode is worked out on every call, so an elevation ends on time by itself (ADR-0016),
      // and never above the creator's cap (I6).
      const cap = modeCap(creator.role);
      const base = clampMode(modeOf(verified.key), cap);
      const raw = elevationOf(verified.key, now());
      const elevation = raw && !isMoreAutonomous(raw.mode, cap) ? raw : undefined;
      return {
        actor,
        scopes,
        mode: elevation?.mode ?? base,
        ...(elevation ? { elevation: { from: base, until: elevation.until } } : {}),
        keyId: verified.key.id,
        ...(automationOf(verified.key) ? { automationId: automationOf(verified.key) } : {}),
        person: personRef(creator),
      };
    }
    const session = await instance.api.getSession({ headers: c.req.raw.headers });
    if (!session) return undefined;
    const actor: Actor = {
      kind: "human",
      id: actorIdForUser(session.user.id),
      name: session.user.name,
    };
    const member = await staffStore.member(session.user.id);
    // No membership, no scopes (I1): only /api/me, /api/auth/* and the invite routes answer.
    if (!member) return { actor, scopes: [] };
    return { actor, scopes: roleScopes(member.role), person: personRef(member) };
  };
  return resolvePrincipal;
}
