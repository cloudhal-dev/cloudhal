/** Shared by the operator (`/api/admin`) sub-apps: deps, the operator actor, no-store. */

import type { StoragePair } from "@cloudhal/core-ts";
import type { RenderDeps } from "@cloudhal/mcp-server/tools";
import type { AiTransport } from "../../ai/client.ts";

/** What the admin sub-apps need beyond the request context. */
export interface AdminDeps {
  storage: StoragePair;
  aiTransport?: AiTransport | undefined;
  /** A browser for the eval's design pass (RFC-0021 21c). */
  render?: RenderDeps | undefined;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= (ea[i] as number) ^ (eb[i] as number);
  return diff === 0;
}

/** The operator, as audit rows show them. */
export const OPERATOR_ACTOR = { kind: "system" as const, id: "sys_operator01", name: "Operator" };

/** Admin answers are never cached (Workers Cache caches header-less GETs, RFC-0008 step 0). */
export const NO_STORE = { "cache-control": "no-store", "cloudflare-cdn-cache-control": "no-store" };
