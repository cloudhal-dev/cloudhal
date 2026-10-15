/** RFC-0020 open question 7: the Build model eval, on scripted models (no real calls here). */
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { checkPageSurfaces, createCatalog } from "@cloudhal/core-ts/surfaces";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import type { AiRunRequest, AiTransport } from "../src/ai/client.ts";
import { createApi } from "../src/app.ts";
import {
  BUILD_EVAL_BRIEFS,
  buildEvalTable,
  runBuildEvalOnce,
  summariseBuildEval,
} from "../src/build-eval.ts";

const TOKEN = "deploy-token-for-tests-0123456789abcdef";
const catalog = createCatalog({ name: "blog", major: 1 });

const addSurface = JSON.stringify({
  ops: [
    {
      op: "add",
      path: "/sections/-",
      value: {
        id: "sec_evalbuilt001",
        kind: "surface",
        catalog: "blog@1",
        components: [
          { id: "root", component: "Stack", children: ["title"] },
          { id: "title", component: "Heading", props: { text: "Hello", level: 2 } },
        ],
      },
    },
  ],
});
const badStep = JSON.stringify({
  ops: [
    { op: "add", path: "/sections/-", value: { id: "sec_bad", kind: "surface", components: [] } },
  ],
});

/** Each model answers every round with its script; "broken" fails before streaming. */
function models(): AiTransport & { requests: AiRunRequest[] } {
  const requests: AiRunRequest[] = [];
  const scripts: Record<string, string[]> = {
    good: ['{"say":"Building."}', addSurface, '{"done":true}'],
    sloppy: [
      "Sure! Here is the page:",
      badStep,
      addSurface.replace('"Heading"', '"Headng"'),
      '{"done":true}',
    ],
  };
  return {
    kind: "binding",
    requests,
    async *stream(r) {
      requests.push(r);
      if (r.model === "broken") throw new Error("model not found");
      // The first answer per turn follows the script; corrections rounds just finish.
      const first = !r.messages.some((m) => m.role === "assistant");
      const text = `${((first && scripts[r.model]) || ['{"done":true}']).join("\n")}\n`;
      for (let i = 0; i < text.length; i += 23) yield { type: "text", text: text.slice(i, i + 23) };
      yield { type: "usage", inputTokens: 900, outputTokens: 120 };
    },
    models: async () => [],
  };
}

describe("Build model eval", () => {
  it("measures a turn in memory and ranks models by finished turns, acceptance, then speed", async () => {
    const transport = models();
    let clock = 0;
    const now = () => (clock += 250);
    const brief = BUILD_EVAL_BRIEFS[0] as (typeof BUILD_EVAL_BRIEFS)[number];
    const good = await runBuildEvalOnce({
      transport,
      model: "good",
      brief,
      catalog,
      siteId: "site_eval000001",
      now,
    });
    expect(good).toMatchObject({
      model: "good",
      brief: "landing",
      finished: true,
      steps: 1,
      refused: 0,
      repairs: 0,
      rounds: 1,
      components: 2,
      inputTokens: 900,
      outputTokens: 120,
    });
    expect(good.firstStepMs).toBeGreaterThan(0);
    const sloppy = await runBuildEvalOnce({
      transport,
      model: "sloppy",
      brief,
      catalog,
      siteId: "site_eval000001",
      now,
    });
    // prose is set aside; the broken step is refused, the misspelt component repaired
    expect(sloppy).toMatchObject({ finished: true, steps: 1, refused: 1, repairs: 1, rounds: 2 });
    expect(sloppy.samples[0]).toMatch(/^\/sections\/0/);
    const broken = await runBuildEvalOnce({
      transport,
      model: "broken",
      brief,
      catalog,
      siteId: "site_eval000001",
      now,
    });
    expect(broken).toMatchObject({ finished: false, steps: 0, error: expect.any(String) });

    const summary = summariseBuildEval([sloppy, broken, good]);
    expect(summary.map((s) => s.model)).toEqual(["good", "sloppy", "broken"]);
    expect(summary[1]).toMatchObject({ acceptance: 0.5, refusalsPerTurn: 1, repairsPerTurn: 1 });
    expect(buildEvalTable(summary)).toContain("| `good` | 1/1 | 100% |");
  });

  it("starts edits from a valid page and scopes the scoped brief", async () => {
    const edit = BUILD_EVAL_BRIEFS.find((b) => b.id === "scoped");
    expect(checkPageSurfaces(edit?.start ?? [], catalog)).toEqual([]);
    const transport = models();
    await runBuildEvalOnce({
      transport,
      model: "good",
      brief: edit as never,
      catalog,
      siteId: "site_eval000001",
    });
    const user = transport.requests[0]?.messages.find((m) => m.role === "user")?.content ?? "";
    expect(user).toContain('The person picked the Button "cta" in section sec_evalhero0001');
  });

  it("runs on the deployment behind the deploy token, streaming runs then the summary, storing nothing", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    const blobs = new MemoryBlobStore();
    const store = new SiteGraphStore({ sql, blobs });
    await store.init();
    const site = await seedStarterSite(store, { name: "Eval", slug: "eval" });
    const before = (await store.listPages(site.id)).map((p) => [p.id, p.rev]);
    const transport = models();
    const app = createApi({
      store,
      admin: { deployToken: TOKEN, storage: { sql, blobs } },
      ai: { store: undefined as never, transport },
    });
    const post = (body: unknown, token = TOKEN) =>
      app.request(`/api/admin/sites/${site.id}/ai/build-eval`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await post({}, "nope")).status).toBe(401);
    expect((await post({ briefs: ["nonexistent"] })).status).toBe(400);
    const res = await post({ models: ["good", "sloppy"], briefs: ["landing", "faq"] });
    expect(res.status).toBe(200);
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { type: string; summary?: { model: string }[] });
    expect(lines.filter((l) => l.type === "run")).toHaveLength(4);
    expect(lines.at(-1)?.summary?.map((s) => s.model)).toEqual(["good", "sloppy"]);
    expect((await store.listPages(site.id)).map((p) => [p.id, p.rev])).toEqual(before);
    expect(await store.latestSnapshot(site.id)).toBeUndefined();

    const noAi = createApi({ store, admin: { deployToken: TOKEN, storage: { sql, blobs } } });
    expect(
      (
        await noAi.request(`/api/admin/sites/${site.id}/ai/build-eval`, {
          method: "POST",
          headers: { authorization: `Bearer ${TOKEN}` },
        })
      ).status,
    ).toBe(503);
  });
});
