/**
 * RFC-0036 phase 3 on real workerd (wrangler's test harness): open a session, edit, publish,
 * render, reset, refuse an expired session, and 20 sessions at once — each its own SQLite-backed
 * Durable Object seeded with the starter site.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { newSessionId, SESSION_HEADER, signSession } from "../src/playground.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "fixtures/playground");
const SECRET = "playground-workerd-secret-0123456789ab";
const ORIGIN = "https://try.example.test";

describe("playground Worker on workerd (RFC-0036)", () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeAll(async () => {
    harness = createTestHarness({
      root,
      workers: [
        { configPath: path.join(root, "wrangler.jsonc"), secrets: { PLAYGROUND_SECRET: SECRET } },
      ],
    });
    await harness.listen();
  }, 300_000);

  afterAll(async () => {
    await harness?.close();
  });

  async function openSession(): Promise<{ cookie: string; id: string }> {
    const res = await harness.fetch(`${ORIGIN}/_playground/session`, {
      method: "POST",
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] as string;
    const id = cookie.split("=")[1]?.split(".")[0] as string;
    return { cookie, id };
  }

  const call = (
    cookie: string,
    p: string,
    init: { method?: string; body?: string; headers?: Record<string, string> } = {},
  ) =>
    harness.fetch(`${ORIGIN}${p}`, {
      redirect: "manual",
      ...init,
      headers: {
        cookie,
        origin: ORIGIN,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });

  it("opens a session, edits, publishes and renders the session's own site", async () => {
    const landing = await harness.fetch(`${ORIGIN}/`);
    expect(await landing.text()).toContain("landing");

    const { cookie, id } = await openSession();
    expect(await (await call(cookie, "/")).text()).toContain("studio");

    const me = (await (await call(cookie, "/api/me")).json()) as { actor: { id: string } };
    expect(me.actor.id).toBe("user_playground");
    const instance = (await (await call(cookie, "/api/instance")).json()) as {
      features: { playground?: { expiresAt: string; resetUrl: string } };
    };
    const left = Date.parse(instance.features.playground?.expiresAt ?? "") - Date.now();
    expect(left).toBeGreaterThan(55 * 60_000);
    expect(left).toBeLessThanOrEqual(60 * 60_000);

    const sites = (await (await call(cookie, "/api/sites")).json()) as {
      id: string;
      name: string;
    }[];
    expect(sites.map((s) => s.name)).toEqual(["Playground Demo"]);
    const siteId = sites[0]?.id as string;

    // Not published yet: the session's site answers 503, privately.
    const before = await call(cookie, `/s/${id}/`);
    expect(before.status).toBe(503);
    expect(before.headers.get("cache-control")).toBe("private, no-store");

    // Edit the site's name, then publish.
    const site = (await (await call(cookie, `/api/sites/${siteId}`)).json()) as Record<
      string,
      unknown
    >;
    const put = await call(cookie, `/api/sites/${siteId}`, {
      method: "PUT",
      body: JSON.stringify({ ...site, name: "My Playground" }),
    });
    expect(put.status, await put.clone().text()).toBeLessThan(300);
    const publish = await call(cookie, `/api/sites/${siteId}/snapshots`, {
      method: "POST",
      body: JSON.stringify({ publish: true }),
    });
    expect(publish.status, await publish.clone().text()).toBeLessThan(300);

    const page = await call(cookie, `/s/${id}/`);
    const html = await page.text();
    expect(page.status, html).toBe(200);
    expect(html).toContain("<h1>My Playground</h1>");
    expect(html).toContain(`href="/s/${id}/about/"`);
    expect(html).toContain('href="https://example.org/x"');
    expect(page.headers.get("cache-control")).toBe("private, no-store");
    expect(page.headers.get("x-robots-tag")).toBe("noindex");
    expect(page.headers.get("cache-tag")).toBeNull();

    // Blocked in the Worker, and another session's site is not reachable.
    expect((await call(cookie, "/api/sites", { method: "POST", body: "{}" })).status).toBe(403);
    expect(
      (await call(cookie, `/api/sites/${siteId}/assets/uploads`, { method: "POST", body: "{}" }))
        .status,
    ).toBe(403);
    expect((await call(cookie, `/s/${newSessionId(Date.now())}/`)).status).toBe(404);
  });

  it("resets a session to a freshly seeded site", async () => {
    const { cookie } = await openSession();
    const first = (await (await call(cookie, "/api/sites")).json()) as { id: string }[];
    const reset = await call(cookie, "/_playground/reset", { method: "POST" });
    expect(reset.status).toBe(204);
    const second = (await (await call(cookie, "/api/sites")).json()) as { id: string }[];
    expect(second).toHaveLength(1);
    expect(second[0]?.id).not.toBe(first[0]?.id);
  });

  it("refuses a session past its cap, in the Worker and in the Durable Object", async () => {
    const old = newSessionId(Date.now() - 121 * 60_000);
    const cookie = `__Host-cloudhal_try=${await signSession(old, SECRET)}`;
    expect((await call(cookie, "/api/me")).status).toBe(410);
    // The object refuses on its own, even if a request reached it (no resurrection).
    const env = (await harness.getWorker().getEnv()) as { PLAYGROUND: DurableObjectNamespace };
    const stub = env.PLAYGROUND.get(env.PLAYGROUND.idFromName(old));
    const res = await stub.fetch("https://playground/api/me", {
      headers: { [SESSION_HEADER]: old },
    });
    expect(res.status).toBe(410);
  });

  it("serves 20 sessions at once, each with its own site", async () => {
    const sessions = await Promise.all(Array.from({ length: 20 }, () => openSession()));
    const answers = await Promise.all(sessions.map(({ cookie }) => call(cookie, "/api/sites")));
    expect(answers.map((r) => r.status)).toEqual(Array(20).fill(200));
    const ids = await Promise.all(
      answers.map(async (r) => ((await r.json()) as { id: string }[])[0]?.id),
    );
    expect(new Set(ids).size).toBe(20);
  });
});
