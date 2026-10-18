/** RFC-0033 §8: Studio's translation routes — language versions, the stale list, a person's review, the glossary. */
import type { Page, Site } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";

const human = { kind: "human" as const, id: "user_apitest00001", name: "Tester" };
type Json = Record<string, unknown>;

describe("API translations", () => {
  let store: SiteGraphStore;
  let site: Site;
  let about: Page;
  let acerca: Page;
  let app: ReturnType<typeof createApi>;
  const headers = { "content-type": "application/json", "x-test-user": "1" };
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await app.request(path, { headers, ...init });
    return { status: res.status, body: (await res.json()) as Json };
  };
  const base = () => `/api/sites/${site.id}`;

  beforeEach(async () => {
    store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
    });
    await store.init();
    site = await seedStarterSite(store, { name: "Lang", slug: "lang" });
    site = await store.updateSite({ ...site, locales: ["en", "es"] });
    about = (await store.listPages(site.id)).find((p) => p.path === "/about") as Page;
    about = await store.updatePage({
      ...about,
      translation: { group: about.id, method: "original" },
    });
    const hash = (await store.translationGroup(site, about.id)).members[0]?.hash as string;
    ({ page: acerca } = await store.createPage(site, {
      siteId: site.id,
      path: "/acerca",
      title: "Acerca",
      locale: "es",
      status: "draft",
      sections: [],
      translation: {
        group: about.id,
        method: "machine",
        source: { id: about.id, locale: "en", rev: about.rev, hash },
        provenance: { engine: "test-model", at: "2026-10-18T10:00:00Z" },
      },
    }));
    app = createApi({
      store,
      resolveActor: async (c) => (c.req.header("x-test-user") ? human : undefined),
    });
  });

  it("lists a node's language versions with titles and paths, and the site's stale ones", async () => {
    const group = await call(`${base()}/translations/${acerca.id}`);
    expect(group.status).toBe(200);
    expect((group.body.items as Json[]).map((i) => [i.locale, i.method, i.path, i.stale])).toEqual([
      ["en", "original", "/about", false],
      ["es", "machine", "/acerca", false],
    ]);
    await store.updatePage({ ...((await store.getPage(about.id)) as Page), title: "About us" });
    const all = await call(`${base()}/translations?locale=es`);
    expect((all.body.items as Json[]).map((i) => [i.id, i.stale])).toEqual([[acerca.id, true]]);
  });

  it("records a person's review: machine becomes machine-reviewed, CAS on rev, then snapshots", async () => {
    const stale = await call(`${base()}/translations/${acerca.id}/review`, {
      method: "POST",
      body: JSON.stringify({ rev: acerca.rev + 5 }),
    });
    expect(stale.status).toBe(409);
    const ok = await call(`${base()}/translations/${acerca.id}/review`, {
      method: "POST",
      body: JSON.stringify({ rev: acerca.rev }),
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((ok.body as unknown as Page).translation).toMatchObject({
      method: "machine-reviewed",
      review: { by: { kind: "human", id: human.id } },
    });
    const original = await call(`${base()}/translations/${about.id}/review`, {
      method: "POST",
      body: JSON.stringify({ rev: (await store.getPage(about.id))?.rev }),
    });
    expect(original.status).toBe(400);
  });

  it("reads and saves the glossary with its checks", async () => {
    expect((await call(`${base()}/glossary`)).body).toEqual({ siteId: site.id, entries: [] });
    const saved = await call(`${base()}/glossary`, {
      method: "PUT",
      body: JSON.stringify({ entries: [{ term: "Cloudhal", doNotTranslate: true }] }),
    });
    expect(saved.status).toBe(200);
    expect(saved.body.rev).toBe(0);
    const bad = await call(`${base()}/glossary`, {
      method: "PUT",
      body: JSON.stringify({
        ...saved.body,
        entries: [{ term: "x", translations: { fr: { text: "y" } } }],
      }),
    });
    expect(bad.status).toBe(422);
  });
});
