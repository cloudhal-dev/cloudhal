import { describe, expect, it } from "vitest";
import { whileTokenPropagates } from "../src/commands/deploy/resources.ts";

describe("whileTokenPropagates (a new deployment token takes seconds to reach every edge)", () => {
  it("retries a step that fails with 401, then returns its result", async () => {
    let calls = 0;
    const lines: string[] = [];
    const result = await whileTokenPropagates(
      async () => {
        calls++;
        if (calls < 3) throw new Error('push failed (401): {"error":"unauthorized"}');
        return "pushed";
      },
      { log: (l) => lines.push(l), waitMs: 1 },
    );
    expect(result).toBe("pushed");
    expect(calls).toBe(3);
    expect(lines).toHaveLength(1);
  });

  it("does not retry other failures, and gives up after the timeout", async () => {
    let calls = 0;
    await expect(
      whileTokenPropagates(
        async () => {
          calls++;
          throw new Error("push failed (500): boom");
        },
        { log: () => {}, waitMs: 1 },
      ),
    ).rejects.toThrow(/500/);
    expect(calls).toBe(1);
    await expect(
      whileTokenPropagates(
        async () => {
          throw new Error("push failed (401)");
        },
        { log: () => {}, waitMs: 1, timeoutMs: 20 },
      ),
    ).rejects.toThrow(/401/);
  });
});
