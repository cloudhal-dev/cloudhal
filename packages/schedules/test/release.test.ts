import { createHash } from "node:crypto";
import type { NodeRef, ReleaseItem } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import {
  approvalArgs,
  baseApprovalVerdict,
  canTransitionRelease,
  composeRelease,
  dependencyClosure,
  isPastLateLimit,
  nextRetryAt,
  orderReleases,
  pinItems,
  planRelease,
  RELEASE_TRANSITIONS,
  referencedNodeIds,
  releaseConflicts,
  releaseHash,
  releaseHashLines,
  releaseOverlaps,
  releaseWhen,
  runId,
  ScheduleError,
} from "../src/index.ts";

const h = (c: string) => c.repeat(64);
const ref = (id: string, kind: NodeRef["kind"], rev: number, hc: string): NodeRef => ({
  id,
  kind,
  rev,
  hash: h(hc),
});
const SITE = "site_01HZX8K3Q9EF";

function code(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof ScheduleError ? e.code : String(e);
  }
}

describe("rl1: hash (§10.4) — stable", () => {
  const items: ReleaseItem[] = [
    {
      kind: "set",
      nodeId: "entry_02BBBBBBBB",
      nodeKind: "contentEntry",
      target: { rev: 7, hash: h("b") },
      base: { rev: 6, hash: h("a") },
    },
    {
      kind: "remove",
      nodeId: "redir_01AAAAAAAA",
      nodeKind: "redirect",
      base: { rev: 2, hash: h("c") },
    },
    {
      kind: "set",
      nodeId: "asset_01CCCCCCCC",
      nodeKind: "asset",
      target: { rev: 1, hash: h("d") },
    },
  ];

  it("digests the site line and one sorted line per item", async () => {
    const lines = releaseHashLines(SITE, items);
    expect(lines).toEqual([
      `site ${SITE}`,
      `set asset_01CCCCCCCC asset 1:${h("d")} -`,
      `set entry_02BBBBBBBB contentEntry 7:${h("b")} 6:${h("a")}`,
      `remove redir_01AAAAAAAA redirect - 2:${h("c")}`,
    ]);
    const expected = `rl1:${createHash("sha256").update(lines.join("\n")).digest("hex")}`;
    expect(await releaseHash(SITE, items)).toBe(expected);
    expect(await releaseHash(SITE, [...items].reverse())).toBe(expected);
    // Pinned: changing the binding voids every stored approval.
    expect(expected).toBe("rl1:f01f122229464b88e37378ceceb25adb8b2b712457e9f22a3afed36347635bf6");
  });

  it("changes with any item and with the site, never with the time (D4)", async () => {
    const base = await releaseHash(SITE, items);
    const bumped = items.map((i) =>
      i.nodeId === "asset_01CCCCCCCC" && i.kind === "set"
        ? { ...i, target: { rev: 2, hash: h("e") } }
        : i,
    );
    expect(await releaseHash(SITE, bumped)).not.toBe(base);
    expect(await releaseHash("site_01OTHERSITE", items)).not.toBe(base);
    expect(
      approvalArgs("rel_01ABCDEF", {
        kind: "at",
        at: "2026-11-02T09:00:00+03:00",
        timeZone: "Europe/Istanbul",
      }),
    ).toBe(
      '{"releaseId":"rel_01ABCDEF","when":{"at":"2026-11-02T06:00:00.000Z","kind":"at","timeZone":"Europe/Istanbul"}}',
    );
  });
});

describe("run ids (§8.5) — derived and stable", () => {
  it("are run_ + 20 Crockford base32 characters of SHA-256(subject \\n occurrence)", async () => {
    const id = await runId("rel_01HZXC2D4F6H", "2026-11-02T06:00:00Z");
    expect(id).toMatch(/^run_[0-9A-HJKMNP-TV-Z]{20}$/);
    expect(await runId("rel_01HZXC2D4F6H", "2026-11-02T09:00:00+03:00")).toBe(id); // same instant, same id
    expect(await runId("rel_01HZXC2D4F6H", "2026-11-02T06:01:00Z")).not.toBe(id);
    // Independent re-implementation of the documented rule.
    const digest = createHash("sha256")
      .update("rel_01HZXC2D4F6H\n2026-11-02T06:00:00.000Z")
      .digest();
    let bits = "";
    for (const b of digest) bits += b.toString(2).padStart(8, "0");
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let expected = "run_";
    for (let i = 0; i < 20; i++)
      expected += alphabet[Number.parseInt(bits.slice(i * 5, i * 5 + 5), 2)];
    expect(id).toBe(expected);
  });
});

