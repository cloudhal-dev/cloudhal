/** RFC-0020 §6 (phase 20c): Studio's Build chat — the site's model changes a page step by step. */
import { AuditLog } from "@cloudhal/agent-runtime";
import type { Page, SurfaceSection } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import type { AiRunRequest, AiTransport } from "../src/ai/client.ts";
import { AiStore } from "../src/ai/store.ts";
import { createApi } from "../src/app.ts";
import { type BuildChange, createBuildHub } from "../src/build.ts";
import {
  closeBrackets,
  componentPaths,
  componentsIn,
  JsonObjectReader,
  parseLine,
} from "../src/build-turn.ts";

const human = { kind: "human" as const, id: "user_builder0001", name: "Halil" };

/** A model that answers each round with the next script, cut into small chunks mid-line. */
function scriptedModel(rounds: string[][]) {
  const requests: AiRunRequest[] = [];
  const transport: AiTransport = {
    kind: "binding",
    async *stream(r) {
      requests.push(r);
      const text = `${(rounds[requests.length - 1] ?? ['{"done":true}']).join("\n")}\n`;
      for (let i = 0; i < text.length; i += 17) yield { type: "text", text: text.slice(i, i + 17) };
      yield { type: "usage", inputTokens: 1000, outputTokens: 200 };
    },
    models: async () => [],
  };
  return { transport, requests };
}

const surface = {
  id: "sec_chatbuild001",
  kind: "surface",
  catalog: "blog@1",
  components: [{ id: "root", component: "Stackk", children: [] }],
};
const heading = (level: number) =>
  JSON.stringify({
    ops: [
      {
        op: "add",
        path: "/sections/1/components/-",
        value: { id: "title", component: "Heading", props: { text: "Hello", level } },
      },
      { op: "add", path: "/sections/1/components/0/children/-", value: "title" },
    ],
  });

