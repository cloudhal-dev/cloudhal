import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type ModeRules, modeRules } from "../lib/agents.ts";
import { api } from "../lib/api.ts";
import { roleRules } from "../lib/roles.ts";

/**
 * The agent-mode rules this server applies (`/api/instance` → `agentModes`, ADR-0015): which modes
 * a key can hold, the default, the scopes each mode gets and the auto-publish limit. Until the
 * answer arrives, or on servers that do not report them, Studio's own copy applies.
 *
 * With staff roles (RFC-0005 §5) the rules also follow the signed-in person: `keyModes` stops at
 * their role's cap and `scopesFor` narrows a mode's scopes to their role, so every key dialog
 * offers only what the server would accept.
 */
export function useAgentModeRules(): ModeRules {
  const instance = useQuery({
    queryKey: ["instance"],
    queryFn: api.instance,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: 60_000, retry: false });
  const role = me.data?.role ?? undefined;
  return useMemo(() => {
    const roles = instance.data?.roles ? roleRules(instance.data.roles) : undefined;
    return modeRules(
      instance.data?.agentModes,
      role && roles ? { cap: roles.modeCaps[role], scopes: roles.scopes[role] } : undefined,
    );
  }, [instance.data, role]);
}
