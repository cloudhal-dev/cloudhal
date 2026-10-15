import { describe, expect, it } from "vitest";
import { type BuildState, reduceBuild } from "../src/lib/build.ts";

const empty: BuildState = {
  status: "connecting",
  rev: undefined,
  title: undefined,
  html: undefined,
  highlight: [],
  entries: [],
};
const actor = { kind: "agent", name: "Builder" };

describe("reduceBuild (RFC-0020 §6)", () => {
  it("goes live on a snapshot, then records changes and refusals newest first", () => {
    let s = reduceBuild(
      empty,
      { type: "STATE_SNAPSHOT", snapshot: { rev: 1, title: "Home", html: "<p>1</p>" } },
      "a",
    );
    expect(s).toMatchObject({ status: "live", rev: 1, html: "<p>1</p>", entries: [] });
    s = reduceBuild(
      s,
      {
        type: "CUSTOM",
        name: "validation_failed",
        value: {
          issues: [{ path: "/sections/0/components/0/props/level", message: "at most 4" }],
          tool: "patch_draft",
          actor,
          at: "t1",
        },
      },
      "b",
    );
    s = reduceBuild(
      s,
      {
        type: "STATE_DELTA",
        rev: 2,
        title: "Home",
        html: "<p>2</p>",
        delta: [{}, {}],
        repairs: ['root: component "stack" → "Stack"'],
        changed: ["sec_a"],
        tool: "patch_draft",
        actor,
        at: "t2",
      },
      "c",
    );
    expect(s.rev).toBe(2);
    expect(s.highlight).toEqual(["sec_a"]);
    expect(s.entries.map((e) => e.kind)).toEqual(["change", "rejected"]);
    expect(s.entries[1]).toMatchObject({
      issues: ["/sections/0/components/0/props/level at most 4"],
    });
    expect(s.entries[0]).toMatchObject({ ops: 2, changed: ["sec_a"] });
  });

  it("keeps at most 100 entries", () => {
    let s = empty;
    for (let i = 0; i < 120; i++)
      s = reduceBuild(
        s,
        {
          type: "CUSTOM",
          name: "validation_failed",
          value: { issues: [], tool: "patch_draft", actor, at: `${i}` },
        },
        `${i}`,
      );
    expect(s.entries).toHaveLength(100);
    expect(s.entries[0]?.at).toBe("119");
  });
});
