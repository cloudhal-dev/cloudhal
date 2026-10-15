/** RFC-0021 phase 21c: the design pass — Build chat's look, and the eval's checks and score. */
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { createCatalog } from "@cloudhal/core-ts/surfaces";
import {
  type PageRenderer,
  RENDER_CHECK_IDS,
  RENDER_CHECK_SCRIPT,
} from "@cloudhal/mcp-server/render";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import type { AiContentPart, AiRunRequest, AiTransport } from "../src/ai/client.ts";
import {
  BUILD_EVAL_BRIEFS,
  buildEvalTable,
  runBuildEvalOnce,
  summariseBuildEval,
} from "../src/build-eval.ts";
import {
  acceptsImages,
  DESIGN_JUDGE_MODEL,
  DESIGN_RUBRIC,
  htmlDataUrl,
  lookMessage,
  parseRubric,
  rubricMessages,
} from "../src/design-pass.ts";

const catalog = createCatalog({ name: "blog", major: 1 });
const VISION = "@cf/meta/llama-4-scout-17b-16e-instruct";

/** A browser whose page fails the contrast check at 390 px; records the URLs it opened. */
function browser(opened: string[]): PageRenderer {
  return {
    async session() {
      return {
        async open(url, viewport) {
          opened.push(url);
          return {
            async evaluate<T>(expression: string): Promise<T> {
              if (expression === RENDER_CHECK_SCRIPT)
                return RENDER_CHECK_IDS.map((id) =>
                  id === "contrast" && viewport.width === 390
                    ? { id, count: 1, examples: ["section sec_x p — 2.0:1, needs 4.5:1"] }
                    : { id, count: 0, examples: [] },
                ) as T;
              const scroll = /scrollTo\(0, (\d+)\)/.exec(expression);
              return (scroll ? Number(scroll[1]) : 1500) as T;
            },
            screenshot: async () => new Uint8Array([0xff, 0xd8, 1]),
            close: async () => {},
          };
        },
        close: async () => {},
      };
    },
  };
}

const addSurface = JSON.stringify({
  ops: [
    {
      op: "add",
      path: "/sections/-",
      value: {
        id: "sec_lookbuilt01",
        kind: "surface",
        catalog: "blog@1",
        components: [
          { id: "root", component: "Stack", children: ["title"] },
          { id: "title", component: "Heading", props: { text: "Hello", level: 1 } },
        ],
      },
    },
  ],
});
const fixTitle = JSON.stringify({
  ops: [{ op: "replace", path: "/sections/0/components/1/props/text", value: "Hello there" }],
});

/** The builder builds, then fixes once after looking; the judge scores. */
function models(): AiTransport & { requests: AiRunRequest[] } {
  const requests: AiRunRequest[] = [];
  return {
    kind: "binding",
    requests,
    async *stream(r) {
      requests.push(r);
      const system = String(r.messages[0]?.content ?? "");
      let text: string;
      if (system.startsWith("You are a strict senior web designer"))
        text =
          'Here you go: {"fidelity": 4, "hierarchy": 3, "rhythm": 2, "spacing": 4, "readability": 3, "mobile": 4, "note": "Plain but clear.",}';
      else if (!r.messages.some((m) => m.role === "assistant"))
        text = `${addSurface}\n{"done":true}\n`;
      else text = `${fixTitle}\n{"done":true}\n`;
      yield { type: "text", text };
      yield { type: "usage", inputTokens: 1000, outputTokens: 100 };
    },
    models: async () => [],
  };
}

