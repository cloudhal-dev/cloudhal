import { describe, expect, it } from "vitest";
import { varyByHost } from "../src/cache-vary.ts";

describe("varyByHost (#62: the edge cache is keyed by path, not host)", () => {
  it("adds Host to Vary, keeping what is there", () => {
    expect(varyByHost(new Response("x")).headers.get("vary")).toBe("Host");
    const r = varyByHost(new Response("x", { headers: { vary: "Accept-Encoding" } }));
    expect(r.headers.get("vary")).toBe("Accept-Encoding, Host");
  });

  it("leaves Vary: * and an existing Host alone, and keeps status and body", async () => {
    expect(varyByHost(new Response("x", { headers: { vary: "*" } })).headers.get("vary")).toBe("*");
    expect(
      varyByHost(new Response("x", { headers: { vary: "accept, host" } })).headers.get("vary"),
    ).toBe("accept, host");
    const moved = varyByHost(Response.redirect("https://example.com/a", 301));
    expect(moved.status).toBe(301);
    expect(moved.headers.get("location")).toBe("https://example.com/a");
    expect(await varyByHost(new Response("body", { status: 404 })).text()).toBe("body");
  });
});
