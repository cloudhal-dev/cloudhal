/**
 * The admin side of the features handshake (RFC-0008 §7.7, S15): `availability` is allowed only
 * once the site Worker answers `GET /__cloudhal/features` with `{ "gates": 1 }`, a collection's
 * `expiry` once it answers 2; a confirmation is kept as a plain value, a refusal is asked again.
 * The site Worker's side, and an "old" site Worker without the endpoint, run on workerd in
 * packages/cli/test/cloudflare-gates.test.ts.
 */
import { describe, expect, it } from "vitest";
import { siteFeatures, siteFieldTypeSupport, siteGateSupport } from "../src/features.ts";

function site(answer: () => Response) {
  const calls: { url: string; auth: string | null; method: string | undefined }[] = [];
  return {
    calls,
    fetch: async (url: string, init: RequestInit) => {
      calls.push({
        url,
        auth: new Headers(init.headers).get("authorization"),
        method: init.method,
      });
      return answer();
    },
  };
}

describe("features handshake (admin side)", () => {
  it("asks the site Worker with the purge token and reads its features", async () => {
    const s = site(() => Response.json({ gates: 1 }));
    expect(await siteFeatures(s.fetch, "tok")).toEqual({ gates: 1 });
    expect(s.calls).toEqual([
      { url: "https://site.internal/__cloudhal/features", auth: "Bearer tok", method: "GET" },
    ]);
    // an older site Worker: the path falls through to its routes (404) — nothing confirmed
    expect(await siteFeatures(site(() => new Response("", { status: 404 })).fetch, "t")).toBe(
      undefined,
    );
    expect(await siteFeatures(site(() => Response.json({})).fetch, "t")).toEqual({});
  });

  it("confirms once and remembers it; refusals, errors and missing bindings are asked again", async () => {
    let confirmed = false;
    let answer: () => Response = () => new Response("not found", { status: 404 });
    const s = site(() => answer());
    const gates = siteGateSupport({
      fetch: s.fetch,
      token: "tok",
      confirmed: () => confirmed,
      remember: () => {
        confirmed = true;
      },
    });
    expect(await gates.enforced("site_a")).toBe(false);
    expect(await gates.enforced("site_a")).toBe(false);
    expect(s.calls).toHaveLength(2);
    answer = () => Response.json({ gates: 0 });
    expect(await gates.enforced("site_a")).toBe(false);
    answer = () => {
      throw new Error("binding down");
    };
    expect(await gates.enforced("site_a")).toBe(false);
    answer = () => Response.json({ gates: 1 });
    expect(await gates.enforced("site_a")).toBe(true);
    expect(confirmed).toBe(true);
    const asked = s.calls.length;
    expect(await gates.enforced("site_a")).toBe(true);
    expect(s.calls).toHaveLength(asked);

    const unbound = siteGateSupport({
      fetch: undefined,
      token: "tok",
      confirmed: () => false,
      remember: () => {},
    });
    expect(await unbound.enforced("site_a")).toBe(false);
  });

  it("asks for gates 2 before a collection expiry (RFC-0042 §3.6) and remembers the version", async () => {
    let confirmed: boolean | number = false;
    let answer = () => Response.json({ gates: 1 });
    const s = site(() => answer());
    const gates = siteGateSupport({
      fetch: s.fetch,
      token: "tok",
      confirmed: () => confirmed,
      remember: (v) => {
        confirmed = v;
      },
    });
    // an RFC-0008 site Worker: availability yes, expiry no
    expect(await gates.enforced("site_a", 2)).toBe(false);
    expect(confirmed).toBe(1);
    expect(await gates.enforced("site_a")).toBe(true);
    const asked = s.calls.length;
    expect(await gates.enforced("site_a", 2)).toBe(false);
    expect(s.calls.length).toBe(asked + 1);
    answer = () => Response.json({ gates: 2 });
    expect(await gates.enforced("site_a", 2)).toBe(true);
    expect(confirmed).toBe(2);
    const after = s.calls.length;
    expect(await gates.enforced("site_a", 2)).toBe(true);
    expect(await gates.enforced("site_a")).toBe(true);
    expect(s.calls).toHaveLength(after);
  });
});

describe("fields: 2 (RFC-0045 §1, admin side)", () => {
  it("says yes once the site Worker reports fields 2, remembers it, and asks again after a no", async () => {
    let remembered = false;
    let answer = { gates: 2, fields: 1 };
    const s = site(() => Response.json(answer));
    const support = siteFieldTypeSupport({
      fetch: s.fetch,
      token: "tok",
      confirmed: () => remembered,
      remember: () => {
        remembered = true;
      },
    });
    expect(await support.supported("site_01HZX8K3Q9AB")).toBe(false);
    answer = { gates: 2, fields: 2 };
    expect(await support.supported("site_01HZX8K3Q9AB")).toBe(true);
    expect(remembered).toBe(true);
    expect(await support.supported("site_01HZX8K3Q9AB")).toBe(true);
    expect(s.calls).toHaveLength(2);
    // no binding or token: refused, never asked
    const none = siteFieldTypeSupport({
      fetch: undefined,
      token: undefined,
      confirmed: () => false,
      remember: () => {},
    });
    expect(await none.supported("site_01HZX8K3Q9AB")).toBe(false);
  });
});
