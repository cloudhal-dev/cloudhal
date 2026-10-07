import { mintPreviewToken, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { PREVIEW_COOKIE, SiteResolver } from "../src/resolver.ts";

const SECRET = "resolver-preview-secret-at-least-32-bytes";
const actor = { kind: "human" as const, id: "user_resolver01", name: "Halil" };

describe("SiteResolver", () => {
  let store: SiteGraphStore;
  let siteId: string;
  let clock: number;
  let resolver: SiteResolver;
  const req = (path: string, cookie?: string) =>
    new Request(`https://site.example${path}`, cookie ? { headers: { cookie } } : {});

  beforeEach(async () => {
    store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
    });
    await store.init();
    siteId = (await seedStarterSite(store, { name: "Resolver", slug: "resolver" })).id;
    clock = Date.UTC(2026, 9, 8, 12);
    resolver = new SiteResolver({
      store,
      siteId,
      previewSecret: SECRET,
      pointerTtlMs: 1000,
      now: () => clock,
    });
  });

  const publish = async (label: string) => {
    const site = await store.getSite(siteId);
    const snap = await store.createSnapshot(siteId, { actor, reason: "publish", label });
    await store.publish(site as NonNullable<typeof site>, snap.id);
    return snap.id;
  };

  it("is unpublished until a snapshot is published, then follows the pointer", async () => {
    expect((await resolver.resolve(req("/"))).kind).toBe("unpublished");
    const v1 = await publish("v1");
    // pointer cached for pointerTtlMs
    expect((await resolver.resolve(req("/"))).kind).toBe("unpublished");
    clock += 1001;
    const r1 = await resolver.resolve(req("/"));
    expect(r1).toMatchObject({ kind: "published", snapshotId: v1 });

    // edits after publish are invisible until the next publish
    const about = (await store.listPages(siteId)).find((p) => p.path === "/about");
    await store.updatePage({ ...(about as NonNullable<typeof about>), title: "Edited" });
    clock += 1001;
    const stillV1 = await resolver.resolve(req("/about"));
    if (stillV1.kind !== "published") throw new Error("expected published");
    expect((await stillV1.source.pageByPath("/about"))?.title).toBe("About");

    const v2 = await publish("v2");
    clock += 1001;
    expect(await resolver.resolve(req("/"))).toMatchObject({ kind: "published", snapshotId: v2 });

    // rollback = pointer flip
    const site = await store.getSite(siteId);
    await store.rollback(site as NonNullable<typeof site>, v1, actor);
    resolver.invalidate();
    expect(await resolver.resolve(req("/"))).toMatchObject({ kind: "published", snapshotId: v1 });
  });

  it("serves drafts or a chosen snapshot behind a signed preview link, then via cookie", async () => {
    const v1 = await publish("v1");
    const about = (await store.listPages(siteId)).find((p) => p.path === "/about");
    await store.updatePage({ ...(about as NonNullable<typeof about>), title: "Draft title" });

    const live = await mintPreviewToken(SECRET, {
      site: siteId,
      target: "live",
      ttlSeconds: 600,
      now: clock,
    });
    const first = await resolver.resolve(req(`/about?cloudhal-preview=${live}`));
    expect(first.kind).toBe("preview");
    if (first.kind !== "preview") throw new Error("unreachable");
    expect((await first.source.pageByPath("/about"))?.title).toBe("Draft title");
    expect(first.setCookie).toMatch(
      new RegExp(`^${PREVIEW_COOKIE}=.+; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$`),
    );

    const cookie = `${PREVIEW_COOKIE}=${encodeURIComponent(live)}`;
    const next = await resolver.resolve(req("/", cookie));
    expect(next.kind).toBe("preview");
    expect((next as { setCookie?: string }).setCookie).toBeUndefined();

    const exit = await resolver.resolve(req("/?cloudhal-preview=exit", cookie));
    expect(exit).toMatchObject({ kind: "published", snapshotId: v1 });
    expect((exit as { setCookie?: string }).setCookie).toContain("Max-Age=0");

    const snapToken = await mintPreviewToken(SECRET, {
      site: siteId,
      target: { snapshot: v1 },
      now: clock,
    });
    const snap = await resolver.resolve(req(`/?cloudhal-preview=${snapToken}`));
    expect(snap).toMatchObject({ kind: "preview", target: { snapshot: v1 } });
  });

  it("ignores bad, expired or foreign tokens and clears a bad cookie", async () => {
    await publish("v1");
    const other = await mintPreviewToken(SECRET, {
      site: "site_other00001",
      target: "live",
      now: clock,
    });
    const foreign = await resolver.resolve(req(`/?cloudhal-preview=${other}`));
    expect(foreign.kind).toBe("published");
    expect((foreign as { previewError?: string }).previewError).toMatch(/site/);

    const short = await mintPreviewToken(SECRET, {
      site: siteId,
      target: "live",
      ttlSeconds: 60,
      now: clock,
    });
    clock += 61_000;
    const expired = await resolver.resolve(req("/", `${PREVIEW_COOKIE}=${short}`));
    expect(expired.kind).toBe("published");
    expect((expired as { setCookie?: string }).setCookie).toContain("Max-Age=0");

    const noSecret = new SiteResolver({ store, siteId });
    const tok = await mintPreviewToken(SECRET, { site: siteId, target: "live" });
    const r = await noSecret.resolve(req(`/?cloudhal-preview=${tok}`));
    expect(r.kind).toBe("published");
    expect((r as { previewError?: string }).previewError).toMatch(/not enabled/);
  });

  it("caches immutable snapshot sources with an LRU bound", async () => {
    const small = new SiteResolver({ store, siteId, snapshotCacheSize: 2 });
    const ids: string[] = [];
    for (const label of ["a", "b", "c"]) ids.push(await publish(label));
    const a1 = await small.snapshot(ids[0] as string);
    expect(await small.snapshot(ids[0] as string)).toBe(a1);
    await small.snapshot(ids[1] as string);
    await small.snapshot(ids[2] as string);
    expect(await small.snapshot(ids[0] as string)).not.toBe(a1);
    await expect(small.snapshot("snap_missing000001")).rejects.toThrow(/not found/);
  });
});
