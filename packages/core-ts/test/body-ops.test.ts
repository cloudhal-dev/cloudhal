/** RFC-0014 §4: block-addressed body edits. */
import { describe, expect, it } from "vitest";
import { applyBodyOps, type BodyOp, BodyOpError, currentBlocks } from "../src/index.ts";

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
