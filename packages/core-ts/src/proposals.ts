/**
 * Body proposals (RFC-0014 §5, ADR-0028): operations an agent filed with `edit_body` in `propose`
 * mode. They change nothing until a person accepts them, all at once or some of them; accepting
 * applies them as the store would any write, with the agent kept as the blocks' author and
 * `via: "proposal"`. Each operation is checked against the hashes the agent read: a block that
 * changed since makes the proposal stale instead of overwriting someone's work.
 */
import type { Actor, ContentEntry, Page } from "@cloudhal/core-contracts";
import type { SqlDriver } from "@cloudhal/storage";
import { currentBlocks } from "./body-index.ts";
import { applyBodyOps, type BodyOp, BodyOpError, opTargets } from "./body-ops.ts";
import { NotFoundError } from "./errors.ts";

export type ProposalStatus = "open" | "accepted" | "partial" | "rejected" | "stale";

export interface BodyProposal {
  id: string;
  siteId: string;
  /** The article, or the page whose rich-text section `sectionId` it changes. */
  nodeId: string;
  sectionId?: string;
  /** The node's `rev` when the agent proposed. */
  baseRev: number;
  /** Hashes of the blocks the operations name, as the agent read them. */
  base: Record<string, string>;
  ops: BodyOp[];
  actor: Actor;
  note?: string;
  status: ProposalStatus;
  createdAt: string;
  decidedBy?: Actor;
  decidedAt?: string;
  /** Indexes of the operations a person accepted (all of them for `accepted`). */
  acceptedOps?: number[];
  /** The node's `rev` after accepting. */
  resultRev?: number;
}

/** Why a proposal cannot be decided as asked. */
export class ProposalError extends Error {
  readonly code: "not_open" | "stale" | "invalid";
  constructor(code: ProposalError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

interface Row extends Record<string, unknown> {
  id: string;
  site_id: string;
  node_id: string;
  section_id: string | null;
  base_rev: number;
  base: string;
  ops: string;
  actor: string;
  note: string | null;
  status: ProposalStatus;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  accepted_ops: string | null;
  result_rev: number | null;
}

function fromRow(r: Row): BodyProposal {
  return {
    id: r.id,
    siteId: r.site_id,
    nodeId: r.node_id,
    ...(r.section_id ? { sectionId: r.section_id } : {}),
    baseRev: r.base_rev,
    base: JSON.parse(r.base) as Record<string, string>,
    ops: JSON.parse(r.ops) as BodyOp[],
    actor: JSON.parse(r.actor) as Actor,
    ...(r.note ? { note: r.note } : {}),
    status: r.status,
    createdAt: r.created_at,
    ...(r.decided_by ? { decidedBy: JSON.parse(r.decided_by) as Actor } : {}),
    ...(r.decided_at ? { decidedAt: r.decided_at } : {}),
    ...(r.accepted_ops ? { acceptedOps: JSON.parse(r.accepted_ops) as number[] } : {}),
    ...(r.result_rev !== null ? { resultRev: r.result_rev } : {}),
  };
}

/** A markdown body somewhere in the graph, and how to write it back. */
export interface ProposalTarget {
  siteId: string;
  rev: number;
  markdown: string;
  blocks: ContentEntry["body"]["blocks"];
  write: (markdown: string, author: Actor) => Promise<{ rev: number }>;
}

/** The store's side of proposals: finding the body a proposal changes. */
export interface ProposalGraph {
  getContentEntry(id: string): Promise<ContentEntry | undefined>;
  getPage(id: string): Promise<Page | undefined>;
  updateContentEntry(
    entry: ContentEntry,
    options: { writer: { actor: Actor; via: "proposal" } },
  ): Promise<ContentEntry>;
  updatePage(page: Page, options: { writer: { actor: Actor; via: "proposal" } }): Promise<Page>;
}

/** What accepting the proposal (or some of its operations) would make of the body now. */
export interface ProposalPreview {
  /** The body as it is. */
  current: string;
  /** The body with the operations applied; absent when they no longer apply. */
  proposed?: string;
  /** Why they no longer apply (a block changed or is gone). */
  problem?: string;
}

export class BodyProposals {
  readonly #sql: SqlDriver;
  readonly #graph: ProposalGraph;
  readonly #newId: () => string;
  readonly #now: () => string;

  constructor(o: {
    sql: SqlDriver;
    graph: ProposalGraph;
    newId: () => string;
    now: () => string;
  }) {
    this.#sql = o.sql;
    this.#graph = o.graph;
    this.#newId = o.newId;
    this.#now = o.now;
  }

  /** The markdown body a proposal addresses (an article's, or a page's rich-text section). */
  async target(siteId: string, nodeId: string, sectionId?: string): Promise<ProposalTarget> {
    if (!sectionId) {
      const entry = await this.#graph.getContentEntry(nodeId);
      if (!entry || entry.siteId !== siteId) throw new NotFoundError("contentEntry", nodeId);
      if (entry.body.format !== "markdown")
        throw new ProposalError("invalid", "only markdown bodies take proposals");
      return {
        siteId,
        rev: entry.rev,
        markdown: entry.body.value,
        blocks: entry.body.blocks,
        write: (markdown, author) =>
          this.#graph.updateContentEntry(
            { ...entry, body: { ...entry.body, value: markdown } },
            { writer: { actor: author, via: "proposal" } },
          ),
      };
    }
    const page = await this.#graph.getPage(nodeId);
    if (!page || page.siteId !== siteId) throw new NotFoundError("page", nodeId);
    const section = page.sections.find((s) => s.id === sectionId);
    if (section?.kind !== "richText" || section.format !== "markdown")
      throw new ProposalError(
        "invalid",
        `section ${sectionId} is not a markdown rich-text section`,
      );
    return {
      siteId,
      rev: page.rev,
      markdown: section.body,
      blocks: section.blocks,
      write: (markdown, author) =>
        this.#graph.updatePage(
          {
            ...page,
            sections: page.sections.map((s) =>
              s.id === sectionId && s.kind === "richText" ? { ...s, body: markdown } : s,
            ),
          },
          { writer: { actor: author, via: "proposal" } },
        ),
    };
  }

