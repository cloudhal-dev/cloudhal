/**
 * Body proposals (RFC-0014 §5, ADR-0028): what agents proposed with `edit_body` in `propose` mode,
 * for people to accept (all of it or some operations) or reject in Studio. Accepting writes the
 * body as one ordinary write with the agent kept as the blocks' author (`via: "proposal"`); a
 * block changed since makes the proposal stale (409) instead of overwriting. Decisions are
 * audited as `edit_body` rows by the person, naming the proposal and its agent.
 *
 * - `GET /?status&nodeId` → `{ items: ProposalItem[] }`
 * - `POST /:proposalId/preview` `{ ops: number[] }` → `{ diff } | { problem }`: what accepting only
 *   those operations would change now (Studio's per-operation choice)
 * - `POST /:proposalId/accept` `{ ops?: number[] }` · `POST /:proposalId/reject`
 */
import { checkEntryLimit, holds } from "@cloudhal/agent-runtime";
import {
  type BodyDiff,
  type BodyProposal,
  bodyDiff,
  ProposalError,
  type ProposalStatus,
  type ProposalStep,
} from "@cloudhal/core-ts";
import { type Context, Hono } from "hono";
import type { Env } from "../context.ts";
import { apiError, missingScope, notFound } from "../errors.ts";
import { API_ACTOR } from "../governance.ts";
import { entryLimit, personOf } from "../own.ts";
import { param } from "../params.ts";

/** One proposal as Studio lists it: what accepting would change now, or why it no longer can. */
export interface ProposalItem {
  proposal: BodyProposal;
  /** Open proposals: each operation as it reads against the body now. */
  steps?: ProposalStep[];
  /** Open proposals: the change against the body as it is now. */
  diff?: BodyDiff;
  /** Open proposals whose operations no longer apply (a block changed or is gone). */
  problem?: string;
}

const STATUSES = new Set<ProposalStatus | "all">([
  "open",
  "accepted",
  "partial",
  "rejected",
  "stale",
  "all",
]);

async function load(c: Context<Env>): Promise<BodyProposal> {
  const proposal = await c.get("store").proposals.get(param(c, "proposalId"));
  if (!proposal || proposal.siteId !== param(c, "siteId")) throw notFound("proposal not found");
  return proposal;
}

/**
 * Who may decide: on an article, whoever may update it (own limits apply, RFC-0005 I9); on a
 * page, people with full `content:write`.
 */
async function checkDecider(c: Context<Env>, proposal: BodyProposal): Promise<void> {
  const principal = c.get("principal");
  if (proposal.sectionId) {
    if (principal && !holds(principal.scopes, "content:write")) throw missingScope("content:write");
    return;
  }
  const entry = await c.get("store").getContentEntry(proposal.nodeId);
  if (!entry) throw notFound("entry not found");
  await checkEntryLimit({
    limit: entryLimit(principal),
    op: "update",
    person: personOf(c),
    owner: c.get("ownership"),
    stored: entry,
  });
}

/** The operation indexes a request body chose, if any. */
async function chosenOps(c: Context<Env>): Promise<number[] | undefined> {
  const body = (await c.req.json().catch(() => ({}))) as { ops?: unknown };
  if (body.ops === undefined) return undefined;
  if (!Array.isArray(body.ops) || !body.ops.every((i) => Number.isInteger(i)))
    throw apiError(400, "invalid", "ops: the indexes of the operations to accept");
  return body.ops as number[];
}

/** An audit row for a decision: the person decided, the proposal and its agent named. */
async function audit(
  c: Context<Env>,
  proposal: BodyProposal,
  decision: "accepted" | "rejected",
  ops?: number[],
) {
  await c.get("audit")?.record({
    at: new Date().toISOString(),
    actor: c.get("actor") ?? API_ACTOR,
    siteId: proposal.siteId,
    tool: "edit_body",
    decision: decision === "accepted" ? "allow" : "deny",
    outcome: "ok",
    reason: `${decision} proposal ${proposal.id} from ${proposal.actor.name ?? proposal.actor.id}`,
    input: {
      proposalId: proposal.id,
      nodeId: proposal.nodeId,
      ...(proposal.sectionId ? { sectionId: proposal.sectionId } : {}),
      ...(ops ? { ops } : {}),
    },
  });
}

function proposalError(e: unknown): never {
  if (e instanceof ProposalError)
    throw apiError(e.code === "invalid" ? 400 : 409, e.code, e.message);
  throw e;
}

/** `/api/sites/:siteId/proposals`. */
export const proposals: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    const store = c.get("store");
    const status = (c.req.query("status") ?? "open") as ProposalStatus | "all";
    if (!STATUSES.has(status)) throw apiError(400, "invalid", `unknown status ${status}`);
    const nodeId = c.req.query("nodeId") || undefined;
    const list = await store.proposals.list(param(c, "siteId"), {
      ...(nodeId ? { nodeId } : {}),
      status,
    });
    const items: ProposalItem[] = await Promise.all(
      list.map(async (proposal) => {
        if (proposal.status !== "open") return { proposal };
        try {
          const preview = await store.proposals.preview(proposal);
          const steps = preview.steps;
          return preview.proposed !== undefined
            ? { proposal, steps, diff: bodyDiff(preview.current, preview.proposed) }
            : { proposal, steps, ...(preview.problem ? { problem: preview.problem } : {}) };
        } catch (e) {
          // The article or section is gone: nothing to accept.
          return { proposal, problem: e instanceof Error ? e.message : String(e) };
        }
      }),
    );
    return c.json({ items });
  })
  .post("/:proposalId/preview", async (c) => {
    const proposal = await load(c);
    const ops = await chosenOps(c);
    try {
      const preview = await c.get("store").proposals.preview(proposal, ops);
      return c.json(
        preview.proposed !== undefined
          ? { diff: bodyDiff(preview.current, preview.proposed) }
          : { problem: preview.problem },
      );
    } catch (e) {
      proposalError(e);
    }
  })
  .post("/:proposalId/accept", async (c) => {
    const proposal = await load(c);
    await checkDecider(c, proposal);
    const ops = await chosenOps(c);
    try {
      const decided = await c
        .get("store")
        .proposals.accept(proposal.id, c.get("actor") ?? API_ACTOR, ops);
      await audit(c, proposal, "accepted", decided.acceptedOps);
      return c.json({ proposal: decided });
    } catch (e) {
      proposalError(e);
    }
  })
  .post("/:proposalId/reject", async (c) => {
    const proposal = await load(c);
    await checkDecider(c, proposal);
    try {
      const decided = await c
        .get("store")
        .proposals.reject(proposal.id, c.get("actor") ?? API_ACTOR);
      await audit(c, proposal, "rejected");
      return c.json({ proposal: decided });
    } catch (e) {
      proposalError(e);
    }
  });
