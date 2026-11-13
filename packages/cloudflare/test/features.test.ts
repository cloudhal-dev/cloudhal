/**
 * The admin side of the features handshake (RFC-0008 §7.7, S15): `availability` is allowed only
 * once the site Worker answers `GET /__cloudhal/features` with `{ "gates": 1 }`, a collection's
 * `expiry` once it answers 2; a confirmation is kept as a plain value, a refusal is asked again.
 * The site Worker's side, and an "old" site Worker without the endpoint, run on workerd in
 * packages/cli/test/cloudflare-gates.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  featureRoute,
  type SiteConfirmations,
  siteFeatures,
  siteFieldTypeSupport,
  siteGateSupport,
  siteSupport,
} from "../src/features.ts";

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

describe("siteSupport: both capabilities, per site Worker (RFC-0045 step 7, RFC-0034 §4)", () => {
  const A = "site_01HZX8K3Q9AAAAAAAAAAAAAA";
  const B = "site_01HZX8K3Q9BBBBBBBBBBBBBB";
  /** An admin env with the installation's Worker (`SITE`) and an attached one serving B. */
  function installation(main: Record<string, number>, attached: Record<string, number>) {
    const s = site(() => Response.json(main));
    const a = site(() => Response.json(attached));
    const env = {
      SITE: { fetch: s.fetch } as unknown as Fetcher,
      SITE_1: { fetch: a.fetch } as unknown as Fetcher,
      CLOUDHAL_SITE_ROUTES: JSON.stringify({ [B]: "SITE_1" }),
    };
    return { env, s, a };
  }

  it("asks the Worker that serves each site and remembers each answer for that Worker only", async () => {
    // the installation's Worker reads the types; the attached one runs an older renderer
    const { env, s, a } = installation({ gates: 2, fields: 2 }, { gates: 2 });
    const confirmed: SiteConfirmations = { gates: {}, fields: {} };
    const support = () =>
      siteSupport({ route: (id) => featureRoute(env, id), token: "tok", confirmed });
    expect(await support().fieldTypes.supported(A)).toBe(true);
    expect(await support().fieldTypes.supported(B)).toBe(false);
    expect(confirmed).toEqual({ gates: {}, fields: { SITE: true } });
    expect(s.calls).toHaveLength(1);
    expect(a.calls).toHaveLength(1);
    // A's yes never stands for B: B is asked again, and stays refused
    expect(await support().fieldTypes.supported(B)).toBe(false);
    expect(a.calls).toHaveLength(2);
    // remembered for SITE: no more asking for A
    expect(await support().fieldTypes.supported(A)).toBe(true);
    expect(s.calls).toHaveLength(1);
    // gates are per Worker too
    expect(await support().gates.enforced(B, 2)).toBe(true);
    expect(confirmed.gates).toEqual({ SITE_1: 2 });
  });

  it("a Worker that fails or has no binding is refused and never remembered", async () => {
    const failing = site(() => new Response("boom", { status: 500 }));
    const env = { SITE: { fetch: failing.fetch } as unknown as Fetcher };
    const confirmed: SiteConfirmations = { gates: {}, fields: {} };
    const support = siteSupport({ route: (id) => featureRoute(env, id), token: "tok", confirmed });
    expect(await support.fieldTypes.supported(A)).toBe(false);
    expect(await support.gates.enforced(A)).toBe(false);
    expect(confirmed).toEqual({ gates: {}, fields: {} });
    // no site Worker at all: refused, never asked
    const none = siteSupport({ route: (id) => featureRoute({}, id), token: "tok", confirmed });
    expect(await none.fieldTypes.supported(A)).toBe(false);
    expect(await none.gates.enforced(A)).toBe(false);
  });
});
