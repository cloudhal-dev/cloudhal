import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useT } from "../i18n/index.tsx";
import { type Ability, api, isNotEnabled, listOf, type Me, type Role } from "../lib/api.ts";
import { inviteRules, minimumRole, type RoleRules, roleRules, type Self } from "../lib/roles.ts";

export const ME_KEY = ["me"] as const;

/**
 * The signed-in person (`GET /api/me`): actor, role, scopes and the `can` ability map. One cached
 * query (`["me"]`) shared by the shell, the account menu and every gated control; a role change
 * (Members, the `role-changed` notification) invalidates it.
 */
/**
 * The site the Studio URL is about (`/sites/<id>/…`), read from the location so the hook also works
 * outside the router (dialogs in tests, the account surface).
 */
export function currentSiteId(): string | undefined {
  const match = /^\/sites\/([^/]+)/.exec(globalThis.location?.pathname ?? "");
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function useMe() {
  const base = useQuery({ queryKey: ME_KEY, queryFn: api.me, staleTime: 60_000 });
  // RFC-0034 A2: inside a site, a person limited to sites is gated by their role on that site.
  const siteId = currentSiteId();
  const limited = base.data?.sites !== undefined;
  const onSite = useQuery({
    queryKey: [...ME_KEY, siteId],
    queryFn: () => api.meOnSite(siteId as string),
    enabled: limited && siteId !== undefined,
    staleTime: 60_000,
    retry: false,
  });
  return limited && siteId && onSite.data ? { ...base, data: onSite.data } : base;
}

/**
 * Whether the signed-in person may do `ability` (RFC-0005 I16). Gating is cosmetic and the server
 * decides, so anything not known to be denied — still loading, an older server without `can`, a
 * server without roles — reads as allowed.
 */
export function canFrom(me: Me | undefined, ability: Ability): boolean {
  return me?.can?.[ability] !== false;
}

export function useCan(ability: Ability): boolean {
  return canFrom(useMe().data, ability);
}

/** The server's role rules (`/api/instance` → `roles`), else Studio's copy. */
export function useRoleRules(): RoleRules {
  const instance = useQuery({
    queryKey: ["instance"],
    queryFn: api.instance,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return useMemo(() => roleRules(instance.data?.roles), [instance.data]);
}

/** The server's invite rules (`/api/instance` → `invites`), else Studio's copy. */
export function useInviteRules() {
  const instance = useQuery({
    queryKey: ["instance"],
    queryFn: api.instance,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return useMemo(() => inviteRules(instance.data?.invites), [instance.data]);
}

/** A role's name in the person's language (`roles.names.*`). */
export function useRoleName() {
  const t = useT();
  return (role: Role) => t(`roles.names.${role}`);
}

/**
 * `{allowed, reason}` for a gated control: disabled controls carry the reason as their tooltip
 * (Kumo `Button title`), e.g. "Only Editors and above can publish". DESIGN.md §2s.
 */
export function useGate(ability: Ability): { allowed: boolean; reason: string | undefined } {
  const t = useT();
  const me = useMe().data;
  const rules = useRoleRules();
  const allowed = canFrom(me, ability);
  if (allowed) return { allowed, reason: undefined };
  const role = minimumRole(rules, ability);
  return {
    allowed,
    reason: t(`gating.abilities.${ability}`, {
      role: t(`roles.names.${role}`),
      roles: t(`roles.plural.${role}`),
    }),
  };
}

export const MEMBERS_KEY = ["members"] as const;

/**
 * The deployment's members (`GET /api/members`, any member may read names and roles). A server
 * without roles answers 404 once and is not asked again.
 */
export function useMembers(enabled = true) {
  return useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: api.members.list,
    enabled,
    staleTime: 30_000,
    retry: (count, error) => !isNotEnabled(error) && count < 1,
  });
}

/** People's roles by actor id (`user_…`), for role badges next to names in Approvals and Activity. */
export function useMemberRoles(): Map<string, Role> {
  const members = useMembers();
  return useMemo(
    () => new Map(listOf(members.data).map((m) => [m.actorId, m.role])),
    [members.data],
  );
}

/** Who "I" am for ownership checks: my actor id and my own keys' agents. */
export function useSelf(): Self {
  const me = useMe().data;
  const keys = useQuery({
    queryKey: ["agent-keys"],
    queryFn: api.agentKeys.list,
    retry: false,
    staleTime: 60_000,
  });
  return useMemo(
    () => ({
      actorId: me?.actor.id,
      agentIds: new Set(
        listOf(keys.data)
          .map((k) => k.agentId)
          .filter((id): id is string => !!id),
      ),
    }),
    [me?.actor.id, keys.data],
  );
}
