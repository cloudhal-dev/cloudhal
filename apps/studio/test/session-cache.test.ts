import { afterEach, describe, expect, it } from "vitest";
import { cachedSession, forgetSession } from "../src/lib/session-cache.ts";

describe("cachedSession (a navigation does not wait for the server's session check)", () => {
  afterEach(() => forgetSession());

  it("asks once, shares a request in flight, and reuses the answer for five minutes", async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      return { user: "ada" };
    };
    const [a, b] = await Promise.all([cachedSession(load, 0), cachedSession(load, 0)]);
    expect(a).toEqual({ user: "ada" });
    expect(b).toBe(a);
    await cachedSession(load, 4 * 60_000);
    expect(calls).toBe(1);
    await cachedSession(load, 6 * 60_000);
    expect(calls).toBe(2);
  });

  it("never keeps an empty or failed answer, and forgets on request", async () => {
    let calls = 0;
    expect(await cachedSession(async () => (calls++, null), 0)).toBeNull();
    await expect(
      cachedSession(async () => (calls++, Promise.reject(new Error("x"))), 0),
    ).rejects.toThrow();
    await cachedSession(async () => (calls++, { user: "ada" }), 0);
    forgetSession();
    await cachedSession(async () => (calls++, { user: "ada" }), 0);
    expect(calls).toBe(4);
  });
});