  /**
   * Files a proposal. The operations must apply to the body as it is now; the hashes of the
   * blocks they name are kept, so a later change to any of them makes the proposal stale.
   */
  async create(input: {
    siteId: string;
    nodeId: string;
    sectionId?: string | undefined;
    ops: BodyOp[];
    actor: Actor;
    note?: string | undefined;
  }): Promise<BodyProposal> {
    const target = await this.target(input.siteId, input.nodeId, input.sectionId);
    const blocks = await currentBlocks(target.markdown, target.blocks);
    applyBodyOps(target.markdown, blocks, input.ops); // throws BodyOpError when it cannot apply
    const hashes = new Map(blocks.map((b) => [b.id, b.hash]));
    const base = Object.fromEntries(
      input.ops.flatMap(opTargets).map((id) => [id, hashes.get(id) as string]),
    );
    const proposal: BodyProposal = {
      id: this.#newId(),
      siteId: input.siteId,
      nodeId: input.nodeId,
      ...(input.sectionId ? { sectionId: input.sectionId } : {}),
      baseRev: target.rev,
      base,
      ops: input.ops,
      actor: input.actor,
      ...(input.note?.trim() ? { note: input.note.trim().slice(0, 1000) } : {}),
      status: "open",
      createdAt: this.#now(),
    };
    await this.#sql.run(
      `INSERT INTO body_proposals (id, site_id, node_id, section_id, base_rev, base, ops, actor, note, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      [
        proposal.id,
        proposal.siteId,
        proposal.nodeId,
        proposal.sectionId ?? null,
        proposal.baseRev,
        JSON.stringify(base),
        JSON.stringify(proposal.ops),
        JSON.stringify(proposal.actor),
        proposal.note ?? null,
        proposal.createdAt,
      ],
    );
    return proposal;
  }

  async get(id: string): Promise<BodyProposal | undefined> {
    const row = await this.#sql.get<Row>("SELECT * FROM body_proposals WHERE id = ?", [id]);
    return row ? fromRow(row) : undefined;
  }

  /** A site's proposals, newest first: open ones only unless `status` says otherwise. */
  async list(
    siteId: string,
    query: { nodeId?: string; status?: ProposalStatus | "all"; limit?: number } = {},
  ): Promise<BodyProposal[]> {
    const where = ["site_id = ?"];
    const params: (string | number)[] = [siteId];
    if (query.nodeId) {
      where.push("node_id = ?");
      params.push(query.nodeId);
    }
    if ((query.status ?? "open") !== "all") {
      where.push("status = ?");
      params.push(query.status ?? "open");
    }
    params.push(Math.min(Math.max(query.limit ?? 50, 1), 200));
    const rows = await this.#sql.all<Row>(
      `SELECT * FROM body_proposals WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`,
      params,
    );
    return rows.map(fromRow);
  }

  /** The operations `selected` (default: all) as they would apply now, each checked against `base`. */
  #pinned(p: BodyProposal, selected?: readonly number[]): BodyOp[] {
    const pick = selected ?? p.ops.map((_, i) => i);
    if (pick.length === 0 || pick.some((i) => !Number.isInteger(i) || i < 0 || i >= p.ops.length))
      throw new ProposalError("invalid", "choose operations by their index");
    return [...new Set(pick)]
      .sort((a, b) => a - b)
      .map((i) => {
        const op = p.ops[i] as BodyOp;
        if (op.op === "insert") return op;
        const ifHash = p.base[op.block] ?? op.ifHash;
        return ifHash === undefined ? op : { ...op, ifHash };
      });
  }

  /** What accepting would do to the body now (for the person deciding). */
  async preview(p: BodyProposal, selected?: readonly number[]): Promise<ProposalPreview> {
    const target = await this.target(p.siteId, p.nodeId, p.sectionId);
    const blocks = await currentBlocks(target.markdown, target.blocks);
    try {
      return {
        current: target.markdown,
        proposed: applyBodyOps(target.markdown, blocks, this.#pinned(p, selected)),
      };
    } catch (e) {
      if (e instanceof BodyOpError) return { current: target.markdown, problem: e.message };
      throw e;
    }
  }

  /**
   * Applies the proposal (or the operations `selected`) as one write, the agent as the author of
   * the blocks it changes. A block changed since marks the proposal stale and throws.
   */
  async accept(id: string, by: Actor, selected?: readonly number[]): Promise<BodyProposal> {
    const p = await this.#open(id);
    const ops = this.#pinned(p, selected);
    const target = await this.target(p.siteId, p.nodeId, p.sectionId);
    const blocks = await currentBlocks(target.markdown, target.blocks);
    let markdown: string;
    try {
      markdown = applyBodyOps(target.markdown, blocks, ops);
    } catch (e) {
      if (!(e instanceof BodyOpError)) throw e;
      if (e.code === "invalid") throw new ProposalError("invalid", e.message);
      await this.#decide(p, "stale", by);
      throw new ProposalError("stale", `the text changed since the proposal: ${e.message}`);
    }
    const saved = await target.write(markdown, p.actor);
    const accepted = selected
      ? [...new Set(selected)].sort((a, b) => a - b)
      : p.ops.map((_, i) => i);
    const status = accepted.length === p.ops.length ? "accepted" : "partial";
    return this.#decide(p, status, by, { acceptedOps: accepted, resultRev: saved.rev });
  }

  async reject(id: string, by: Actor): Promise<BodyProposal> {
    return this.#decide(await this.#open(id), "rejected", by);
  }

  async #open(id: string): Promise<BodyProposal> {
    const p = await this.get(id);
    if (!p) throw new NotFoundError("proposal", id);
    if (p.status !== "open")
      throw new ProposalError("not_open", `proposal ${id} is ${p.status}, not open`);
    return p;
  }

  async #decide(
    p: BodyProposal,
    status: ProposalStatus,
    by: Actor,
    extra: { acceptedOps?: number[]; resultRev?: number } = {},
  ): Promise<BodyProposal> {
    const at = this.#now();
    const r = await this.#sql.run(
      `UPDATE body_proposals SET status = ?, decided_by = ?, decided_at = ?, accepted_ops = ?, result_rev = ?
       WHERE id = ? AND status = 'open'`,
      [
        status,
        JSON.stringify(by),
        at,
        extra.acceptedOps ? JSON.stringify(extra.acceptedOps) : null,
        extra.resultRev ?? null,
        p.id,
      ],
    );
    if (r.changes !== 1)
      throw new ProposalError("not_open", `proposal ${p.id} was decided by someone else just now`);
    return { ...p, status, decidedBy: by, decidedAt: at, ...extra };
  }
}
