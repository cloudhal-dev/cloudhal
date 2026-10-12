/**
 * RFC-0004 §7: the media route, `imageAttributes`, `asset:` in markdown, and assets in SEO and
 * feeds, over a real store (SQLite + memory blobs) and its snapshot source.
 */
import type { Asset, ContentEntry, Site } from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { makeJpeg, PNG_1X1 } from "@cloudhal/core-ts/media/fixtures";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { rssXml } from "../src/feeds.ts";
import { renderEntryArticle, renderMarkdown } from "../src/markdown.ts";
import { imageAttributes, loadAssetIndex } from "../src/media.ts";
import { type MediaRouteDeps, parseRangeHeader, serveMediaRequest } from "../src/media-route.ts";
import { entryHead } from "../src/seo.ts";
import { LiveSource, SnapshotSource } from "../src/source.ts";

const person = { kind: "human" as const, id: "user_owner000001", name: "Halil" };

describe("media", () => {
  let store: SiteGraphStore;
  let site: Site;
  let photo: Asset;
  let csv: Asset;

  beforeEach(async () => {
    store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
    });
    await store.init();
    site = await seedStarterSite(store, { name: "Media", slug: "media" });
    photo = (
      await store.ingestAsset({
        siteId: site.id,
        bytes: makeJpeg({ width: 3000, height: 2000 }),
        filename: "bosphorus.jpg",
        uploadedBy: person,
        source: { kind: "upload" },
        fields: {
          alt: { en: "Ferries at dawn" },
          caption: { en: "Kadıköy pier" },
          credit: "Photo: Ayşe",
          license: { kind: "spdx", id: "CC-BY-4.0" },
          image: { lqip: "data:image/webp;base64,UklGRg==" },
        },
      })
    ).asset;
    csv = (
      await store.ingestAsset({
        siteId: site.id,
        bytes: new TextEncoder().encode("hour,ferries\n06,12\n"),
        filename: "hourly.csv",
        uploadedBy: person,
        source: { kind: "upload" },
      })
    ).asset;
  });

  async function published(): Promise<SnapshotSource> {
    const snap = await store.createSnapshot(site.id, { actor: person, reason: "publish" });
    await store.publish((await store.getSite(site.id)) as Site, snap.id);
    return SnapshotSource.open(store, snap.id);
  }

  function deps(source: SnapshotSource | LiveSource, mode: MediaRouteDeps["mode"] = "published") {
    return {
      siteId: site.id,
      mode,
      assetByPrefix: async (p: string) => source.assetByPrefix?.(p),
      blobState: (sha: string) => store.blobState(site.id, sha),
      blobs: store.blobs,
    } satisfies MediaRouteDeps;
  }

  const get = (path: string, d: MediaRouteDeps, init: RequestInit = {}) =>
    serveMediaRequest(new Request(`https://site.example${path}`, init), d) as Promise<Response>;

  it("serves published media immutably with checksums, ranges and conditional requests", async () => {
    const source = await published();
    const d = deps(source);
    const path = `/media/${photo.sha256.slice(0, 16)}/bosphorus.jpg`;
    const res = await get(path, d);
    expect(res.status).toBe(200);
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body.byteLength).toBe(photo.bytes);
    expect(Object.fromEntries(res.headers)).toMatchObject({
      "content-type": "image/jpeg",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
      etag: `"${photo.sha256}"`,
      "cache-control": "public, max-age=31536000, immutable",
      "cloudflare-cdn-cache-control": "public, max-age=31536000",
      "cache-tag": `cloudhal-media-${site.id},cloudhal-asset-${photo.id}`,
      "accept-ranges": "bytes",
      "content-length": String(photo.bytes),
    });
    const digest = res.headers.get("repr-digest") as string;
    const expected = btoa(
      String.fromCharCode(
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", body as Uint8Array<ArrayBuffer>)),
      ),
    );
    expect(digest).toBe(`sha-256=:${expected}:`);
    // Range, suffix, unsatisfiable, conditional, HEAD.
    const part = await get(path, d, { headers: { range: "bytes=0-3" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 0-3/${photo.bytes}`);
    expect(part.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
    expect(Array.from(new Uint8Array(await part.arrayBuffer()))).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    const tail = await get(path, d, { headers: { range: "bytes=-2" } });
    expect(Array.from(new Uint8Array(await tail.arrayBuffer()))).toEqual([0xff, 0xd9]);
    const bad = await get(path, d, { headers: { range: `bytes=${photo.bytes}-` } });
    expect(bad.status).toBe(416);
    expect(bad.headers.get("content-range")).toBe(`bytes */${photo.bytes}`);
    const cached = await get(path, d, { headers: { "if-none-match": `"${photo.sha256}"` } });
    expect(cached.status).toBe(304);
    const head = await get(path, d, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await get(path, d, { method: "POST" })).status).toBe(405);
    // The checksum file, in `sha256sum -c` format.
    const sum = await get(`${path}.sha256`, d);
    expect(await sum.text()).toBe(`${photo.sha256}  bosphorus.jpg\n`);
    expect(sum.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    // Data is an attachment in UTF-8.
    const data = await get(`/media/${csv.sha256.slice(0, 16)}/hourly.csv`, d);
    expect(data.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(data.headers.get("content-disposition")).toBe('attachment; filename="hourly.csv"');
    expect(parseRangeHeader("bytes=0-1,5-6")).toBeUndefined();
  });

  it("renamed slugs answer 301; unknown prefixes 404; other /media paths fall through", async () => {
    const renamed = await store.updateAsset({ ...photo, slug: "bosphorus-at-dawn" });
    const source = await published();
    const d = deps(source);
    const prefix = photo.sha256.slice(0, 16);
    const old = await get(`/media/${prefix}/bosphorus.jpg`, d);
    expect(old.status).toBe(301);
    expect(old.headers.get("location")).toBe(`/media/${prefix}/bosphorus-at-dawn.jpg`);
    const wrongExt = await get(`/media/${prefix}/bosphorus-at-dawn.png.sha256`, d);
    expect(wrongExt.headers.get("location")).toBe(`/media/${prefix}/bosphorus-at-dawn.jpg.sha256`);
    expect(renamed.slug).toBe("bosphorus-at-dawn");
    expect((await get("/media/0000000000000000/x.jpg", d)).status).toBe(404);
    expect(
      await serveMediaRequest(new Request("https://site.example/media/press-kit"), d),
    ).toBeUndefined();
    expect(
      await serveMediaRequest(new Request("https://site.example/media/0123456789abcdef/x"), d),
    ).toBeUndefined();
  });

  it("invariant 15: only the published snapshot's media are public; previews are private", async () => {
    const source = await published();
    const later = (
      await store.ingestAsset({
        siteId: site.id,
        bytes: PNG_1X1,
        filename: "draft.png",
        uploadedBy: person,
        source: { kind: "upload" },
        fields: { decorative: true },
      })
    ).asset;
    const path = `/media/${later.sha256.slice(0, 16)}/draft.png`;
    expect((await get(path, deps(source))).status).toBe(404);
    const preview = await get(path, {
      ...deps(new LiveSource(store, site.id), "preview"),
      keepQuery: "cloudhal-preview=tok",
    });
    expect(preview.status).toBe(200);
    expect(preview.headers.get("cache-control")).toBe("private, no-store");
    expect(preview.headers.get("cache-tag")).toBeNull();
  });

  it("taken-down content answers 410, or 451 for legal reasons, from every snapshot", async () => {
    const source = await published();
    const path = `/media/${photo.sha256.slice(0, 16)}/bosphorus.jpg`;
    await store.purgeBlob(site.id, photo.sha256, person, { text: "DMCA", legal: true });
    const res = await get(path, deps(source));
    expect(res.status).toBe(451);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await store.liftPurge(site.id, photo.sha256, person);
    await store.purgeBlob(site.id, photo.sha256, person, { text: "privacy", legal: false });
    expect((await get(path, deps(source))).status).toBe(410);
  });

  it("SVG under a CSP sandbox; PDF inline without one; external files redirect", async () => {
    const svg = (
      await store.ingestAsset({
        siteId: site.id,
        bytes: new TextEncoder().encode(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"/>',
        ),
        filename: "logo.svg",
        uploadedBy: person,
        source: { kind: "upload" },
        fields: { alt: { en: "Logo" } },
      })
    ).asset;
    const pdf = (
      await store.ingestAsset({
        siteId: site.id,
        bytes: new TextEncoder().encode("%PDF-1.7\n1 0 obj"),
        filename: "paper.pdf",
        uploadedBy: person,
        source: { kind: "upload" },
      })
    ).asset;
    const external = (
      await store.createAsset({
        siteId: site.id,
        kind: "data",
        mediaType: "text/csv",
        bytes: 7_300_000_000,
        sha256: "ab".repeat(32),
        slug: "ferry-counts",
        storage: {
          kind: "external",
          url: "https://zenodo.org/records/1/files/counts.csv",
          checksum: "declared",
        },
        status: "active",
        uploadedBy: person,
        source: { kind: "link" },
      })
    ).asset;
    const d = deps(await published());
    const s = await get(`/media/${svg.sha256.slice(0, 16)}/logo.svg`, d);
    expect(s.headers.get("content-security-policy")).toBe(
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    );
    const p = await get(`/media/${pdf.sha256.slice(0, 16)}/paper.pdf`, d);
    expect(p.headers.get("content-disposition")).toBe("inline");
    expect(p.headers.get("content-security-policy")).toBeNull();
    expect(p.headers.get("x-content-type-options")).toBe("nosniff");
    const e = await get(`/media/${external.sha256.slice(0, 16)}/ferry-counts.csv`, d);
    expect(e.status).toBe(302);
    expect(e.headers.get("location")).toBe("https://zenodo.org/records/1/files/counts.csv");
    expect(e.headers.get("cloudhal-checksum")).toBe("declared");
    expect(e.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("imageAttributes: passthrough by default; a fixed ladder through /cdn-cgi/image when opted in", () => {
    const o = { locale: "en", defaultLocale: "en", sizes: "100vw" };
    const plain = imageAttributes(photo, { alt: "" }, { ...o, transform: "none" });
    expect(plain).toEqual({
      src: `/media/${photo.sha256.slice(0, 16)}/bosphorus.jpg`,
      width: 3000,
      height: 2000,
      alt: "Ferries at dawn",
      loading: "lazy",
      decoding: "async",
      style: "background-image:url(data:image/webp;base64,UklGRg==);background-size:cover",
    });
    const t = imageAttributes(
      photo,
      { alt: "Two ferries" },
      { ...o, transform: "cdn-cgi", priority: true },
    );
    expect(t.alt).toBe("Two ferries");
    expect(t.src).toBe(
      `/cdn-cgi/image/width=1280,fit=scale-down,format=auto,quality=80/media/${photo.sha256.slice(0, 16)}/bosphorus.jpg`,
    );
    expect(t.srcset?.split(", ").map((c) => c.split(" ")[1])).toEqual([
      "320w",
      "640w",
      "960w",
      "1280w",
      "1600w",
      "1920w",
      "2560w",
      "3000w",
    ]);
    expect(t).toMatchObject({ sizes: "100vw", loading: "eager", fetchpriority: "high" });
    // Previews and small or animated images are never transformed.
    expect(
      imageAttributes(photo, undefined, { ...o, transform: "cdn-cgi", preview: true }).srcset,
    ).toBeUndefined();
    const animated = { ...photo, image: { width: 800, height: 600, animated: true as const } };
    expect(
      imageAttributes(animated, undefined, { ...o, transform: "cdn-cgi" }).srcset,
    ).toBeUndefined();
    const decorative = { ...photo, decorative: true as const };
    expect(imageAttributes(decorative, undefined, { ...o, transform: "none" }).alt).toBe("");
  });

  it("markdown asset: references render safely; unresolved ones degrade to text", async () => {
    const assets = await loadAssetIndex(new LiveSource(store, site.id));
    const misses: string[] = [];
    const html = renderMarkdown(
      [
        `![](asset:${photo.id})`,
        `![Two "ferries" <b>](asset:${photo.id} "Kadıköy & co")`,
        `[Hourly data](asset:${csv.id})`,
        "[gone](asset:asset_missing00001) ![lost](asset:asset_missing00001)",
        `[sneaky](asset:${photo.id}?x=1) [upper](ASSET:${photo.id})`,
        `\`asset:${photo.id}\``,
      ].join("\n\n"),
      { assets, locale: "en", defaultLocale: "en", onMiss: (id) => misses.push(id) },
    );
    expect(html).toContain(
      `<img src="/media/${photo.sha256.slice(0, 16)}/bosphorus.jpg" alt="Ferries at dawn" width="3000" height="2000" loading="lazy" decoding="async"`,
    );
    expect(html).toContain('alt="Two &quot;ferries&quot; &lt;b&gt;"');
    expect(html).toContain('title="Kadıköy &amp; co"');
    expect(html).toContain(
      `<a href="/media/${csv.sha256.slice(0, 16)}/hourly.csv" type="text/csv" download>Hourly data</a> <small class="ch-asset-meta">CSV · 19 B · <a href="/media/${csv.sha256.slice(0, 16)}/hourly.csv.sha256">SHA-256</a></small>`,
    );
    expect(html).toContain("<p>gone lost</p>");
    expect(html).toContain("<p>sneaky upper</p>");
    expect(html).toContain(`<code>asset:${photo.id}</code>`);
    expect(misses).toEqual(["asset_missing00001", "asset_missing00001"]);
    // Without a context (older renderers, meta descriptions) the scheme is dropped.
    expect(renderMarkdown(`![alt](asset:${photo.id})`)).toBe("<p>alt</p>\n");
  });

  it("cover images, Open Graph, JSON-LD and RSS use the asset", async () => {
    const entry = (await store.listContentEntries(site.id))[0] as ContentEntry;
    const saved = await store.updateContentEntry({
      ...entry,
      coverImage: { assetId: photo.id, alt: "" } as NonNullable<ContentEntry["coverImage"]>,
    });
    const assets = await loadAssetIndex(await published());
    const media = { assets, locale: "en", defaultLocale: "en", transform: "none" as const };
    const article = renderEntryArticle(saved, "en", media);
    expect(article).toContain('<figure class="ch-cover"><img src="/media/');
    expect(article).toContain('fetchpriority="high"');
    expect(article).toContain("<figcaption>Kadıköy pier · Photo: Ayşe</figcaption>");
    const head = entryHead(site, saved, "https://site.example", undefined, media);
    const url = `https://site.example/media/${photo.sha256.slice(0, 16)}/bosphorus.jpg`;
    expect(head.openGraph).toEqual(
      expect.arrayContaining([
        ["og:image", url],
        ["og:image:width", "3000"],
        ["og:image:height", "2000"],
        ["og:image:type", "image/jpeg"],
        ["og:image:alt", "Ferries at dawn"],
      ]),
    );
    expect((head.jsonLd[0] as { image: unknown }).image).toEqual([
      {
        "@type": "ImageObject",
        contentUrl: url,
        width: 3000,
        height: 2000,
        caption: "Kadıköy pier",
        creditText: "Photo: Ayşe",
        license: "https://spdx.org/licenses/CC-BY-4.0.html",
        encodingFormat: "image/jpeg",
      },
    ]);
    const rss = rssXml({
      site,
      origin: "https://site.example",
      entries: [{ ...saved, status: "published" }],
      assets,
    });
    expect(rss).toContain(
      `<media:content url="${url}" medium="image" type="image/jpeg" fileSize="${photo.bytes}" width="3000" height="2000"/>`,
    );
  });

  it("a snapshot finds assets by id and URL prefix", async () => {
    const source = await published();
    expect((await source.asset(photo.id))?.sha256).toBe(photo.sha256);
    expect((await source.assetByPrefix(photo.sha256.slice(0, 16)))?.id).toBe(photo.id);
    expect(await source.assetByPrefix("zzzz")).toBeUndefined();
    expect((await source.assets()).map((a) => a.id).sort()).toEqual([csv.id, photo.id].sort());
  });
});
