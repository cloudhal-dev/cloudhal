/**
 * RFC-0004 §5.6, §6.2–§6.3: the media tools. Agents upload (base64) and fetch (server-side, SSRF
 * rules) files, refer to them from articles, edit their own uploads; managing any file, deleting and
 * the `auto` rule for publishes that carry media are checked end to end through `runTool`.
 */
import { type AgentMode, AuditLog, defaultScopes, PolicyEngine } from "@cloudhal/agent-runtime";
import type { Asset, ContentEntry, Site } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import type { FetchTransport } from "@cloudhal/core-ts/media";
import { makeJpeg, makePng, PNG_1X1 } from "@cloudhal/core-ts/media/fixtures";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { defineTools, runTool, type ToolContext, ToolError, toolPolicies } from "../src/tools.ts";

const tools = defineTools();
const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
const policy = new PolicyEngine(toolPolicies(tools));
const agent = { kind: "agent" as const, id: "agent_newsroom01", name: "Newsroom Agent" };
const other = { kind: "agent" as const, id: "agent_otherbot01", name: "Other bot" };
const person = { kind: "human" as const, id: "user_owner000001", name: "Halil" };
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** A fake origin: one public host serving a PNG and a page, another resolving to a private IP. */
const transport: FetchTransport = {
  name: "fake",
  pins: true,
  async resolve(host) {
    return host === "evil.example.net" ? ["10.0.0.7"] : ["93.184.216.34"];
  },
  async request(url) {
    if (url.pathname === "/page")
      return {
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        body: new Response("<html>").body,
      };
    return {
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      body: new Response(makePng({ width: 40, height: 30 })).body,
    };
  },
};