describe("design pass (RFC-0021 21c)", () => {
  it("knows which models take images, and reads a judge's lenient JSON", () => {
    expect(acceptsImages(VISION)).toBe(true);
    expect(acceptsImages("@cf/openai/gpt-oss-120b")).toBe(false);
    expect(DESIGN_JUDGE_MODEL).toBe(VISION);
    expect(
      parseRubric('Sure. {"fidelity": 5, "hierarchy": 4, "rhythm": 9, "note": "Good",}'),
    ).toEqual({ score: 4.5, scores: { fidelity: 5, hierarchy: 4 }, note: "Good" });
    expect(parseRubric("no scores")).toBeUndefined();
    expect(parseRubric('{"fidelity": "high"}')).toBeUndefined();
    const url = htmlDataUrl("<html><head><title>x</title></head></html>", "https://x.test/");
    expect(atob(url.slice("data:text/html;base64,".length))).toContain(
      '<head><base href="https://x.test/"><title>',
    );
  });

  it("shows images only to models that take them, always with the checks", () => {
    const look = {
      failed: [
        {
          id: "contrast" as const,
          ok: false,
          count: 1,
          widths: [390],
          examples: ["section sec_x p — 2.0:1, needs 4.5:1"],
        },
      ],
      images: [{ width: 1440, url: "data:image/jpeg;base64,AAAA" }],
    };
    const text = lookMessage(look, false);
    expect(typeof text.content).toBe("string");
    expect(text.content).toContain(
      "- contrast: 1 at 390 px (section sec_x p — 2.0:1, needs 4.5:1)",
    );
    const seen = lookMessage(look, true).content as AiContentPart[];
    expect(seen.map((p) => p.type)).toEqual(["text", "image_url"]);
    const rubric = rubricMessages("A landing page", look);
    expect(String(rubric[0]?.content)).toContain("Cloudhal design guidance");
    const parts = rubric[1]?.content as AiContentPart[];
    expect((parts[0] as { text: string }).text).toContain(
      `Answer with one JSON object and nothing else: {${DESIGN_RUBRIC.map((c) => `"${c.id}": n`).join(", ")}`,
    );
    expect(parts[1]).toEqual({ type: "image_url", image_url: { url: look.images[0]?.url } });
  });

  it("in the eval, a vision model looks at its render, fixes it, and the judge scores the result", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    const site = await seedStarterSite(store, { name: "Design", slug: "design" });
    const transport = models();
    const opened: string[] = [];
    const run = await runBuildEvalOnce({
      transport,
      model: VISION,
      brief: BUILD_EVAL_BRIEFS[0] as (typeof BUILD_EVAL_BRIEFS)[number],
      catalog,
      siteId: site.id,
      design: { renderer: browser(opened), site, look: true },
    });
    expect(run.finished).toBe(true);
    expect(run.steps).toBe(2);
    // the build turn's look and the score's render: preview HTML, at desktop and phone width
    expect(opened).toHaveLength(4);
    expect(opened.every((u) => u.startsWith("data:text/html;base64,"))).toBe(true);
    expect(atob((opened[2] as string).split(",")[1] as string)).toContain("Hello there");
    const lookRequest = transport.requests[1];
    const shown = lookRequest?.messages.at(-1)?.content as AiContentPart[];
    expect(shown.filter((p) => p.type === "image_url")).toHaveLength(4);
    expect(transport.requests[2]?.model).toBe(DESIGN_JUDGE_MODEL);
    expect(run.design).toEqual({
      failed: ["contrast"],
      looked: true,
      score: 3.33,
      scores: { fidelity: 4, hierarchy: 3, rhythm: 2, spacing: 4, readability: 3, mobile: 4 },
      note: "Plain but clear.",
    });
    const summary = summariseBuildEval([run]);
    expect(summary[0]).toMatchObject({ checksFailedPerTurn: 1, medianDesignScore: 3.33 });
    expect(buildEvalTable(summary)).toContain("| Failed checks/turn | Design score |");
    expect(buildEvalTable(summary)).toMatch(/\| 1 \| 3\.33 \|$/);
  });

  it("a text-only model gets the checks without images, and no extra round when nothing failed", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    const site = await seedStarterSite(store, { name: "Text", slug: "text" });
    const transport = models();
    const run = await runBuildEvalOnce({
      transport,
      model: "@cf/openai/gpt-oss-120b",
      brief: BUILD_EVAL_BRIEFS[0] as (typeof BUILD_EVAL_BRIEFS)[number],
      catalog,
      siteId: site.id,
      design: { renderer: browser([]), site, look: true, judge: false },
    });
    const shown = transport.requests[1]?.messages.at(-1)?.content;
    expect(typeof shown).toBe("string");
    expect(shown).toContain("- contrast: 1 at 390 px");
    expect(transport.requests).toHaveLength(2);
    expect(run.design).toEqual({ failed: ["contrast"], looked: true });
  });
});

describe("Build chat looks once per turn (RFC-0021 21c)", () => {
  it("renders the draft with the deployment's browser and shows a vision model its screenshots", async () => {
    const { AiStore } = await import("../src/ai/store.ts");
    const { createApi } = await import("../src/app.ts");
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    const site = await seedStarterSite(store, { name: "Look", slug: "look" });
    const about = (await store.listPages(site.id)).find((p) => p.path === "/about");
    const transport = models();
    const opened: string[] = [];
    const app = createApi({
      store,
      resolveActor: async () => ({ kind: "human", id: "user_looker0001", name: "Looker" }),
      ai: { store: new AiStore(sql), transport },
      mcp: {
        stateKey: "design-pass-test-key-at-least-32-bytes",
        render: { renderer: browser(opened) },
      },
    });
    const send = (method: string, path: string, body?: unknown) =>
      app.request(`/api/sites/${site.id}/ai${path}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    await send("PUT", "/settings", { enabled: true, model: VISION, dailyLimit: 5, rev: 0 });
    const res = await send("POST", `/build/${about?.id}`, { message: "A hello heading" });
    const events = (await res.text())
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { type: string });
    expect(events.find((e) => e.type === "look")).toEqual({
      type: "look",
      failed: ["contrast"],
      images: 4,
    });
    // the look round ran (the scripted fix aims at another section index here)
    expect(events.at(-1)).toMatchObject({ type: "done" });
    // no domain and no preview secret: the draft's preview HTML, with this origin as its base
    expect(opened[0]).toMatch(/^data:text\/html;base64,/);
    expect(atob((opened[0] as string).split(",")[1] as string)).toContain(
      '<base href="http://localhost/">',
    );
    expect(transport.requests).toHaveLength(2);
  });
});
