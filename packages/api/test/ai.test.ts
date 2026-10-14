/** RFC-0016: in-editor AI — the Workers AI client, the model picker, settings and commands. */
import { AuditLog } from "@cloudhal/agent-runtime";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AiBinding,
  AiError,
  type AiEvent,
  bindingTransport,
  parseAiStream,
  restTransport,
} from "../src/ai/client.ts";
import { modelPicker, resetModelCatalogue } from "../src/ai/models.ts";
import { AiStore } from "../src/ai/store.ts";
import { createApi } from "../src/index.ts";

const human = { kind: "human" as const, id: "user_aiowner0001", name: "Owner" };

/** Server-sent events as a byte stream, split into awkward chunks. */
function sse(events: unknown[], split = 7): ReadableStream<Uint8Array> {
  const text = `${events.map((e) => `data: ${typeof e === "string" ? e : JSON.stringify(e)}\n\n`).join("")}`;
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += split) controller.enqueue(bytes.slice(i, i + split));
      controller.close();
    },
  });
}

async function collect(events: AsyncIterable<AiEvent>) {
  let text = "";
  let usage: AiEvent | undefined;
  for await (const e of events) {
    if (e.type === "text") text += e.text;
    else usage = e;
  }
  return { text, usage };
}

afterEach(() => resetModelCatalogue());

describe("Workers AI client", () => {
  it("reads both stream shapes, drops reasoning and reports usage", async () => {
    const out = await collect(
      parseAiStream(
        sse([
          { response: "Merhaba" },
          { choices: [{ delta: { reasoning_content: "thinking…" } }] },
          { choices: [{ delta: { content: ", dünya" } }] },
          { response: "", usage: { prompt_tokens: 12, completion_tokens: 4 } },
          "[DONE]",
        ]),
      ),
    );
    expect(out.text).toBe("Merhaba, dünya");
    expect(out.usage).toEqual({ type: "usage", inputTokens: 12, outputTokens: 4 });
  });

  it("calls the binding, through a gateway when set, and lists text models", async () => {
    const calls: unknown[][] = [];
    const binding: AiBinding = {
      async run(...args) {
        calls.push(args);
        return sse([{ response: "ok" }]);
      },
      async models(params) {
        calls.push(["models", params]);
        return [
          {
            name: "@cf/zai-org/glm-4.7-flash",
            description: "Fast",
            task: { name: "Text Generation" },
            properties: [{ property_id: "context_window", value: "131072" }],
          },
          { name: "@cf/black-forest-labs/flux", task: { name: "Text-to-Image" } },
        ];
      },
    };
    const t = bindingTransport(binding);
    const out = await collect(
      t.stream({
        model: "@cf/zai-org/glm-4.7-flash",
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 50,
        gateway: "studio",
      }),
    );
    expect(out.text).toBe("ok");
    expect(calls[0]).toEqual([
      "@cf/zai-org/glm-4.7-flash",
      { messages: [{ role: "user", content: "hi" }], stream: true, max_tokens: 50 },
      { gateway: { id: "studio" } },
    ]);
    expect(await t.models()).toEqual([
      { id: "@cf/zai-org/glm-4.7-flash", description: "Fast", contextWindow: 131072 },
    ]);
    expect(calls[1]).toEqual(["models", { task: "Text Generation", hide_experimental: true }]);
  });

  it("maps a binding failure to an error code", async () => {
    const t = bindingTransport({
      async run() {
        throw new Error("5007: No such model @cf/gone/model");
      },
    });
    await expect(
      collect(t.stream({ model: "@cf/gone/model", messages: [], maxTokens: 1 })),
    ).rejects.toMatchObject({ code: "ai_model_unavailable" });
    expect(AiError.from(new Error("boom"), 429).code).toBe("ai_rate_limited");
  });

  it("calls the REST API, or the gateway, with the token, and lists models", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
      seen.push({ url, ...(init ? { init } : {}) });
      if (url.includes("/models/search"))
        return Response.json({
          result: [{ name: "@cf/openai/gpt-oss-120b", task: { name: "Text Generation" } }],
        });
      if (url.includes("missing"))
        return Response.json({ errors: [{ code: 7000, message: "No route" }] }, { status: 404 });
      return new Response(sse([{ choices: [{ delta: { content: "yes" } }] }]));
    }) as typeof globalThis.fetch;
    const t = restTransport({ accountId: "acc123", token: "secret-token", fetch });
    const request = { messages: [{ role: "user" as const, content: "x" }], maxTokens: 9 };
    expect((await collect(t.stream({ ...request, model: "@cf/meta/llama" }))).text).toBe("yes");
    expect(seen[0]?.url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acc123/ai/run/@cf/meta/llama",
    );
    expect((seen[0]?.init?.headers as Record<string, string> | undefined)?.authorization).toBe(
      "Bearer secret-token",
    );
    await collect(t.stream({ ...request, model: "openai/gpt-4.1-mini", gateway: "gw-1" }));
    expect(seen[1]?.url).toBe(
      "https://gateway.ai.cloudflare.com/v1/acc123/gw-1/workers-ai/openai/gpt-4.1-mini",
    );
    const failed = await collect(t.stream({ ...request, model: "@cf/missing/model" })).catch(
      (e: AiError) => e,
    );
    expect(failed).toMatchObject({ code: "ai_model_unavailable" });
    expect((failed as Error).message).not.toContain("secret-token");
    expect(await t.models()).toEqual([{ id: "@cf/openai/gpt-oss-120b" }]);
  });
});

