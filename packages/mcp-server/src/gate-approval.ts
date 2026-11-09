/**
 * The approval a gate change (RFC-0008 §6.4) carries when no request is needed: the person's, or
 * an agent key's `auto` approval for a reduction. An OAuth connection (RFC-0044) is an agent too,
 * never the person behind it, and has no `auto` approval of its own yet, so its gate change waits
 * for a person.
 */
import { agentCredential } from "@cloudhal/agent-runtime";
import type { Release } from "@cloudhal/core-contracts";
import { canonicalInstant } from "@cloudhal/schedules";
import type { ToolContext } from "./common.ts";
import { personApproval } from "./schedules.ts";

/** What `set_embargo` answers an OAuth connection on live content. */
export const NO_GRANT_GATES =
  "The embargo is saved, but an OAuth connection cannot put it live on its own: the content stays visible until a person publishes it (or an agent key sets the embargo).";

/** The approval, or `undefined` when the caller is an OAuth connection (it waits for a person). */
export function directApproval(ctx: ToolContext, at: string): Release["approval"] | undefined {
  const credential = agentCredential(ctx.principal);
  if (credential && !ctx.confirmed) {
    if (credential.kind !== "key") return undefined;
    return {
      kind: "auto",
      by: ctx.principal.actor,
      keyId: credential.id,
      at,
      windowEnds: canonicalInstant(Date.parse(at) + 24 * 3_600_000),
    };
  }
  return personApproval(ctx.principal, at);
}
