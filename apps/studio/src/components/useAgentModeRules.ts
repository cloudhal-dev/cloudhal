import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type ModeRules, modeRules } from "../lib/agents.ts";
import { api } from "../lib/api.ts";

/**
 * The agent-mode rules this server applies (`/api/instance` → `agentModes`, ADR-0015): which modes
 * a key can hold, the default, the scopes each mode gets and the auto-publish limit. Until the
 * answer arrives, or on servers that do not report them, Studio's own copy applies.
 */
export function useAgentModeRules(): ModeRules {
  const instance = useQuery({
    queryKey: ["instance"],
    queryFn: api.instance,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return useMemo(() => modeRules(instance.data?.agentModes), [instance.data]);
}