describe("model picker", () => {
  it("puts the recommended models first, and keeps them when the catalogue is unreadable", async () => {
    const live = bindingTransport({
      async run() {
        return {};
      },
      async models() {
        return [
          { name: "@cf/zai-org/glm-4.7-flash", task: { name: "Text Generation" } },
          { name: "@cf/qwen/qwen3-30b", task: { name: "Text Generation" } },
        ];
      },
    });
    const picker = await modelPicker(live, 1);
    expect(picker.catalog).toBe("live");
    expect(picker.models.map((m) => [m.id, m.recommended, m.listed])).toEqual([
      ["@cf/zai-org/glm-4.7-flash", "default", true],
      ["@cf/qwen/qwen3-30b", undefined, true],
    ]);
    resetModelCatalogue();
    const broken = bindingTransport({
      async run() {
        return {};
      },
      async models() {
        throw new Error("10000: Authentication error");
      },
    });
    const offline = await modelPicker(broken, 1);
    expect(offline.catalog).toBe("unavailable");
    expect(offline.models.map((m) => m.id)).toEqual([
      "@cf/zai-org/glm-4.7-flash",
      "@cf/openai/gpt-oss-120b",
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    ]);
    expect(offline.models.every((m) => m.listed === false)).toBe(true);
  });
});

