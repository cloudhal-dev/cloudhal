/** RFC-0020 §6 (phase 20b): Studio's Build view follows a page's changes as server-sent events. */
import type { Page } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";
import { BUILD_VIEWER_LIMIT, createBuildHub } from "../src/build.ts";

const human = { kind: "human" as const, id: "user_builder0001", name: "Halil" };
const agent = { kind: "agent" as const, id: "agent_builder001", name: "Builder" };

async function setup() {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  await store.init();
  const site = await seedStarterSite(store, { name: "Build Site", slug: "build" });
  const home = (await store.listPages(site.id)).find((p) => p.path === "/") as Page;
  const build = createBuildHub();
  const app = createApi({
    store,
    build,
    resolveActor: async (c) => (c.req.header("x-test-user") ? human : undefined),
  });
  return { store, site, home, build, app };
}

/** Reads server-sent events from a response body, one JSON payload at a time. */
function events(res: Response) {
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const next = async (): Promise<Record<string, unknown>> => {
    for (;;) {
      const end = buffer.indexOf("\n\n");
      if (end >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = block
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("\n");
        if (data) return JSON.parse(data) as Record<string, unknown>;
        continue;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("stream ended");
      buffer += decoder.decode(value, { stream: true });
    }
  };
  return Object.assign(next, { close: () => reader.cancel() });
}

describe("build events", () => {
  it("streams a snapshot, then Studio saves and agent changes with what changed", async () => {
    const { site, home, build, app } = await setup();
    const path = `/api/sites/${site.id}/pages/${home.id}/build/events`;
    expect((await app.request(path)).status).toBe(401);
    const controller = new AbortController();
    const res = await app.request(path, {
      headers: { "x-test-user": "1" },
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const next = events(res);
    const snap = await next();
    expect(snap.type).toBe("STATE_SNAPSHOT");
    expect((snap.snapshot as { html: string }).html).toContain("<!doctype html>");
    expect(build.viewers(home.id)).toBe(1);

    // A Studio save is reported with the sections it changed.
    const saved = await app.request(`/api/sites/${site.id}/pages/${home.id}`, {
      method: "PUT",
      headers: { "x-test-user": "1", "content-type": "application/json" },
      body: JSON.stringify({ ...home, title: "Renamed", sections: home.sections.slice(1) }),
    });
    expect(saved.status).toBe(200);
    const delta = await next();
    expect(delta).toMatchObject({
      type: "STATE_DELTA",
      title: "Renamed",
      tool: "studio",
      actor: { kind: "human", name: "Halil" },
      changed: [],
    });

    // An agent's refused build and its applied patch, as the MCP tools report them.
    build.patchRejected({
      siteId: site.id,
      pageId: home.id,
      tool: "patch_draft",
      actor: agent,
      issues: [{ code: "VALIDATION_FAILED", path: "/sections/0", message: "nope" }],
    });
    expect(await next()).toMatchObject({
      type: "CUSTOM",
      name: "validation_failed",
      value: { tool: "patch_draft", actor: { kind: "agent", name: "Builder" } },
    });
    const page = (await saved.json()) as Page;
    const surface = {
      id: "sec_surface0001",
      kind: "surface" as const,
      catalog: "blog@1",
      components: [{ id: "root", component: "Heading", props: { text: "Live" } }],
    } as Page["sections"][number];
    build.pageChanged({
      siteId: site.id,
      page: { ...page, rev: page.rev + 1, sections: [...page.sections, surface] },
      tool: "patch_draft",
      actor: agent,
      ops: [{ op: "add", path: "/sections/-" }],
      repairs: ['root: component "heading" → "Heading"'],
    });
    const built = await next();
    expect(built).toMatchObject({
      type: "STATE_DELTA",
      changed: ["sec_surface0001"],
      repairs: ['root: component "heading" → "Heading"'],
    });
    expect(built.html).toContain('data-kind="surface"');

    // The viewer leaves (the browser closes the stream): it stops following.
    await next.close();
    await new Promise((r) => setTimeout(r, 20));
    expect(build.viewers(home.id)).toBe(0);
  });

  it("refuses more than the viewer limit on one page", async () => {
    const { site, home, build, app } = await setup();
    const offs = await Promise.all(
      Array.from({ length: BUILD_VIEWER_LIMIT }, () => build.subscribe(home.id, () => {})),
    );
    const res = await app.request(`/api/sites/${site.id}/pages/${home.id}/build/events`, {
      headers: { "x-test-user": "1" },
    });
    expect(res.status).toBe(429);
    for (const off of offs) off();
  });
});
