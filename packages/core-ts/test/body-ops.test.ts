/** RFC-0014 §4: block-addressed body edits. */
import { describe, expect, it } from "vitest";
import {
  applyBodyOps,
  type BodyOp,
  BodyOpError,
  currentBlocks,
  parseBodyOps,
  proposalSteps,
} from "../src/index.ts";

const BODY = "# Title\n\nFirst paragraph.\n\n\nSecond paragraph.\n\n- a\n- b\n";

async function apply(ops: (ids: string[], hashes: string[]) => BodyOp[], body = BODY) {
  const blocks = await currentBlocks(body, undefined);
  return applyBodyOps(
    body,
    blocks,
    ops(
      blocks.map((b) => b.id),
      blocks.map((b) => b.hash),
    ),
  );
}

async function error(ops: (ids: string[], hashes: string[]) => BodyOp[], body = BODY) {
  try {
    await apply(ops, body);
  } catch (e) {
    if (e instanceof BodyOpError) return e;
    throw e;
  }
  throw new Error("expected a BodyOpError");
}

describe("applyBodyOps", () => {
  it("replaces one block and keeps every other byte", async () => {
    expect(
      await apply(([, one]) => [
        { op: "replace", block: one as string, markdown: "First, edited." },
      ]),
    ).toBe(BODY.replace("First paragraph.", "First, edited."));
  });

  it("replaces text that occurs once, and refuses ambiguity", async () => {
    expect(
      await apply(([, , two]) => [
        { op: "replaceText", block: two as string, find: "Second", replace: "2nd" },
      ]),
    ).toBe(BODY.replace("Second paragraph.", "2nd paragraph."));
    const e = await error(([, one]) => [
      { op: "replaceText", block: one as string, find: "x", replace: "y" },
    ]);
    expect(e.code).toBe("invalid");
    expect(e.message).toContain("0 times");
  });

  it("inserts blocks at the start and after a block", async () => {
    const out = await apply(([title]) => [
      { op: "insert", after: null, markdown: "Lead." },
      { op: "insert", after: title as string, markdown: "## A\n\nB." },
    ]);
    expect(out).toBe(`Lead.\n\n# Title\n\n## A\n\nB.\n\n${BODY.slice("# Title\n\n".length)}`);
  });

  it("moves and deletes blocks", async () => {
    expect(
      await apply(([title, one, two, list]) => [
        { op: "move", block: one as string, after: list as string },
        { op: "delete", block: two as string },
        { op: "move", block: title as string, after: null },
      ]),
    ).toBe("# Title\n\n- a\n- b\n\nFirst paragraph.\n");
  });

  it("checks ifHash, missing blocks and one-block replacements", async () => {
    expect(
      (await error(([, one]) => [{ op: "delete", block: one as string, ifHash: "0".repeat(64) }]))
        .code,
    ).toBe("conflict");
    expect((await error(() => [{ op: "delete", block: "blk_missing0001" }])).code).toBe(
      "not_found",
    );
    const two = await error(([, one]) => [
      { op: "replace", block: one as string, markdown: "One.\n\nTwo." },
    ]);
    expect(two.message).toContain("exactly one block");
    expect((await error(() => [])).code).toBe("invalid");
  });

  it("refuses a result that reads differently than the ops say", async () => {
    // A list item inserted right after a list joins that list.
    const e = await error(([, , , list]) => [
      { op: "insert", after: list as string, markdown: "- c" },
    ]);
    expect(e.message).toContain("reads differently");
  });

  it("works on an empty body", async () => {
    expect(await apply(() => [{ op: "insert", after: null, markdown: "Hello." }], "")).toBe(
      "Hello.\n",
    );
  });
});

describe("parseBodyOps (REST input)", () => {
  const id = "blk_abcdefgh12";
  it("keeps well-formed operations and drops unknown keys", () => {
    expect(
      parseBodyOps([
        { op: "replace", block: id, markdown: "x", extra: 1 },
        { op: "replaceText", block: id, find: "a", replace: "" },
        { op: "insert", after: null, markdown: "y" },
        { op: "move", block: id, after: id, ifHash: "a".repeat(64) },
        { op: "delete", block: id },
      ]),
    ).toEqual([
      { op: "replace", block: id, markdown: "x" },
      { op: "replaceText", block: id, find: "a", replace: "" },
      { op: "insert", after: null, markdown: "y" },
      { op: "move", block: id, after: id, ifHash: "a".repeat(64) },
      { op: "delete", block: id },
    ]);
  });

  it("names the operation that is malformed", () => {
    const fails = (raw: unknown, op?: number) => {
      try {
        parseBodyOps(raw);
      } catch (e) {
        expect(e).toBeInstanceOf(BodyOpError);
        expect((e as BodyOpError).op).toBe(op);
        return;
      }
      throw new Error("accepted");
    };
    fails(undefined);
    fails([]);
    fails(Array.from({ length: 51 }, () => ({ op: "delete", block: id })));
    fails(
      [
        { op: "delete", block: id },
        { op: "replace", block: id },
      ],
      1,
    );
    fails([{ op: "delete", block: "not-a-block" }], 0);
    fails([{ op: "insert", markdown: "x" }], 0);
    fails([{ op: "delete", block: id, ifHash: "short" }], 0);
    fails([{ op: "rename", block: id }], 0);
    fails(["delete"], 0);
  });
});

describe("proposalSteps", () => {
  it("reads each operation against the current blocks, on one line", async () => {
    const blocks = await currentBlocks(BODY, undefined);
    const [title, first, second] = blocks.map((b) => b.id) as [string, string, string];
    expect(
      proposalSteps(
        [
          { op: "replace", block: first, markdown: "New\nfirst." },
          { op: "replaceText", block: second, find: "Second", replace: "2nd" },
          { op: "insert", after: null, markdown: "x".repeat(200) },
          { op: "move", block: title, after: second },
          { op: "delete", block: "blk_gone00000001" },
        ],
        blocks,
      ),
    ).toEqual([
      { op: "replace", before: "First paragraph.", after: "New first." },
      { op: "replaceText", before: "Second", after: "2nd" },
      { op: "insert", after: `${"x".repeat(139)}…` },
      { op: "move", before: "# Title" },
      { op: "delete" },
    ]);
  });
});
