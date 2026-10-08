/**
 * Agent-layer rules for taxonomies and redirects (RFC-0002 §6.4). Data invariants (limits, required
 * terms, slugs) live in core-ts; what an *agent* may do — create terms, point redirects off-site,
 * approve proposals — is decided here, the same for every transport.
 */
import type { Actor } from "@cloudhal/core-contracts";

/** `Taxonomy.allowNewTerms`. */
export type AllowNewTerms = "none" | "propose" | "free";

/** What a term created by an actor becomes, or why it may not be created. */
export type TermCreation =
  | { readonly allowed: true; readonly status: "active" | "proposed" }
  | { readonly allowed: false; readonly reason: string };

/**
 * Invariant 11 for an actor: people (and the system) create active terms; agents create proposed
 * terms under `propose`, active ones under `free`, and none under `none` ("ask a person").
 */
export function termCreation(actor: Actor, allowNewTerms: AllowNewTerms): TermCreation {
  if (actor.kind !== "agent") return { allowed: true, status: "active" };
  switch (allowNewTerms) {
    case "free":
      return { allowed: true, status: "active" };
    case "propose":
      return { allowed: true, status: "proposed" };
    case "none":
      return {
        allowed: false,
        reason: "only people add terms to this taxonomy; ask a person (Cloudhal Studio)",
      };
  }
}

/**
 * Why an actor may not point a redirect at `to`, or undefined. Agents redirect to paths of the same
 * site only; an external target (open-redirect risk) is a person's decision (RFC-0002, Security).
 */
export function redirectTargetProblem(actor: Actor, to: string): string | undefined {
  if (actor.kind !== "agent") return undefined;
  if (!to.startsWith("/") || to.startsWith("//") || to.includes("\\"))
    return "agents may only redirect to a path on this site (starting with a single '/'); an external target needs a person in Cloudhal Studio";
  return undefined;
}

/** A review decision on a proposed term. */
export type TermReviewDecision = "approve" | "reject" | "merge";

/**
 * Why an actor may not take a review decision on a term, or undefined. An agent never approves a
 * term it proposed itself (the person's review is the point of `propose`).
 */
export function termReviewProblem(
  actor: Actor,
  term: { readonly proposedBy?: Actor | undefined },
  decision: TermReviewDecision,
): string | undefined {
  if (actor.kind !== "agent" || decision !== "approve") return undefined;
  if (term.proposedBy?.kind === "agent" && term.proposedBy.id === actor.id)
    return "an agent cannot approve a term it proposed; a person reviews it in Cloudhal Studio";
  return undefined;
}

/** Freeing an old slug (`reclaim`) deletes a redirect people may rely on: people only. */
export function reclaimProblem(actor: Actor): string | undefined {
  return actor.kind === "agent"
    ? "reclaiming a slug from a term's history is for people only; choose another slug"
    : undefined;
}