describe("pin and closure (§6.1)", () => {
  const live = [
    ref("site_01HZX8K3Q9EF", "site", 3, "0"),
    ref("entry_01AAAAAAAA", "contentEntry", 4, "1"),
    ref("redir_01AAAAAAAA", "redirect", 1, "2"),
  ];
  const working = [
    ref("site_01HZX8K3Q9EF", "site", 5, "9"),
    ref("entry_01AAAAAAAA", "contentEntry", 5, "3"),
    ref("entry_02BBBBBBBB", "contentEntry", 1, "4"),
    ref("asset_01CCCCCCCC", "asset", 1, "5"),
    ref("term_01DDDDDDDD", "term", 1, "6"),
    ref("tax_01EEEEEEEEE", "taxonomy", 1, "7"),
    ref("redir_01AAAAAAAA", "redirect", 1, "2"),
    ref("page_01FFFFFFFF", "page", 2, "8"),
  ];

  it("pins working versions with their live base, sorted; refuses what cannot be pinned", () => {
    const items = pinItems({
      siteId: SITE,
      set: ["entry_02BBBBBBBB", "entry_01AAAAAAAA"],
      remove: ["redir_01AAAAAAAA"],
      working,
      live,
    });
    expect(items).toEqual([
      {
        kind: "set",
        nodeId: "entry_01AAAAAAAA",
        nodeKind: "contentEntry",
        target: { rev: 5, hash: h("3") },
        base: { rev: 4, hash: h("1") },
      },
      {
        kind: "set",
        nodeId: "entry_02BBBBBBBB",
        nodeKind: "contentEntry",
        target: { rev: 1, hash: h("4") },
      },
      {
        kind: "remove",
        nodeId: "redir_01AAAAAAAA",
        nodeKind: "redirect",
        base: { rev: 1, hash: h("2") },
      },
    ]);
    expect(code(() => pinItems({ siteId: SITE, set: ["site_01HZX8K3Q9EF"], working, live }))).toBe(
      "site_node_in_release",
    );
    expect(code(() => pinItems({ siteId: SITE, set: ["redir_01AAAAAAAA"], working, live }))).toBe(
      "nothing_to_publish",
    );
    expect(code(() => pinItems({ siteId: SITE, set: ["entry_09ZZZZZZZZ"], working, live }))).toBe(
      "node_not_found",
    );
    expect(code(() => pinItems({ siteId: SITE, remove: ["page_01FFFFFFFF"], working, live }))).toBe(
      "nothing_to_publish",
    );
    expect(code(() => pinItems({ siteId: SITE, remove: ["term_01DDDDDDDD"], working, live }))).toBe(
      "remove_not_allowed",
    );
    expect(
      code(() =>
        pinItems({
          siteId: SITE,
          set: ["entry_02BBBBBBBB"],
          remove: ["entry_02BBBBBBBB"],
          working,
          live,
        }),
      ),
    ).toBe("duplicate_item");
  });

  it("finds references in a body and adds what is not live, transitively", async () => {
    expect(
      referencedNodeIds({
        id: "entry_02BBBBBBBB",
        siteId: "site_01HZX8K3Q9EF",
        title: "page_lookalike is text",
        coverImage: { assetId: "asset_01CCCCCCCC", src: "/media/x", alt: "" },
        terms: { category: { ids: ["term_01DDDDDDDD"], primary: "term_01DDDDDDDD" } },
        body: { kind: "markdown", text: "see entry_01AAAAAAAA" },
      }),
    ).toEqual(["asset_01CCCCCCCC", "term_01DDDDDDDD"]);
    const deps: Record<string, string[]> = {
      entry_02BBBBBBBB: ["asset_01CCCCCCCC", "term_01DDDDDDDD", "entry_01AAAAAAAA"],
      term_01DDDDDDDD: ["tax_01EEEEEEEEE"],
      asset_01CCCCCCCC: [],
      tax_01EEEEEEEEE: ["term_09MISSING00"],
    };
    const items = pinItems({ siteId: SITE, set: ["entry_02BBBBBBBB"], working, live });
    const closure = await dependencyClosure({
      items,
      working,
      live,
      depsOf: (r) => deps[r.id] ?? [],
      blobOf: () => "f".repeat(64),
    });
    expect(closure.added).toEqual(["asset_01CCCCCCCC", "tax_01EEEEEEEEE", "term_01DDDDDDDD"]);
    expect(closure.missing).toEqual(["term_09MISSING00"]);
    expect(closure.items.map((i) => i.item.nodeId)).toEqual([
      "asset_01CCCCCCCC",
      "entry_02BBBBBBBB",
      "tax_01EEEEEEEEE",
      "term_01DDDDDDDD",
    ]);
    expect(closure.items.find((i) => i.item.nodeId === "entry_02BBBBBBBB")?.deps).toEqual([
      "asset_01CCCCCCCC",
      "entry_01AAAAAAAA",
      "term_01DDDDDDDD",
    ]);
    expect(closure.items.find((i) => i.item.nodeId === "asset_01CCCCCCCC")?.blobSha).toBe(
      "f".repeat(64),
    );
  });
});

