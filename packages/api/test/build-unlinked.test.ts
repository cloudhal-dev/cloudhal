/**
 * Components a model adds but never links into a parent's children do not show: Build tells the
 * model which ones and where to link them, and the eval does not count an empty page as finished.
 */
import type { Page } from "@cloudhal/core-contracts";
import { createCatalog } from "@cloudhal/core-ts/surfaces";
import { describe, expect, it } from "vitest";
import type { AiRunRequest, AiTransport } from "../src/ai/client.ts";
import { BUILD_EVAL_BRIEFS, runBuildEvalOnce, visibleParts } from "../src/build-eval.ts";
import { type BuildTurnEvent, runBuildTurn, unlinkedComponents } from "../src/build-turn.ts";

const catalog = createCatalog({ name: "blog", major: 1 });
const blank: Page = {
  schemaVersion: 1,
  id: "page_unlinked001",
  siteId: "site_unlinked1",
  path: "/x",
  title: "X",
  locale: "en",
  status: "draft",
  sections: [],
  rev: 0,
  createdAt: "2026-10-15T00:00:00.000Z",
  updatedAt: "2026-10-15T00:00:00.000Z",
};
const loose = JSON.stringify({
  ops: [
    {
      op: "add",
      path: "/sections/-",
      value: {
        id: "sec_loose00001",
        kind: "surface",
        catalog: "blog@1",
        components: [
          { id: "root", component: "Stack", children: [] },
          { id: "title", component: "Heading", props: { text: "Hi", level: 1 } },
        ],
      },
    },
  ],
});
const link = JSON.stringify({
  ops: [{ op: "add", path: "/sections/0/components/0/children/-", value: "title" }],
});

function scripted(rounds: string[][]): AiTransport & { requests: AiRunRequest[] } {
  const requests: AiRunRequest[] = [];
  return {
    kind: "binding",
    requests,
    async *stream(r) {
      requests.push(r);
      yield {
        type: "text",
        text: `${(rounds[requests.length - 1] ?? ['{"done":true}']).join("\n")}\n`,
      };
      yield { type: "usage", inputTokens: 10, outputTokens: 10 };
    },
    models: async () => [],
  };
}

async function turn(rounds: string[][], start: Page = blank) {
  let page = structuredClone(start);
  const events: BuildTurnEvent[] = [];
  const transport = scripted(rounds);
  await runBuildTurn("A heading", {
    transport,
    model: "m",
    catalog,
    siteId: page.siteId,
    pageId: page.id,
    actor: { kind: "system", id: "sys_unlinked01" },
    load: async () => page,
    write: async (next) => {
      page = { ...next, rev: page.rev + 1 };
      return page;
    },
    snapshot: async () => undefined,
    emit: (e) => events.push(e),
  });
  return { page, events, transport };
}

describe("unlinked components", () => {
  it("are named with where to link them, and the next round links them", async () => {
    const { page, events, transport } = await turn([
      [loose, '{"done":true}'],
      [link, '{"done":true}'],
    ]);
    expect(events).toContainEqual({ type: "unlinked", components: ["sec_loose00001/title"] });
    const ask = String(transport.requests[1]?.messages.at(-1)?.content);
    expect(ask).toContain("no parent lists them in its children, so they do not show");
    expect(ask).toContain(
      '- section 0 (sec_loose00001): "title" (add each id to a parent\'s children: /sections/0/components/<parent position>/children/-)',
    );
    expect(ask).not.toContain("were refused");
    expect(unlinkedComponents(page, catalog).keys).toEqual([]);
    expect(events.filter((e) => e.type === "unlinked")).toHaveLength(1);
  });

  it("leaves alone what was loose before the turn", async () => {
    const before = (await turn([[loose, '{"done":true}'], ['{"done":true}'], ['{"done":true}']]))
      .page;
    expect(unlinkedComponents(before, catalog).keys).toEqual(["sec_loose00001/title"]);
    const { events, transport } = await turn(
      [['{"say":"Nothing to do."}', '{"done":true}']],
      before,
    );
    expect(events.some((e) => e.type === "unlinked")).toBe(false);
    expect(transport.requests).toHaveLength(1);
  });

  it("an eval page with nothing a reader would see is not finished", async () => {
    const empty = await turn([[loose, '{"done":true}'], ['{"done":true}'], ['{"done":true}']]);
    expect(visibleParts(empty.page, catalog)).toBe(0);
    const transport = scripted([[loose, '{"done":true}'], ['{"done":true}'], ['{"done":true}']]);
    const run = await runBuildEvalOnce({
      transport,
      model: "loose",
      brief: BUILD_EVAL_BRIEFS[0] as (typeof BUILD_EVAL_BRIEFS)[number],
      catalog,
      siteId: blank.siteId,
    });
    expect(run).toMatchObject({ steps: 1, finished: false, unlinked: 3 });
    const linked = await turn([[loose, link, '{"done":true}']]);
    expect(visibleParts(linked.page, catalog)).toBe(1);
  });
});
