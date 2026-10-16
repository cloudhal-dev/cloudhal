/** `cloudhal motion audit` (RFC-0024 §8): each page's motion against its budgets, without a browser. */
import { describe, expect, it } from "vitest";
import { auditPage, describeMotionAudit } from "../src/commands/motion.ts";

describe("cloudhal motion audit", () => {
  it("counts each page's motion and names what goes over a budget", () => {
    const loop = (id: string) => ({
      id,
      component: "Badge",
      props: { label: id },
      motion: { loop: "pulse" },
    });
    const page = {
      path: "/launch",
      motion: "expressive" as const,
      sections: [
        {
          id: "sec_launch000001",
          kind: "surface" as const,
          catalog: "blog@1",
          components: [
            { id: "root", component: "Stack", children: ["h", "a", "b", "c"] },
            {
              id: "h",
              component: "Heading",
              props: { text: "Hi" },
              motion: { reveal: "split-words", morph: "hero" },
            },
            loop("a"),
            loop("b"),
            loop("c"),
          ],
        },
      ],
    };
    const audit = auditPage(page as never, "subtle");
    expect(audit).toMatchObject({
      level: "expressive",
      reveals: 1,
      splits: 1,
      loops: 3,
      morphs: ["hero"],
    });
    expect(audit.warnings).toEqual(["3 things that loop (keep to 2)"]);
    expect(describeMotionAudit({ level: "subtle", pageTransition: "morph", pages: [audit] })).toBe(
      "site motion: subtle, page transition: morph\n/launch  (expressive)  reveals 1, splits 1, loops 3  morph: hero\n  ! 3 things that loop (keep to 2)",
    );
    // presets on a still page do nothing, and the audit says so
    expect(auditPage({ ...page, motion: "none" } as never, "subtle").warnings).toContain(
      "motion presets on a page whose level is none: nothing will move",
    );
  });
});