describe("compose, conflicts and the plan (§6.3, S1, S4)", () => {
  const live = [
    ref("site_01HZX8K3Q9EF", "site", 3, "0"),
    ref("entry_01AAAAAAAA", "contentEntry", 4, "1"),
    ref("page_01FFFFFFFF", "page", 2, "8"),
    ref("redir_01AAAAAAAA", "redirect", 1, "2"),
  ];
  const items: ReleaseItem[] = [
    {
      kind: "set",
      nodeId: "entry_01AAAAAAAA",
      nodeKind: "contentEntry",
      target: { rev: 5, hash: h("3") },
      base: { rev: 4, hash: h("1") },
    },
    {
      kind: "set",
      nodeId: "entry_02BBBBBBBB",
      nodeKind: "contentEntry",
      target: { rev: 1, hash: h("4") },
    },
    {
      kind: "remove",
      nodeId: "redir_01AAAAAAAA",
      nodeKind: "redirect",
      base: { rev: 1, hash: h("2") },
    },
  ];

  it("S1: nodes(S) = nodes(L) − ids + targets, sorted by id, the site ref kept", () => {
    const s = composeRelease(live, items);
    expect(s.map((n) => `${n.id}@${n.rev}`)).toEqual([
      "entry_01AAAAAAAA@5",
      "entry_02BBBBBBBB@1",
      "page_01FFFFFFFF@2",
      "site_01HZX8K3Q9EF@3",
    ]);
    // As sets: exactly the definition, for any order of the inputs.
    const ids = new Set(items.map((i) => i.nodeId));
    const expected = new Set([
      ...live.filter((n) => !ids.has(n.id)).map((n) => `${n.id}@${n.hash}`),
      ...items.flatMap((i) => (i.kind === "set" ? [`${i.nodeId}@${i.target.hash}`] : [])),
    ]);
    expect(
      new Set(
        composeRelease([...live].reverse(), [...items].reverse()).map((n) => `${n.id}@${n.hash}`),
      ),
    ).toEqual(expected);
  });

  it("S4: any changed base is a conflict and nothing is applied", () => {
    expect(releaseConflicts(live, items)).toEqual([]);
    const moved = live.map((n) =>
      n.id === "entry_01AAAAAAAA" ? { ...n, rev: 5, hash: h("9") } : n,
    );
    const appeared = [...live, ref("entry_02BBBBBBBB", "contentEntry", 1, "4")];
    expect(releaseConflicts(moved, items)).toEqual([
      {
        nodeId: "entry_01AAAAAAAA",
        expected: { rev: 4, hash: h("1") },
        found: { rev: 5, hash: h("9") },
      },
    ]);
    expect(releaseConflicts(appeared, items)).toEqual([
      { nodeId: "entry_02BBBBBBBB", found: { rev: 1, hash: h("4") } },
    ]);
    const pinned = items.map((item) => ({ item, deps: [] as string[] }));
    expect(planRelease(moved, pinned)).toMatchObject({ kind: "conflict" });
  });

  it("checks dependencies against the composed snapshot", () => {
    const pinned = items.map((item) => ({
      item,
      deps: item.nodeId === "entry_02BBBBBBBB" ? ["page_01FFFFFFFF", "asset_01NOTLIVE0"] : [],
    }));
    expect(planRelease(live, pinned)).toEqual({
      kind: "failed",
      code: "dependency_missing",
      message: "entry_02BBBBBBBB needs asset_01NOTLIVE0, which would not be live",
    });
    const ok = items.map((item) => ({
      item,
      deps: item.nodeId === "entry_02BBBBBBBB" ? ["page_01FFFFFFFF"] : [],
    }));
    expect(planRelease(live, ok)).toMatchObject({
      kind: "apply",
      added: 1,
      changed: 1,
      removed: 1,
    });
  });
});

