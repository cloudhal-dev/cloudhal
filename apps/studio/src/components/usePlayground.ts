import { useQuery } from "@tanstack/react-query";
import { api, type PlaygroundInfo } from "../lib/api.ts";

/** RFC-0036 §5: the playground session (`features.playground`), when Studio runs on one. */
export function usePlayground(): PlaygroundInfo | undefined {
  const instance = useQuery({
    queryKey: ["instance"],
    queryFn: api.instance,
    retry: false,
    staleTime: 60_000,
  });
  return instance.data?.features.playground;
}

/** Account screens a playground refuses (people, agent keys and skills, sign-in settings). */
export function isPlaygroundBlockedPath(pathname: string): boolean {
  return /^\/(agents|team|account)(\/|$)/.test(pathname);
}

/** Whole minutes until `expiresAt`, never below zero. */
export function minutesLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
}
