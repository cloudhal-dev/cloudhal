/**
 * Shared API suite for RFC-0004 §5.5 and §6.1 (the media library over REST) — runs against any
 * SiteGraphStore backend (better-sqlite3 and Miniflare D1 in `test/assets-api.test.ts`): ticketed
 * uploads through the core-ts pipeline, listing, details, edits, status changes, deletes and
 * takedowns. Role narrowing lives in `testing-roles.ts`.
 */
import { AuditLog } from "@cloudhal/agent-runtime";
import type { Asset, ContentEntry } from "@cloudhal/core-contracts";
import { type SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { inspectImage } from "@cloudhal/core-ts/media";
import { makeJpeg, makePng, text } from "@cloudhal/core-ts/media/fixtures";
import { type SqlDriver, sha256OfBytes } from "@cloudhal/storage";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import type { AssetDetail, AssetListItem, UploadTicketResult } from "./routes/assets.ts";

export interface AssetsApiBackend {
  create(): Promise<{ store: SiteGraphStore; sql: SqlDriver }>;
  dispose?(): Promise<void>;
}

const people = {
  "1": { kind: "human" as const, id: "user_apitest00001", name: "Tester" },
  "2": { kind: "human" as const, id: "user_apitest00002", name: "Other" },
  agent: { kind: "agent" as const, id: "agent_apitest0001", name: "Bot" },
};
type Who = keyof typeof people;
type Json = Record<string, unknown>;

/** A phone photo: GPS and an orientation in its Exif. */
const photo = () => makeJpeg({ width: 1200, height: 800, orientation: 6, gps: true });
const CSV = text("station,hour,riders\nKadıköy,06,412\nBeşiktaş,06,388\n");

export function describeAssetsApi(label: string, backend: AssetsApiBackend): void {
  describe(`API assets: ${label}`, () => {
    let store: SiteGraphStore;
    let audit: AuditLog;
    let siteId: string;
    let app: ReturnType<typeof createApi>;
    let nowMs: number;

    const base = () => `/api/sites/${siteId}/assets`;
    const request = async (
      path: string,
      init: { method?: string; body?: unknown; who?: Who | null; headers?: Json } = {},
    ) => {
      const who = init.who === undefined ? "1" : init.who;
      const res = await app.request(path, {
        method: init.method ?? "GET",
        headers: {
          "content-type": "application/json",
          ...(who ? { "x-test-user": who } : {}),
          ...(init.headers as Record<string, string>),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
      const raw = await res.text();
      let body: Json = {};
      try {
        body = raw ? (JSON.parse(raw) as Json) : {};
      } catch {
        body = { raw };
      }
      return { status: res.status, body, res };
    };
    const ticket = (files: unknown[], who: Who = "1") =>
      request(`${base()}/uploads`, { method: "POST", body: { files }, who });
    const putBytes = (
      url: string,
      bytes: Uint8Array,
      o: { who?: Who; length?: number; type?: string } = {},
    ) =>
      Promise.resolve(
        app.request(url, {
          method: "PUT",
          headers: {
            "x-test-user": o.who ?? "1",
            "content-type": o.type ?? "application/octet-stream",
            "content-length": String(o.length ?? bytes.byteLength),
          },
          body: bytes as Uint8Array<ArrayBuffer>,
        }),
      ).then(async (res) => ({ status: res.status, body: (await res.json()) as Json }));
    const opened = (r: { body: Json }, i = 0) =>
      (r.body.files as UploadTicketResult[])[i] as Extract<
        UploadTicketResult,
        { uploadId: string }
      >;
    /** Ticket + PUT for one file. */
    const upload = async (bytes: Uint8Array, file: Json, who: Who = "1") => {
      const t = await ticket([{ bytes: bytes.byteLength, ...file }], who);
      expect(t.status, JSON.stringify(t.body)).toBe(201);
      const f = opened(t);
      expect(f.uploadId, JSON.stringify(t.body)).toMatch(/^upl_/);
      return putBytes(f.url, bytes, { who, type: f.headers["content-type"] as string });
    };
    const uploadPhoto = async (extra: Json = {}, who: Who = "1") => {
      const r = await upload(
        photo(),
        {
          filename: "Bosphorus at dawn.jpg",
          mediaType: "image/jpeg",
          alt: "Ferries at dawn",
          ...extra,
        },
        who,
      );
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body as unknown as AssetListItem & { existing: boolean; warnings: string[] };
    };

    beforeEach(async () => {
      const b = await backend.create();
      store = b.store;
      audit = new AuditLog(b.sql);
      nowMs = Date.parse("2026-10-08T10:00:00.000Z");
      siteId = (await seedStarterSite(store, { name: "Media Site", slug: "media-site" })).id;
      app = createApi({
        store,
        audit,
        now: () => new Date(nowMs),
        resolveActor: async (c) => {
          const who = c.req.header("x-test-user") as Who | undefined;
          return who ? people[who] : undefined;
        },
      });
    });

    afterAll(async () => {
      await backend.dispose?.();
    });

    it("is for people: anonymous 401; agent keys use MCP (403), so they cannot upload SVG here either", async () => {
      expect((await request(base(), { who: null })).status).toBe(401);
      expect((await request(base(), { who: "agent" })).status).toBe(403);
      const svg = await ticket(
        [{ filename: "logo.svg", mediaType: "image/svg+xml", bytes: 120, alt: "Logo" }],
        "agent",
      );
      expect(svg.status).toBe(403);
      expect(svg.body.message).toMatch(/MCP/);
    });

    it("uploads an image through a ticket: metadata stripped by default, alt kept, audited, no snapshot", async () => {
      const snapshots = (await store.listSnapshots(siteId)).length;
      const original = photo();
      expect(inspectImage(original, "image/jpeg").metadata.gps).toBe(true);
      const r = await uploadPhoto();
      expect(r.existing).toBe(false);
      const asset = r.asset;
      expect(asset).toMatchObject({
        kind: "image",
        mediaType: "image/jpeg",
        slug: "bosphorus-at-dawn",
        alt: { en: "Ferries at dawn" },
        image: { width: 1200, height: 800 },
        uploadedBy: people["1"],
        source: { kind: "upload", filename: "Bosphorus at dawn.jpg" },
        status: "active",
      });
      // The stored bytes are the stripped ones: GPS gone, orientation kept, both hashes recorded.
      expect(asset.originalSha256).toBe(await sha256OfBytes(original));
      expect(asset.sha256).not.toBe(asset.originalSha256);
      expect(r.url).toBe(`/media/${asset.sha256.slice(0, 16)}/bosphorus-at-dawn.jpg`);
      const content = await app.request(`${base()}/${asset.id}/content`, {
        headers: { "x-test-user": "1" },
      });
      expect(content.status).toBe(200);
      expect(content.headers.get("cache-control")).toBe("private, no-store");
      expect(content.headers.get("x-content-type-options")).toBe("nosniff");
      expect(content.headers.get("content-type")).toBe("image/jpeg");
      const stored = new Uint8Array(await content.arrayBuffer());
      expect(await sha256OfBytes(stored)).toBe(asset.sha256);
      const meta = inspectImage(stored, "image/jpeg").metadata;
      expect(meta.gps).toBe(false);
      expect(meta.orientation).toBe(6);
      // One audit row, no snapshot (REST writes by people take none, §4.3).
      const rows = await audit.list({ siteId, tool: "asset.upload" });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.input).toMatchObject({
        assetId: asset.id,
        effect: { asset: { id: asset.id, sha256: asset.sha256, mediaType: "image/jpeg" } },
      });
      expect((await store.listSnapshots(siteId)).length).toBe(snapshots);

      // People may keep the metadata (photographers' credits): the GPS warning comes back.
      const kept = await upload(makeJpeg({ width: 10, height: 10, gps: true }), {
        filename: "kept.jpg",
        mediaType: "image/jpeg",
        alt: "Kept",
        keepMetadata: true,
      });
      expect(kept.status).toBe(201);
      expect(kept.body.warnings).toContain("gps");
      expect((kept.body.asset as Asset).originalSha256).toBeUndefined();
    });

    it("dedupes before transfer: a known hash (stored or as uploaded) answers with the existing asset", async () => {
      const first = await uploadPhoto();
      const again = await ticket([
        {
          filename: "copy.jpg",
          mediaType: "image/jpeg",
          bytes: photo().byteLength,
          sha256: first.asset.originalSha256,
          alt: "Copy",
        },
        {
          filename: "stripped.jpg",
          mediaType: "image/jpeg",
          bytes: 10,
          sha256: first.asset.sha256,
          alt: "Copy",
        },
      ]);
      expect(again.status).toBe(201);
      const files = again.body.files as UploadTicketResult[];
      for (const f of files)
        expect((f as { existing?: AssetListItem }).existing?.asset.id).toBe(first.asset.id);
      // Without a declared hash the bytes go up, and the store still answers `existing`.
      const dup = await upload(photo(), {
        filename: "dup.jpg",
        mediaType: "image/jpeg",
        alt: "Dup",
      });
      expect(dup.status).toBe(200);
      expect(dup.body.existing).toBe(true);
      expect((dup.body.asset as Asset).id).toBe(first.asset.id);
    });

    it("tickets: at most 20 files per request and 50 open per person; single use; 15 minutes; signed; personal", async () => {
      const png = makePng({ width: 4, height: 4 });
      const file = {
        filename: "dot.png",
        mediaType: "image/png",
        bytes: png.byteLength,
        alt: "A dot",
      };
      const tooMany = await ticket(Array.from({ length: 21 }, () => file));
      expect(tooMany.status).toBe(400);
      expect(tooMany.body.error).toBe("too_many_files");

      const batch = await ticket(Array.from({ length: 20 }, () => file));
      expect(batch.status).toBe(201);
      expect((batch.body.files as unknown[]).length).toBe(20);
      expect(opened(batch).expiresAt).toBe("2026-10-08T10:15:00.000Z");
      expect(opened(batch).url).toMatch(
        /\/assets\/uploads\/upl_[A-Za-z0-9]+\?sig=[A-Za-z0-9_-]{43}$/,
      );
      expect((await ticket(Array.from({ length: 20 }, () => file))).status).toBe(201);
      const over = await ticket(Array.from({ length: 11 }, () => file));
      expect(over.status).toBe(429);
      expect(over.body.error).toBe("too_many_uploads");
      expect(over.body.details).toMatchObject({ open: 40, limit: 50 });
      // Someone else has an allowance of their own.
      expect((await ticket([file], "2")).status).toBe(201);

      const f = opened(batch);
      // Someone else cannot use my link, and a tampered signature is useless.
      expect((await putBytes(f.url, png, { who: "2" })).status).toBe(403);
      const forged = await putBytes(f.url.replace(/sig=.*/, `sig=${"A".repeat(43)}`), png);
      expect(forged.status).toBe(403);
      expect(forged.body.error).toBe("bad_signature");
      // Single use: the replay is refused.
      expect((await putBytes(f.url, png)).status).toBe(201);
      const replay = await putBytes(f.url, png);
      expect(replay.status).toBe(410);
      expect(replay.body.error).toBe("upload_used");
      // A wrong Content-Length is refused before any byte is read, so the link still works…
      const g = opened(batch, 1);
      expect((await putBytes(g.url, png, { length: png.byteLength + 1 })).status).toBe(400);
      // (the same bytes as before: the existing asset answers)
      expect((await putBytes(g.url, png)).status).toBe(200);
      // …but once bytes were read the ticket is spent, whatever the outcome (here: a GIF).
      const h = opened(batch, 3);
      const gif = Uint8Array.from([...text("GIF89a"), ...new Uint8Array(png.byteLength - 6)]);
      expect((await putBytes(h.url, gif)).status).not.toBe(201);
      expect((await putBytes(h.url, png)).status).toBe(410);
      // Expired after 15 minutes; expired tickets stop counting as open.
      nowMs += 15 * 60_000 + 1000;
      const late = await putBytes(opened(batch, 2).url, png);
      expect(late.status).toBe(410);
      expect(late.body.error).toBe("upload_expired");
      expect((await ticket(Array.from({ length: 20 }, () => file))).status).toBe(201);
    });

    it("size and type mismatches are refused while streaming and after sniffing", async () => {
      const png = makePng({ width: 8, height: 8 });
      // Content-Length must equal the declared size…
      const t1 = await ticket([
        { filename: "a.png", mediaType: "image/png", bytes: png.byteLength, alt: "A" },
      ]);
      const short = await putBytes(opened(t1).url, png, { length: png.byteLength - 1 });
      expect(short.status).toBe(400);
      expect(short.body.error).toBe("size_mismatch");
      // …and the body may not carry more than declared (counted while streaming).
      const t2 = await ticket([{ filename: "b.png", mediaType: "image/png", bytes: 20, alt: "B" }]);
      const long = await putBytes(opened(t2).url, png, { length: 20 });
      expect(long.status).toBe(400);
      expect(long.body.error).toBe("size_mismatch");
      // A PNG declared as a JPEG: the sniffed type decides, nothing is relabelled.
      const lie = await upload(png, { filename: "photo.jpg", mediaType: "image/jpeg", alt: "Lie" });
      expect(lie.status).toBe(415);
      expect(lie.body.error).toBe("type_mismatch");
      expect(lie.body.message).toMatch(/PNG, not a JPEG/);
      // A file name that disagrees with its declared type is refused at ticket time (per file).
      const names = await ticket([
        { filename: "photo.png", mediaType: "image/jpeg", bytes: 10, alt: "x" },
        { filename: "ok.png", mediaType: "image/png", bytes: 10, alt: "x" },
      ]);
      const [bad, good] = names.body.files as UploadTicketResult[];
      expect((bad as { error?: { code: string } }).error?.code).toBe("type_mismatch");
      expect((good as { uploadId?: string }).uploadId).toMatch(/^upl_/);
      expect((await store.listAssets(siteId)).assets).toHaveLength(0);
    });

    it("refuses at ticket time: unsupported types, files over the cap, images without alt, streams without a checksum", async () => {
      const r = await ticket([
        { filename: "index.html", mediaType: "text/html", bytes: 100 },
        { filename: "IMG_0001.HEIC", mediaType: "image/heic", bytes: 100 },
        { filename: "huge.png", mediaType: "image/png", bytes: 21 * 1024 * 1024, alt: "Huge" },
        { filename: "no-alt.png", mediaType: "image/png", bytes: 100 },
        { filename: "decorative.png", mediaType: "image/png", bytes: 100, decorative: true },
        { filename: "data.csv", mediaType: "text/csv", bytes: 100 },
        {
          filename: "paper.pdf",
          mediaType: "application/pdf",
          bytes: 51 * 1024 * 1024,
          sha256: "a".repeat(64),
        },
      ]);
      expect(r.status).toBe(201);
      const codes = (r.body.files as UploadTicketResult[]).map((f) =>
        "error" in f ? f.error.code : "ok",
      );
      expect(codes).toEqual([
        "unsupported_type",
        "unsupported_type",
        "too_large",
        "alt_required",
        "ok",
        "checksum_required",
        "too_large",
      ]);
      const heic = (r.body.files as UploadTicketResult[])[1] as { error: { message: string } };
      expect(heic.error.message).toMatch(/convert to JPEG/);
    });

    it("SVG: people only, validated and refused when it can run script", async () => {
      const evil = text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10" onclick="x()"/></svg>',
      );
      const refused = await upload(evil, {
        filename: "evil.svg",
        mediaType: "image/svg+xml",
        alt: "Evil",
      });
      expect(refused.status).toBe(422);
      expect(refused.body.error).toBe("svg_unsafe");
      const clean = text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12"><rect width="24" height="12" fill="#f60"/></svg>',
      );
      const ok = await upload(clean, {
        filename: "logo.svg",
        mediaType: "image/svg+xml",
        alt: "Logo",
      });
      expect(ok.status, JSON.stringify(ok.body)).toBe(201);
      expect((ok.body.asset as Asset).image).toEqual({ width: 24, height: 12 });
      const content = await app.request(`${base()}/${(ok.body.asset as Asset).id}/content`, {
        headers: { "x-test-user": "1" },
      });
      expect(content.headers.get("content-security-policy")).toMatch(/sandbox/);
    });

    it("streams data files against their declared SHA-256; a different checksum stores nothing", async () => {
      const sha = await sha256OfBytes(CSV);
      const r = await upload(CSV, {
        filename: "ridership.csv",
        mediaType: "text/csv",
        sha256: sha,
        title: "Ferry ridership",
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.asset).toMatchObject({
        kind: "data",
        mediaType: "text/csv",
        sha256: sha,
        bytes: CSV.byteLength,
        title: { en: "Ferry ridership" },
      });
      const other = text("a,b\n1,2\n");
      const wrong = await upload(other, {
        filename: "other.csv",
        mediaType: "text/csv",
        sha256: "b".repeat(64),
      });
      expect(wrong.status).toBe(400);
      expect(wrong.body.error).toBe("checksum_mismatch");
      expect((await store.listAssets(siteId)).assets).toHaveLength(1);
    });

    it("lists with filters and a cursor; details name the uses; edits are CAS on rev; alt stays required", async () => {
      const a = await uploadPhoto();
      const b = await upload(makePng({ width: 30, height: 20 }), {
        filename: "chart.png",
        mediaType: "image/png",
        alt: "Chart",
      });
      const csv = await upload(CSV, {
        filename: "rides.csv",
        mediaType: "text/csv",
        sha256: await sha256OfBytes(CSV),
      });
      expect([b.status, csv.status]).toEqual([201, 201]);
      const entry = (await store.listContentEntries(siteId))[0] as ContentEntry;
      await store.updateContentEntry({
        ...entry,
        coverImage: { assetId: a.asset.id, alt: "" } as never,
      });

      const all = await request(base());
      expect(all.status).toBe(200);
      const items = all.body.assets as AssetListItem[];
      expect(items).toHaveLength(3);
      expect(items.find((i) => i.asset.id === a.asset.id)?.usage).toBe(1);
      const images = await request(`${base()}?kind=image&unused=1`);
      expect((images.body.assets as AssetListItem[]).map((i) => i.asset.slug)).toEqual(["chart"]);
      const search = await request(`${base()}?q=ferries`);
      expect((search.body.assets as AssetListItem[]).map((i) => i.asset.id)).toEqual([a.asset.id]);
      const page1 = await request(`${base()}?limit=2`);
      expect((page1.body.assets as unknown[]).length).toBe(2);
      const page2 = await request(`${base()}?limit=2&cursor=${page1.body.nextCursor as string}`);
      expect((page2.body.assets as unknown[]).length).toBe(1);
      expect(page2.body.nextCursor).toBeUndefined();
      expect((await request(`${base()}?kind=nope`)).status).toBe(400);

      const detail = await request(`${base()}/${a.asset.id}`);
      expect(detail.status).toBe(200);
      const d = detail.body as unknown as AssetDetail;
      expect(d.uses).toEqual([
        expect.objectContaining({
          nodeId: entry.id,
          nodeKind: "contentEntry",
          field: "coverImage",
          title: entry.title,
          path: `/${entry.collection}/${entry.slug}`,
        }),
      ]);
      expect(d.checksumUrl).toBe(`${d.url}.sha256`);
      expect(d.blob?.state).toBe("stored");
      expect(d.editable).toBe(true);
      expect((await request(`${base()}/asset_doesnotexist1`)).status).toBe(404);

      const put = (body: Json) => request(`${base()}/${a.asset.id}`, { method: "PUT", body });
      const saved = await put({
        rev: 0,
        title: { en: "Bosphorus at dawn", tr: "Şafakta Boğaz" },
        alt: { en: "Ferries crossing at dawn", tr: "Şafakta geçen vapurlar" },
        caption: { en: "Kadıköy pier" },
        credit: "Photo: Ayşe Yılmaz",
        license: { kind: "spdx", id: "CC-BY-4.0" },
        slug: "bosphorus-dawn",
      });
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      expect(saved.body).toMatchObject({
        rev: 1,
        title: { en: "Bosphorus at dawn", tr: "Şafakta Boğaz" },
        credit: "Photo: Ayşe Yılmaz",
        license: { kind: "spdx", id: "CC-BY-4.0" },
        slug: "bosphorus-dawn",
        sha256: a.asset.sha256,
      });
      const stale = await put({ rev: 0, credit: "stale" });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe("conflict");
      const noAlt = await put({ rev: 1, alt: null });
      expect(noAlt.status).toBe(422);
      expect(noAlt.body.error).toBe("alt_required");
      const decorative = await put({ rev: 1, alt: null, decorative: true });
      expect(decorative.status).toBe(200);
      expect(decorative.body.alt).toBeUndefined();
      expect(decorative.body.decorative).toBe(true);
      expect((await put({ rev: 2, slug: "Not A Slug" })).status).toBe(400);
      expect((await audit.list({ siteId, tool: "asset.update" })).length).toBe(2);
    });

    it("retire and restore; delete is refused while the file is used, then removes the node", async () => {
      const a = await uploadPhoto();
      const entry = (await store.listContentEntries(siteId))[0] as ContentEntry;
      const used = await store.updateContentEntry({
        ...entry,
        coverImage: { assetId: a.asset.id, alt: "" } as never,
      });
      const retired = await request(`${base()}/${a.asset.id}/retire`, {
        method: "POST",
        body: { rev: 0 },
      });
      expect(retired.status).toBe(200);
      expect(retired.body.status).toBe("retired");
      expect((await request(`${base()}?status=active`)).body.assets).toEqual([]);
      const restored = await request(`${base()}/${a.asset.id}/restore`, {
        method: "POST",
        body: { rev: 1 },
      });
      expect(restored.body.status).toBe("active");

      const inUse = await request(`${base()}/${a.asset.id}?rev=2`, { method: "DELETE" });
      expect(inUse.status).toBe(409);
      expect(inUse.body.error).toBe("in_use");
      expect((inUse.body.details as { uses: { nodeId: string; title?: string }[] }).uses).toEqual([
        expect.objectContaining({ nodeId: entry.id, title: entry.title }),
      ]);
      const { coverImage: _c, ...plain } = used;
      await store.updateContentEntry(plain as ContentEntry);
      expect((await request(`${base()}/${a.asset.id}?rev=1`, { method: "DELETE" })).status).toBe(
        409,
      );
      expect((await request(`${base()}/${a.asset.id}?rev=2`, { method: "DELETE" })).status).toBe(
        204,
      );
      expect(await store.getAsset(a.asset.id)).toBeUndefined();
      const tools = (await audit.list({ siteId })).map((r) => r.tool);
      expect(tools).toEqual(
        expect.arrayContaining(["asset.retire", "asset.restore", "asset.delete"]),
      );
    });

    it("takedown: the bytes go, the asset retires, the content answers 410, re-upload waits for a lift", async () => {
      const a = await uploadPhoto();
      const noReason = await request(`${base()}/${a.asset.id}/purge`, { method: "POST", body: {} });
      expect(noReason.status).toBe(400);
      const purged = await request(`${base()}/${a.asset.id}/purge`, {
        method: "POST",
        body: { reason: "Copyright notice from the photographer", legal: true },
      });
      expect(purged.status).toBe(200);
      expect(purged.body.status).toBe(451);
      expect((purged.body.asset as Asset).status).toBe("retired");
      const rows = await audit.list({ siteId, tool: "asset.purge" });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.reason).toBe("Copyright notice from the photographer");
      expect(rows[0]?.input).toMatchObject({ legal: true, sha256: a.asset.sha256 });
      const content = await request(`${base()}/${a.asset.id}/content`);
      expect(content.status).toBe(410);
      const detail = (await request(`${base()}/${a.asset.id}`)).body as unknown as AssetDetail;
      expect(detail.blob).toMatchObject({
        state: "purged",
        purge: { reason: "Copyright notice from the photographer", legal: true },
      });
      // The same bytes are refused (ticket dedupe and upload alike) until the Owner lifts it.
      const again = await ticket([
        {
          filename: "again.jpg",
          mediaType: "image/jpeg",
          bytes: 10,
          sha256: a.asset.originalSha256,
          alt: "Again",
        },
      ]);
      expect(
        ((again.body.files as UploadTicketResult[])[0] as { error: { code: string } }).error.code,
      ).toBe("purged");
      const reupload = await upload(photo(), {
        filename: "again.jpg",
        mediaType: "image/jpeg",
        alt: "Again",
      });
      expect(reupload.status).toBe(410);
      expect(reupload.body.error).toBe("purged");
      const lift = await request(`/api/sites/${siteId}/media/${a.asset.sha256}/lift-purge`, {
        method: "POST",
        body: {},
      });
      expect(lift.body).toMatchObject({ lifted: true });
      expect((await audit.list({ siteId, tool: "asset.lift-purge" })).length).toBe(1);
      const back = await upload(photo(), {
        filename: "again.jpg",
        mediaType: "image/jpeg",
        alt: "Again",
      });
      expect(back.status).toBe(200);
      expect((back.body.asset as Asset).id).toBe(a.asset.id);
    });
  });
}