describe("state machine, missed policy, order (§5.2, §8.6, D15)", () => {
  it("allows exactly the transitions of §5.2", () => {
    expect(canTransitionRelease("draft", "scheduled")).toBe(true);
    expect(canTransitionRelease("scheduled", "scheduled")).toBe(true); // a person moves it (D4)
    expect(canTransitionRelease("scheduled", "running")).toBe(true);
    expect(canTransitionRelease("running", "published")).toBe(true);
    expect(canTransitionRelease("draft", "published")).toBe(false);
    expect(canTransitionRelease("published", "draft")).toBe(false);
    expect(canTransitionRelease("canceled", "scheduled")).toBe(false);
    expect(canTransitionRelease("awaiting_approval", "running")).toBe(false);
    for (const to of Object.keys(RELEASE_TRANSITIONS))
      expect(canTransitionRelease("published", to as never)).toBe(false);
  });

  it("late at most an hour; retries back off inside it (S8)", () => {
    const T = "2026-11-02T06:00:00Z";
    expect(isPastLateLimit(T, "2026-11-02T07:00:00Z")).toBe(false);
    expect(isPastLateLimit(T, "2026-11-02T07:00:01Z")).toBe(true);
    expect(nextRetryAt(T, "2026-11-02T06:00:10Z", 1)).toBe("2026-11-02T06:00:40.000Z");
    expect(nextRetryAt(T, "2026-11-02T06:10:00Z", 4)).toBe("2026-11-02T06:15:00.000Z");
    expect(nextRetryAt(T, "2026-11-02T06:55:00Z", 5)).toBeUndefined();
  });

  it("D5/D9: no approval expires; an auto approval only inside its window", () => {
    expect(baseApprovalVerdict(undefined, "2026-11-02T06:00:00Z")).toEqual({
      ok: false,
      reason: "unapproved",
    });
    const auto = {
      kind: "auto" as const,
      by: { kind: "agent" as const, id: "agent_desk01" },
      keyId: "key_abcdef",
      at: "2026-11-01T06:00:00Z",
      windowEnds: "2026-11-02T06:00:00Z",
    };
    expect(baseApprovalVerdict(auto, "2026-11-02T06:00:00Z")).toEqual({ ok: true });
    expect(baseApprovalVerdict(auto, "2026-11-02T06:00:01Z")).toEqual({
      ok: false,
      reason: "auto_window_ended",
    });
  });

  it("orders by time then id, and flags nodes in two pending releases", () => {
    expect(
      orderReleases([
        { id: "rel_b", executeAt: "2026-11-02T06:00:00Z" },
        { id: "rel_c", executeAt: "2026-11-02T05:00:00Z" },
        { id: "rel_a", executeAt: "2026-11-02T06:00:00Z" },
      ]).map((r) => r.id),
    ).toEqual(["rel_c", "rel_a", "rel_b"]);
    const item = (nodeId: string): ReleaseItem => ({
      kind: "set",
      nodeId,
      nodeKind: "contentEntry",
      target: { rev: 1, hash: h("1") },
    });
    const overlaps = releaseOverlaps([
      { id: "rel_1", state: "scheduled", items: [item("entry_1"), item("entry_2")] },
      { id: "rel_2", state: "draft", items: [item("entry_2")] },
      { id: "rel_3", state: "published", items: [item("entry_1")] },
    ]);
    expect([...overlaps]).toEqual([["entry_2", ["rel_1", "rel_2"]]]);
  });

  it("builds `when` from a wall-clock time or an instant, within lead time and horizon", () => {
    const now = "2026-10-12T10:00:00Z";
    expect(
      releaseWhen({ localTime: "2026-11-02T09:00" }, { siteTimeZone: "Europe/Istanbul", now }),
    ).toEqual({
      kind: "at",
      at: "2026-11-02T06:00:00.000Z",
      timeZone: "Europe/Istanbul",
      localTime: "2026-11-02T09:00",
    });
    expect(releaseWhen({ at: "2026-11-02T06:00:00Z" }, { now })).toEqual({
      kind: "at",
      at: "2026-11-02T06:00:00.000Z",
      timeZone: "UTC",
    });
    expect(releaseWhen("on-approval", { now })).toEqual({ kind: "on-approval" });
    expect(code(() => releaseWhen({ at: "2026-10-12T10:00:30Z" }, { now }))).toBe("too_soon");
    expect(code(() => releaseWhen({ at: "2027-12-12T10:00:00Z" }, { now }))).toBe("too_far");
    expect(code(() => releaseWhen({ at: "2026-11-20T10:00:00Z" }, { now, horizonDays: 30 }))).toBe(
      "too_far",
    );
  });
});