describe("media tools", () => {
  let store: SiteGraphStore;
  let audit: AuditLog;
  let site: Site;
  let ctx: ToolContext;

  beforeEach(async () => {
    const sql = await BetterSqlite3Driver.open(":memory:");
    await migrate(sql, migrations);
    store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
    audit = new AuditLog(sql);
    site = await seedStarterSite(store, { name: "Media Site", slug: "media" });
    ctx = {
      store,
      principal: { actor: agent, scopes: defaultScopes(agent) },
      media: { fetchTransport: transport },
    };
  });

  const call = (
    name: string,
    args: Record<string, unknown>,
    options: { confirmed?: boolean; as?: ToolContext } = {},
  ) =>
    runTool(byName[name] as (typeof tools)[number], args, options.as ?? ctx, {
      policy,
      audit,
      confirmed: options.confirmed ?? false,
    });
  const result = async <T>(p: ReturnType<typeof call>): Promise<T> => (await p).result as T;
  const failure = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      if (e instanceof ToolError) return e;
      throw e;
    }
    throw new Error("expected a ToolError");
  };

  const uploadPhoto = (extra: Record<string, unknown> = {}) =>
    result<{ asset: Asset; existing: boolean; url: string; snapshot?: { id: string } }>(
      call("upload_asset", {
        siteId: site.id,
        filename: "ferries.jpg",
        data: b64(makeJpeg({ width: 1200, height: 800, gps: true })),
        alt: "Ferries at dawn",
        ...extra,
      }),
    );

  it("upload_asset: stores, strips, snapshots once, dedupes, and keeps bytes out of the audit", async () => {
    const first = await uploadPhoto({
      title: "Bosphorus at dawn",
      license: { kind: "spdx", id: "CC-BY-4.0" },
    });
    expect(first.existing).toBe(false);
    expect(first.asset).toMatchObject({
      kind: "image",
      mediaType: "image/jpeg",
      alt: { en: "Ferries at dawn" },
      title: { en: "Bosphorus at dawn" },
      license: { kind: "spdx", id: "CC-BY-4.0" },
      uploadedBy: agent,
      source: { kind: "upload", filename: "ferries.jpg" },
      image: { width: 1200, height: 800 },
    });
    expect(first.asset.originalSha256).toBeDefined();
    expect(first.url).toBe(`/media/${first.asset.sha256.slice(0, 16)}/ferries.jpg`);
    expect(first.snapshot?.id).toMatch(/^snap_/);
    const again = await uploadPhoto();
    expect(again.existing).toBe(true);
    expect(again.asset.id).toBe(first.asset.id);
    expect(again.snapshot).toBeUndefined();
    const [row] = await audit.list({ siteId: site.id, limit: 1 });
    expect(row?.tool).toBe("upload_asset");
    const input = row?.input as {
      data: unknown;
      effect: { asset: { id: string; existing: boolean } };
    };
    expect(input.data).toEqual({ base64Chars: expect.any(Number) });
    expect(input.effect.asset).toMatchObject({ id: first.asset.id, existing: true });
  });

  it("upload_asset refuses images without alt text, SVG, mislabelled and oversized files", async () => {
    const noAlt = await failure(
      call("upload_asset", { siteId: site.id, filename: "x.png", data: b64(PNG_1X1) }),
    );
    expect(noAlt.code).toBe("invalid");
    expect(noAlt.message).toMatch(/alt text/);
    const decorative = await result<{ asset: Asset }>(
      call("upload_asset", {
        siteId: site.id,
        filename: "x.png",
        data: b64(PNG_1X1),
        decorative: true,
      }),
    );
    expect(decorative.asset.decorative).toBe(true);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(
      (
        await failure(
          call("upload_asset", {
            siteId: site.id,
            filename: "logo.svg",
            data: b64(svg),
            alt: "Logo",
          }),
        )
      ).code,
    ).toBe("unsupported_type");
    const mislabelled = await failure(
      call("upload_asset", {
        siteId: site.id,
        filename: "photo.jpg",
        data: b64(PNG_1X1),
        alt: "x",
      }),
    );
    expect(mislabelled.code).toBe("type_mismatch");
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big.set(PNG_1X1);
    expect(
      (
        await failure(
          call("upload_asset", { siteId: site.id, filename: "big.png", data: b64(big), alt: "x" }),
        )
      ).code,
    ).toBe("too_large");
    // A refused precheck is audited as a denial, without the payload.
    const rows = await audit.list({ siteId: site.id });
    expect(rows.some((r) => r.decision === "deny" && r.tool === "upload_asset")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(b64(PNG_1X1).slice(0, 40));
  });

  it("fetch_asset_url: server-side fetch under the SSRF rules and the site's host list", async () => {
    const fetched = await result<{ asset: Asset; url: string }>(
      call("fetch_asset_url", {
        siteId: site.id,
        url: "https://images.example.org/photos/kadikoy-pier.png",
        alt: "Kadıköy pier",
      }),
    );
    expect(fetched.asset).toMatchObject({
      mediaType: "image/png",
      slug: "kadikoy-pier",
      source: { kind: "fetch", url: "https://images.example.org/photos/kadikoy-pier.png" },
      image: { width: 40, height: 30 },
    });
    const [row] = await audit.list({ siteId: site.id, limit: 1 });
    expect(
      (row as { input: { effect: { asset: { fetch: unknown } } } }).input.effect.asset.fetch,
    ).toEqual({
      requested: "https://images.example.org/photos/kadikoy-pier.png",
      final: "https://images.example.org/photos/kadikoy-pier.png",
      redirects: 0,
      address: "93.184.216.34",
    });
    const blocked = await failure(
      call("fetch_asset_url", { siteId: site.id, url: "https://evil.example.net/x.png", alt: "x" }),
    );
    expect(blocked.code).toBe("fetch_blocked");
    expect(
      (
        await failure(
          call("fetch_asset_url", { siteId: site.id, url: "https://127.0.0.1/x.png", alt: "x" }),
        )
      ).code,
    ).toBe("fetch_blocked");
    const page = await failure(
      call("fetch_asset_url", {
        siteId: site.id,
        url: "https://images.example.org/page",
        alt: "x",
      }),
    );
    expect(page.message).toMatch(/that URL is a web page/);
    // The site restricts agents to known hosts (metadata `cloudhal.media.allowHosts`).
    await store.updateSite({
      ...((await store.getSite(site.id)) as Site),
      metadata: { "cloudhal.media.allowHosts": "images.unsplash.com, *.wikimedia.org" },
    });
    const elsewhere = await failure(
      call("fetch_asset_url", {
        siteId: site.id,
        url: "https://images.example.org/a.png",
        alt: "x",
      }),
    );
    expect(elsewhere.message).toMatch(/not on this site's list/);
    await result(
      call("fetch_asset_url", {
        siteId: site.id,
        url: "https://upload.wikimedia.org/b.png",
        alt: "x",
      }),
    );
  });

  it("articles use assets by id: coverImage and asset: links; null removes the cover", async () => {
    const { asset } = await uploadPhoto();
    const created = await result<{ entry: ContentEntry }>(
      call("create_entry", {
        siteId: site.id,
        slug: "ferries",
        title: "Ferries at dawn",
        body: `![Ferries](asset:${asset.id})`,
        coverImage: { assetId: asset.id },
      }),
    );
    expect(created.entry.coverImage).toEqual({
      assetId: asset.id,
      alt: "",
      src: `/media/${asset.sha256.slice(0, 16)}/ferries.jpg`,
      width: 1200,
      height: 800,
    });
    const unknown = await failure(
      call("create_entry", {
        siteId: site.id,
        slug: "broken",
        title: "Broken",
        body: "x",
        coverImage: { assetId: "asset_doesnotexist1" },
      }),
    );
    expect(unknown.code).toBe("unknown_asset");
    expect(unknown.message).toMatch(/list_assets/);
    const updated = await result<{ entry: ContentEntry }>(
      call("update_entry", {
        siteId: site.id,
        entryId: created.entry.id,
        rev: created.entry.rev,
        coverImage: null,
      }),
    );
    expect(updated.entry.coverImage).toBeUndefined();
    const got = await result<{ uses: { nodeId: string; field: string; title: string }[] }>(
      call("get_asset", { siteId: site.id, assetId: asset.id }),
    );
    expect(got.uses).toEqual([
      {
        nodeId: created.entry.id,
        nodeKind: "contentEntry",
        field: "body",
        title: "Ferries at dawn",
      },
    ]);
    const listed = await result<{ assets: { asset: Asset; usage: number }[] }>(
      call("list_assets", { siteId: site.id, kind: ["image"] }),
    );
    expect(listed.assets.map((x) => [x.asset.id, x.usage])).toEqual([[asset.id, 1]]);
    // Page sections take `{ assetId, alt }` without src too.
    const page = await result<{ page: { sections: { image?: { src: string } }[] } }>(
      call("create_page", {
        siteId: site.id,
        path: "/gallery",
        title: "Gallery",
        sections: [
          { id: "sec_gallery001", kind: "image", image: { assetId: asset.id, alt: "Ferries" } },
        ],
      }),
    );
    expect(page.page.sections[0]?.image?.src).toMatch(/^\/media\/[0-9a-f]{16}\/ferries\.jpg$/);
  });

  it("preview_page renders library images: the cover with the file's alt, asset: images, sections", async () => {
    const { asset } = await uploadPhoto({ caption: "Morning ferries", credit: "Photo: Ada" });
    const created = await result<{ entry: ContentEntry }>(
      call("create_entry", {
        siteId: site.id,
        slug: "ferries",
        title: "Ferries at dawn",
        body: `Intro\n\n![Ferries leaving Eminönü](asset:${asset.id})`,
        coverImage: { assetId: asset.id },
      }),
    );
    const url = `/media/${asset.sha256.slice(0, 16)}/ferries.jpg`;
    const article = await result<{ html: string }>(
      call("preview_page", { siteId: site.id, entryId: created.entry.id }),
    );
    // The cover's empty per-use alt falls back to the file's own alt text, as on the site.
    expect(article.html).toContain(`<img src="${url}" alt="Ferries at dawn"`);
    expect(article.html).toContain(`<img src="${url}" alt="Ferries leaving Eminönü"`);
    expect(article.html).toContain("<figcaption>Morning ferries · Photo: Ada</figcaption>");
    expect(article.html).not.toContain("<p>Ferries leaving Eminönü</p>");
    const page = await result<{ page: { id: string } }>(
      call("create_page", {
        siteId: site.id,
        path: "/gallery",
        title: "Gallery",
        sections: [
          { id: "sec_gallery001", kind: "image", image: { assetId: asset.id, alt: "" } },
          {
            id: "sec_gallery002",
            kind: "richText",
            format: "markdown",
            body: `![Ferry](asset:${asset.id})`,
          },
        ],
      }),
    );
    const gallery = await result<{ html: string }>(
      call("preview_page", { siteId: site.id, pageId: page.page.id }),
    );
    expect(gallery.html).toContain(
      `<img src="${url}" alt="Ferries at dawn" width="1200" height="800"`,
    );
    expect(gallery.html).toContain("<figcaption>Morning ferries · Photo: Ada</figcaption>");
    expect(gallery.html).toContain(`<img src="${url}" alt="Ferry"`);
  });

  it("update_asset: own uploads with asset:upload, any with asset:manage; retire and restore need manage", async () => {
    const { asset } = await uploadPhoto();
    const edited = await result<{ asset: Asset }>(
      call("update_asset", {
        siteId: site.id,
        assetId: asset.id,
        rev: 0,
        alt: "Two ferries",
        locale: "tr",
        slug: "ferries-at-dawn",
      }),
    );
    expect(edited.asset).toMatchObject({
      alt: { en: "Ferries at dawn", tr: "Two ferries" },
      slug: "ferries-at-dawn",
      rev: 1,
    });
    const otherCtx: ToolContext = {
      ...ctx,
      principal: { actor: other, scopes: defaultScopes(other) },
    };
    const denied = await failure(
      call(
        "update_asset",
        { siteId: site.id, assetId: asset.id, rev: 1, alt: "Mine now" },
        { as: otherCtx },
      ),
    );
    expect(denied.code).toBe("denied");
    const retire = await call(
      "retire_asset",
      { siteId: site.id, assetId: asset.id, rev: 1 },
      { as: otherCtx },
    );
    expect(retire.decision).toMatchObject({ kind: "deny", reason: "missing scope asset:manage" });
    const manager: ToolContext = {
      ...ctx,
      principal: { actor: other, scopes: ["content:read", "asset:manage"] },
    };
    const retired = await result<{ asset: Asset }>(
      call("retire_asset", { siteId: site.id, assetId: asset.id, rev: 1 }, { as: manager }),
    );
    expect(retired.asset.status).toBe("retired");
    const managed = await result<{ asset: Asset }>(
      call(
        "update_asset",
        { siteId: site.id, assetId: asset.id, rev: 2, credit: "Photo: Ayşe" },
        { as: manager },
      ),
    );
    expect(managed.asset.credit).toBe("Photo: Ayşe");
    const restored = await result<{ asset: Asset }>(
      call("restore_asset", { siteId: site.id, assetId: asset.id, rev: 3 }, { as: manager }),
    );
    expect(restored.asset.status).toBe("active");
    // RFC-0028: a focal point for cover crops, kept with the measured fields; null clears it.
    const focal = await result<{ asset: Asset }>(
      call("update_asset", {
        siteId: site.id,
        assetId: asset.id,
        rev: 4,
        focal: { x: 0.3, y: 0.25 },
      }),
    );
    expect(focal.asset.image).toMatchObject({
      width: asset.image?.width,
      focal: { x: 0.3, y: 0.25 },
    });
    const cleared = await result<{ asset: Asset }>(
      call("update_asset", { siteId: site.id, assetId: asset.id, rev: 5, focal: null }),
    );
    expect(cleared.asset.image?.focal).toBeUndefined();
  });

  it("delete_asset: refused while in use before anyone is asked; otherwise approval-gated", async () => {
    const manager: ToolContext = {
      ...ctx,
      principal: { actor: agent, scopes: [...defaultScopes(agent), "asset:manage"] },
    };
    const { asset } = await uploadPhoto();
    const entry = (await store.listContentEntries(site.id))[0] as ContentEntry;
    await store.updateContentEntry({
      ...entry,
      coverImage: { assetId: asset.id, alt: "" } as never,
    });
    const inUse = await failure(
      call("delete_asset", { siteId: site.id, assetId: asset.id, rev: 0 }, { as: manager }),
    );
    expect(inUse.code).toBe("in_use");
    expect(inUse.message).toMatch(/used by "Hello, world"/);
    expect(inUse.details.uses).toEqual([
      { nodeId: entry.id, nodeKind: "contentEntry", field: "coverImage", title: "Hello, world" },
    ]);
    const spare = await result<{ asset: Asset }>(
      call("upload_asset", {
        siteId: site.id,
        filename: "dot.png",
        data: b64(PNG_1X1),
        alt: "A dot",
      }),
    );
    const asked = await call(
      "delete_asset",
      { siteId: site.id, assetId: spare.asset.id, rev: 0 },
      { as: manager },
    );
    expect(asked.decision.kind).toBe("approval-required");
    expect(asked.approvalPrompt).toBe(
      'Delete image "A dot" (PNG, 1×1, 70 B) from the media library? Earlier snapshots keep its bytes until they are no longer needed.',
    );
    const done = await call(
      "delete_asset",
      { siteId: site.id, assetId: spare.asset.id, rev: 0 },
      { as: manager, confirmed: true },
    );
    expect(done.decision.kind).toBe("allow");
    expect(await store.getAsset(spare.asset.id)).toBeUndefined();
  });

  it("publish prompts name media; auto mode carries an article's new photo but waits for a PDF", async () => {
    const auto: ToolContext = {
      ...ctx,
      principal: {
        actor: agent,
        scopes: [...defaultScopes(agent), "site:publish"],
        mode: "auto" as AgentMode,
      },
    };
    // The starter goes live once, as a person.
    const s0 = await store.createSnapshot(site.id, { actor: person, reason: "publish" });
    await store.publish((await store.getSite(site.id)) as Site, s0.id);
    const { asset } = await uploadPhoto({ title: "Bosphorus at dawn" });
    await call("create_entry", {
      siteId: site.id,
      slug: "ferries",
      title: "Ferries at dawn",
      body: "Text.",
      coverImage: { assetId: asset.id },
    });
    const live = await call("publish", { siteId: site.id }, { as: auto });
    expect(live.decision.kind).toBe("allow");
    expect(live.autoCheck).toMatchObject({ code: "low-risk", changes: 1 });
    // A PDF linked from an article is media that waits for a person; the prompt names it.
    const pdf = await result<{ asset: Asset }>(
      call("upload_asset", {
        siteId: site.id,
        filename: "timetable.pdf",
        data: b64(new TextEncoder().encode("%PDF-1.7\n1 0 obj")),
        title: "Ferry timetable",
      }),
    );
    const article = (await store.listContentEntries(site.id)).find(
      (e) => e.slug === "ferries",
    ) as ContentEntry;
    await call("update_entry", {
      siteId: site.id,
      entryId: article.id,
      rev: article.rev,
      body: `[Timetable](asset:${pdf.asset.id})`,
    });
    const waits = await call("publish", { siteId: site.id }, { as: auto });
    expect(waits.decision.kind).toBe("approval-required");
    expect(waits.autoCheck).toMatchObject({ code: "media", lowRisk: false });
    expect(waits.approvalPrompt).toContain(
      '+ document "Ferry timetable" (PDF, 16 B), used by "Ferries at dawn"',
    );
  });

  it("per-key daily limits are an agent-layer refusal", async () => {
    ctx = { ...ctx, media: { ...ctx.media, agentDailyAssets: 1 } };
    await uploadPhoto();
    const second = await failure(
      call("upload_asset", { siteId: site.id, filename: "dot.png", data: b64(PNG_1X1), alt: "x" }),
    );
    expect(second.code).toBe("denied");
    expect(second.message).toMatch(/in the last 24 hours/);
  });
});