describe("AI routes", () => {
  async function setup(answer: (model: string) => unknown = () => sse([{ response: "Kısa." }])) {
    const sql = await BetterSqlite3Driver.open(":memory:");
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    const site = await seedStarterSite(store, { name: "AI", slug: "ai" });
    const entry = (await store.listContentEntries(site.id))[0];
    if (!entry) throw new Error("no entry");
    const audit = new AuditLog(sql);
    const runs: string[] = [];
    const transport = bindingTransport({
      async run(model) {
        runs.push(model);
        const out = answer(model);
        if (out instanceof Error) throw out;
        return out;
      },
    });
    const ai = new AiStore(sql);
    const app = createApi({
      store,
      audit,
      resolveActor: async () => human,
      ai: { store: ai, transport },
    });
    const base = `/api/sites/${site.id}/ai`;
    const send = (method: string, path: string, body?: unknown) =>
      app.request(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    return { app, site, entry, audit, runs, send, ai };
  }

  it("keeps AI off until the owner turns it on, and checks the settings", async () => {
    const { send } = await setup();
    const first = (await (await send("GET", "/settings")).json()) as Record<string, unknown>;
    expect(first).toMatchObject({
      settings: { enabled: false, model: "@cf/zai-org/glm-4.7-flash", dailyLimit: 100, rev: 0 },
      usage: { requests: 0 },
      transport: "binding",
    });
    // Other providers need a gateway; bad values are refused.
    const noGateway = await send("PUT", "/settings", {
      enabled: true,
      model: "openai/gpt-4.1-mini",
      dailyLimit: 10,
      rev: 0,
    });
    expect(noGateway.status).toBe(400);
    expect(
      (await send("PUT", "/settings", { enabled: true, model: "x", dailyLimit: 10, rev: 0 }))
        .status,
    ).toBe(400);
    expect(
      (
        await send("PUT", "/settings", {
          enabled: true,
          model: "@cf/zai-org/glm-4.7-flash",
          dailyLimit: 10_001,
          rev: 0,
        })
      ).status,
    ).toBe(400);
    const saved = await send("PUT", "/settings", {
      enabled: true,
      model: "openai/gpt-4.1-mini",
      gateway: "studio-gw",
      dailyLimit: 5,
      rev: 0,
    });
    expect(await saved.json()).toMatchObject({ enabled: true, gateway: "studio-gw", rev: 1 });
    const stale = await send("PUT", "/settings", {
      enabled: false,
      model: "@cf/zai-org/glm-4.7-flash",
      dailyLimit: 5,
      rev: 0,
    });
    expect(stale.status).toBe(409);
  });

  it("streams a command's Markdown, counts it and audits it without the text", async () => {
    const { send, entry, audit, site, runs } = await setup();
    const command = {
      command: "shorten",
      nodeId: entry.id,
      text: "A long sentence about secrets.",
    };
    expect((await send("POST", "/commands", command)).status).toBe(409); // off
    await send("PUT", "/settings", {
      enabled: true,
      model: "@cf/zai-org/glm-4.7-flash",
      dailyLimit: 2,
      rev: 0,
    });
    const res = await send("POST", "/commands", command);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("Kısa.");
    expect(runs).toEqual(["@cf/zai-org/glm-4.7-flash"]);
    const settings = (await (await send("GET", "/settings")).json()) as {
      usage: { requests: number };
    };
    expect(settings.usage.requests).toBe(1);
    const rows = await audit.list({ siteId: site.id });
    const row = rows.find((r) => r.tool === "ai_command");
    expect(row).toMatchObject({
      actor: human,
      outcome: "ok",
      input: { command: "shorten", model: "@cf/zai-org/glm-4.7-flash", nodeId: entry.id },
    });
    expect(JSON.stringify(row)).not.toContain("secrets");

    // The cap: two a day.
    expect((await send("POST", "/commands", command)).status).toBe(200);
    const capped = await send("POST", "/commands", command);
    expect(capped.status).toBe(429);
    expect(await capped.json()).toMatchObject({ error: "ai_budget" });
  });

  it("refuses bad commands and reports model failures as JSON", async () => {
    const { send, entry } = await setup(() => new Error("5007: No such model"));
    await send("PUT", "/settings", {
      enabled: true,
      model: "@cf/zai-org/glm-4.7-flash",
      dailyLimit: 50,
      rev: 0,
    });
    expect(
      (await send("POST", "/commands", { command: "rhyme", nodeId: entry.id, text: "x" })).status,
    ).toBe(400);
    expect(
      (await send("POST", "/commands", { command: "translate", nodeId: entry.id, text: "x" }))
        .status,
    ).toBe(400);
    expect(
      (await send("POST", "/commands", { command: "fix", nodeId: "entry_missing0001", text: "x" }))
        .status,
    ).toBe(404);
    const failed = await send("POST", "/commands", { command: "fix", nodeId: entry.id, text: "x" });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ error: "ai_model_unavailable" });
  });

  it("says AI is unavailable without a transport", async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    await store.init();
    const site = await seedStarterSite(store, { name: "AI", slug: "ai" });
    const app = createApi({
      store,
      resolveActor: async () => human,
      ai: { store: new AiStore(sql) },
    });
    const res = await app.request(`/api/sites/${site.id}/ai/models`);
    expect(res.status).toBe(503);
    expect(
      (
        (await (await app.request(`/api/sites/${site.id}/ai/settings`)).json()) as {
          transport: string;
        }
      ).transport,
    ).toBe("none");
  });
});