async function setup(rounds: string[][]) {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  const site = await seedStarterSite(store, { name: "Chat Site", slug: "chat" });
  const about = (await store.listPages(site.id)).find((p) => p.path === "/about") as Page;
  const audit = new AuditLog(sql);
  const ai = new AiStore(sql);
  const model = scriptedModel(rounds);
  const build = createBuildHub();
  const app = createApi({
    store,
    audit,
    build,
    resolveActor: async () => human,
    ai: { store: ai, transport: model.transport },
  });
  const send = (method: string, path: string, body?: unknown) =>
    app.request(`/api/sites/${site.id}/ai${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { store, site, about, audit, model, build, send };
}

const lines = async (res: Response) =>
  (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);

describe("build chat", () => {
  it("reads objects wherever the model breaks lines, and sets prose and fences aside", () => {
    const reader = new JsonObjectReader();
    const text = [
      "Sure! Here is the page:",
      "```json",
      "{",
      '  "say": "Building {a} hero"',
      "}",
      '{"ops":{"op":"remove","path":"/sections/0"}} {"op":"remove","path":"/sections/1"}',
      "```",
      '{"done":true}',
    ].join("\n");
    const items = [
      ...[...text].reduce<ReturnType<JsonObjectReader["push"]>>(
        (all, ch) => all.concat(reader.push(ch)),
        [],
      ),
      ...reader.end(),
    ];
    expect(items.filter((i) => "prose" in i)).toEqual([{ prose: "Sure! Here is the page:" }]);
    const parsed = items.flatMap((i) => ("object" in i ? [parseLine(i.object)] : []));
    expect(parsed).toEqual([
      { say: "Building {a} hero" },
      { ops: [{ op: "remove", path: "/sections/0" }] },
      { ops: [{ op: "remove", path: "/sections/1" }] },
      { done: true },
    ]);
    // an answer cut off mid-object comes back whole at the end, and does not parse
    const cut = new JsonObjectReader();
    expect(cut.push('{"ops":[{"op":"add"')).toEqual([]);
    expect(cut.partial).toBe('{"ops":[{"op":"add"');
    expect(cut.end()).toEqual([{ object: '{"ops":[{"op":"add"' }]);
  });

  it("puts a long step's closing brackets in order, and says where an unreadable one broke", () => {
    // `}}}]]` for `}}]}`: the step still ends at its last closer, and the next line is read
    const reader = new JsonObjectReader();
    const step =
      '{"ops":[{"op":"add","path":"/sections/-","value":{"id":"sec_priced01","data":{"seats":1}}}]]';
    const items = [...reader.push(`${step}\n{"done":true}\n`), ...reader.end()];
    expect(items).toEqual([{ object: step }, { object: '{"done":true}' }]);
    expect(parseLine(step)).toEqual({
      ops: [{ op: "add", path: "/sections/-", value: { id: "sec_priced01", data: { seats: 1 } } }],
      repaired: "closing brackets put in order",
    });
    expect(closeBrackets('{"a":[1,{"b":"]}"}')).toBe('{"a":[1,{"b":"]}"}]}');
    expect(closeBrackets('{"a":1}')).toBeUndefined();
    const broken = parseLine(
      '{"ops":[{"op":"add","path":"/sections/-","value":{"children":["a"],"b"}}]}',
    );
    expect(broken).toMatchObject({
      invalid: expect.stringMatching(
        /^not one JSON object \(.+ at character \d+, near ".*"\); nothing in it was applied\. Send it again in smaller steps/,
      ),
    });
  });

  it("forgives raw line breaks in strings and trailing commas, and finds components by id", () => {
    expect(parseLine('{"say":"two\nlines\there",}')).toEqual({ say: "two\nlines\there" });
    expect(parseLine('{"ops":[{"op":"remove","path":"/sections/0"},],}')).toEqual({
      ops: [{ op: "remove", path: "/sections/0" }],
    });
    // a comma inside a string is kept; the missing closing brace is added
    expect(parseLine('{"say":"a, }"')).toEqual({ say: "a, }" });
    const page = {
      sections: [
        { id: "sec_a00000001", kind: "richText" },
        {
          id: "sec_b00000001",
          kind: "surface",
          components: [{ id: "root" }, { id: "tabs" }],
        },
      ],
    } as unknown as Page;
    expect(
      componentPaths(page, [
        { op: "add", path: "/sections/1/components/tabs/children/-", value: "x" },
        { op: "move", from: "/sections/1/components/root", path: "/sections/1/components/0" },
        { op: "add", path: "/sections/1/components/nope/children/-", value: "y" },
      ]),
    ).toEqual({
      ops: [
        { op: "add", path: "/sections/1/components/1/children/-", value: "x" },
        { op: "move", from: "/sections/1/components/0", path: "/sections/1/components/0" },
        { op: "add", path: "/sections/1/components/nope/children/-", value: "y" },
      ],
      notes: [
        "/sections/1/components/tabs → /sections/1/components/1",
        "/sections/1/components/root → /sections/1/components/0",
      ],
    });
  });

  it("parses one JSON object per line and names the components being written", () => {
    expect(parseLine('{"say":"Hi"}')).toEqual({ say: "Hi" });
    expect(parseLine('{"done":true}')).toEqual({ done: true });
    expect(parseLine("```json")).toBeUndefined();
    expect(parseLine("   ")).toBeUndefined();
    expect(parseLine("<div>")).toMatchObject({ invalid: expect.stringContaining("not one JSON") });
    expect(parseLine('{"x":1}')).toEqual({ invalid: 'a line has "say", "ops" or "done"' });
    expect(
      componentsIn('{"ops":[{"value":{"id":"a","component":"Band"},{"component":"Hea'),
    ).toEqual(["Band"]);
  });

  it("builds step by step, repairs, sends refusals back, and ends with one snapshot", async () => {
    const { send, store, about, audit, model, build, site } = await setup([
      [
        '{"say":"I will add a heading."}',
        JSON.stringify({ ops: [{ op: "add", path: "/sections/-", value: surface }] }),
        heading(7),
        '{"done":true}',
      ],
      [heading(2), '{"done":true}'],
    ]);
    const seen: BuildChange[] = [];
    await build.subscribe(about.id, (c) => seen.push(c));
    expect((await send("POST", `/build/${about.id}`, { message: "A heading" })).status).toBe(409);
    await send("PUT", "/settings", {
      enabled: true,
      model: "@cf/zai-org/glm-4.7-flash",
      dailyLimit: 5,
      rev: 0,
    });
    const before = (await store.listSnapshots(site.id)).length;
    const res = await send("POST", `/build/${about.id}`, { message: "A heading saying hello" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await lines(res);
    expect(events.map((e) => (e.type === "step" ? `step:${e.ok}` : e.type))).toEqual([
      "round",
      "say",
      "writing",
      "step:true",
      "writing",
      "step:false",
      "round",
      "writing",
      "step:true",
      "done",
    ]);
    expect(events[3]).toMatchObject({ repairs: ['root: component "Stackk" → "Stack"'] });
    expect(events[5]).toMatchObject({
      issues: ["/sections/1/components/1/props/level at most 4"],
    });
    expect(events.at(-1)).toMatchObject({
      type: "done",
      steps: 2,
      refused: 1,
      usage: { inputTokens: 2000, outputTokens: 400 },
    });

    // The model heard what was refused, with the page as it stood.
    const retry = model.requests[1]?.messages ?? [];
    expect(retry.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(retry[3]?.content).toContain("/sections/1/components/1/props/level at most 4");
    expect(model.requests[0]?.messages[0]?.content).toContain("catalog blog@1");

    const page = (await store.getPage(about.id)) as Page;
    const built = page.sections[1] as SurfaceSection;
    expect(built.components.map((c) => `${c.id}:${c.component}`)).toEqual([
      "root:Stack",
      "title:Heading",
    ]);
    expect(page.status).toBe(about.status);
    expect((await store.listSnapshots(site.id)).length).toBe(before + 1);
    expect(seen.map((c) => c.kind)).toEqual(["changed", "rejected", "changed"]);

    const row = (await audit.list({ siteId: site.id })).find((r) => r.tool === "build_chat");
    expect(row).toMatchObject({ actor: human, outcome: "ok", input: { steps: 2, refused: 1 } });
    expect(JSON.stringify(row)).not.toContain("saying hello");
    const usage = (await (await send("GET", "/settings")).json()) as {
      usage: { requests: number };
    };
    expect(usage.usage.requests).toBe(1);
  });

  it("checks the brief and the page", async () => {
    const { send, about } = await setup([]);
    await send("PUT", "/settings", {
      enabled: true,
      model: "@cf/zai-org/glm-4.7-flash",
      dailyLimit: 5,
      rev: 0,
    });
    expect((await send("POST", `/build/${about.id}`, { message: "" })).status).toBe(400);
    expect((await send("POST", "/build/page_missing0001", { message: "x" })).status).toBe(404);
  });

  it("scopes a brief to the part the person picked in the preview (RFC-0020 §6)", async () => {
    const { send, store, about, model } = await setup([
      [heading(3), '{"done":true}'],
      ['{"done":true}'],
    ]);
    await send("PUT", "/settings", {
      enabled: true,
      model: "@cf/zai-org/glm-4.7-flash",
      dailyLimit: 5,
      rev: 0,
    });
    // a surface to pick from
    const page = (await store.getPage(about.id)) as Page;
    await store.updatePage({
      ...page,
      sections: [
        ...page.sections,
        {
          ...(surface as unknown as SurfaceSection),
          components: [{ id: "root", component: "Stack", children: [] }],
        },
      ],
    });
    // a part that is not on the page is refused before the model runs
    for (const scope of [
      { sectionId: "sec_missing00001" },
      { sectionId: "sec_chatbuild001", componentId: "nope" },
      { sectionId: 42 },
    ])
      expect((await send("POST", `/build/${about.id}`, { message: "Bigger", scope })).status).toBe(
        400,
      );
    expect(model.requests).toHaveLength(0);

    const res = await send("POST", `/build/${about.id}`, {
      message: "Make it bigger",
      scope: { sectionId: "sec_chatbuild001", componentId: "root" },
    });
    expect(res.status).toBe(200);
    await lines(res);
    const brief = String(model.requests[0]?.messages.find((m) => m.role === "user")?.content ?? "");
    expect(brief).toContain(
      'The person picked the Stack "root" in section sec_chatbuild001 in the preview, at /sections/1/components/0.',
    );
    expect(JSON.parse(/It is now: (.*)/.exec(brief)?.[1] ?? "null")).toEqual({
      id: "root",
      component: "Stack",
      children: [],
    });
    expect(brief).toContain("Brief: Make it bigger");
  });
});
