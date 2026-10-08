/** RFC-0005 §4: entry ownership, own-limited writes (I9) and own-only change sets (I10). */
import type { Actor, NodeRef } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import {
  checkEntryLimit,
  type OwnershipResolver,
  OwnLimitError,
  ownOnlyChangeSet,
} from "../src/ownership.ts";

const me = { kind: "human" as const, id: "user_me00000001" };
const other = { kind: "human" as const, id: "user_other00001" };
const myAgent = { kind: "agent" as const, id: "agent_mine000001" };
const theirAgent = { kind: "agent" as const, id: "agent_theirs0001" };
const system = { kind: "system" as const, id: "sys_api00000001" };

/** An agent's owner is the person whose key it used. */
const owner: OwnershipResolver = {
  async personOf(actor: Actor) {
    if (actor.kind === "human") return actor.id;
    if (actor.id === myAgent.id) return me.id;
    if (actor.id === theirAgent.id) return other.id;
    return undefined;
  },
};

const entry = (author: Actor, status = "draft", publishedAt?: string) => ({
  author,
  status: status as "draft",
  ...(publishedAt ? { publishedAt } : {}),
});

const expectCode = async (p: Promise<void>, code: string) => {
  const e = await p.catch((err: unknown) => err);
  expect(e).toBeInstanceOf(OwnLimitError);
  expect((e as OwnLimitError).code).toBe(code);
};

describe("checkEntryLimit", () => {
  const own = { level: "own" as const, target: "entry" as const };
  const draft = { level: "draft" as const, target: "entry" as const };
  const base = { owner, person: me.id };

  it("no limit: nothing is checked (full content:write)", async () => {
    await checkEntryLimit({
      ...base,
      limit: undefined,
      op: "update",
      stored: entry(other, "published", "2026-01-01"),
      next: entry(me, "archived"),
    });
  });

  it("an entry by the person's own agent is theirs; others' are not", async () => {
    await checkEntryLimit({ ...base, limit: own, op: "delete", stored: entry(myAgent) });
    await expectCode(
      checkEntryLimit({ ...base, limit: own, op: "delete", stored: entry(theirAgent) }),
      "not_own",
    );
    await expectCode(
      checkEntryLimit({ ...base, limit: own, op: "delete", stored: entry(system) }),
      "not_own",
    );
  });

  it("ownership fields cannot be claimed or shed through an edit", async () => {
    await expectCode(
      checkEntryLimit({
        ...base,
        limit: own,
        op: "update",
        stored: entry(me),
        next: entry(other),
      }),
      "author_immutable",
    );
    await expectCode(
      checkEntryLimit({ ...base, limit: own, op: "create", next: entry(other) }),
      "author_immutable",
    );
  });

  it("draft-own: never-published entries only, and they stay draft or review", async () => {
    await checkEntryLimit({
      ...base,
      limit: draft,
      op: "update",
      stored: entry(me, "draft"),
      next: entry(me, "review"),
    });
    await expectCode(
      checkEntryLimit({
        ...base,
        limit: draft,
        op: "update",
        stored: entry(me, "draft"),
        next: entry(me, "published"),
      }),
      "draft_only",
    );
    await expectCode(
      checkEntryLimit({
        ...base,
        limit: draft,
        op: "update",
        stored: entry(me, "draft", "2026-01-01"),
        next: entry(me, "draft"),
      }),
      "draft_only",
    );
    await expectCode(
      checkEntryLimit({ ...base, limit: draft, op: "create", next: entry(me, "published") }),
      "draft_only",
    );
    // write-own (Author) may publish their own
    await checkEntryLimit({
      ...base,
      limit: own,
      op: "update",
      stored: entry(me, "draft"),
      next: entry(me, "published"),
    });
  });

  it("refuses when no person is known", async () => {
    await expectCode(
      checkEntryLimit({ owner, person: undefined, limit: own, op: "create", next: entry(me) }),
      "no_person",
    );
  });
});

describe("ownOnlyChangeSet", () => {
  const ref = (id: string, kind = "contentEntry"): NodeRef =>
    ({ id, kind, rev: 0, hash: `h${id}` }) as NodeRef;
  const nodes = new Map<string, unknown>();
  const read = {
    before: async (r: NodeRef) => nodes.get(`b:${r.id}`),
    after: async (r: NodeRef) => nodes.get(`a:${r.id}`),
  };

  it("own published entries only → own-only; drafts on both sides are ignored", async () => {
    nodes.set("a:e1", entry(me, "published"));
    nodes.set("a:e2", entry(other, "draft"));
    nodes.set("b:e3", entry(other, "review"));
    nodes.set("a:e3", entry(other, "draft"));
    nodes.set("b:e4", entry(myAgent, "published"));
    nodes.set("a:e4", entry(myAgent, "published"));
    const r = await ownOnlyChangeSet(
      {
        added: [ref("e1"), ref("e2")],
        removed: [],
        changed: [
          { before: ref("e3"), after: ref("e3") },
          { before: ref("e4"), after: ref("e4") },
        ],
      },
      me.id,
      owner,
      read,
    );
    expect(r).toEqual({ ownOnly: true, structure: false, foreign: [] });
  });

  it("someone else's published entry, or any structure, makes it not own-only", async () => {
    nodes.set("a:x1", entry(other, "published"));
    nodes.set("b:x2", entry(other, "published"));
    const foreign = await ownOnlyChangeSet(
      { added: [ref("x1")], removed: [ref("x2")], changed: [] },
      me.id,
      owner,
      read,
    );
    expect(foreign).toEqual({ ownOnly: false, structure: false, foreign: ["x1", "x2"] });
    const structure = await ownOnlyChangeSet(
      { added: [ref("p1", "page")], removed: [], changed: [] },
      me.id,
      owner,
      read,
    );
    expect(structure.ownOnly).toBe(false);
    expect(structure.structure).toBe(true);
  });

  it("a site node that only moved its live pointer is not structure", async () => {
    const site = { id: "site_x", name: "X", rev: 1, updatedAt: "a", publishedSnapshotId: "s1" };
    nodes.set("b:site_x", site);
    nodes.set("a:site_x", { ...site, rev: 2, updatedAt: "b", publishedSnapshotId: "s2" });
    const pointer = await ownOnlyChangeSet(
      {
        added: [],
        removed: [],
        changed: [{ before: ref("site_x", "site"), after: ref("site_x", "site") }],
      },
      me.id,
      owner,
      read,
    );
    expect(pointer.ownOnly).toBe(true);
    nodes.set("a:site_x", { ...site, name: "Renamed" });
    const renamed = await ownOnlyChangeSet(
      {
        added: [],
        removed: [],
        changed: [{ before: ref("site_x", "site"), after: ref("site_x", "site") }],
      },
      me.id,
      owner,
      read,
    );
    expect(renamed.structure).toBe(true);
  });
});
