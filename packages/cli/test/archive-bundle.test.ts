/**
 * RFC-0039 rollout step 2, the pure half: a `SiteBundle` to the container's content and back
 * (`archive-bundle.ts`, `archive-reassemble.ts`) on hand-built bundles, `exportSite`'s media rule,
 * `--latest-only`, the archive's date and file name, the local media reader, and every refusal of
 * the reassembly. The store-backed command is in export-cli.test.ts.
 */
import type { BundleMedia, BundlePurge, NodeRow, SiteBundle, SnapshotRow } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { describe, expect, it } from "vitest";
import {
  type ArchiveContent,
  type ArchiveMediaSource,
  archiveStream,
  encodeNdjson,
  readArchive,
  splitNdjson,
} from "../src/archive/index.ts";
import {
  bundleMedia,
  bundleToArchive,
  contentCreatedAt,
  latestOnly,
} from "../src/commands/archive-bundle.ts";
import { bundleFromArchive } from "../src/commands/archive-reassemble.ts";
import { archiveFileName, localMediaReader } from "../src/commands/export.ts";
import { chunked, collect, pattern, sha256, utf8 } from "./archive-fixture.ts";

const SITE_ID = "site_demo0001";
const BYTES = { a: pattern(300, 1), b: pattern(500, 2), extra: pattern(100, 7) };
const SHA = {
  a: sha256(BYTES.a),
  b: sha256(BYTES.b),
  extra: sha256(BYTES.extra),
  gone: sha256(utf8("taken down")),
  ext: sha256(utf8("external")),
};
const BY_SHA = new Map([
  [SHA.a, BYTES.a],
  [SHA.b, BYTES.b],
  [SHA.extra, BYTES.extra],
]);

const at = (minute: number) => `2026-10-20T12:${String(minute).padStart(2, "0")}:00.000Z`;

function asset(
  id: string,
  sha: string,
  o: { bytes?: number; type?: string; external?: boolean } = {},
) {
  return JSON.stringify({
    id,
    kind: "image",
    sha256: sha,
    bytes: o.bytes ?? BY_SHA.get(sha)?.length ?? 10,
    mediaType: o.type ?? "image/png",
    storage: o.external ? { kind: "external", url: "https://example.com/x.png" } : { kind: "blob" },
  });
}

function node(id: string, kind: string, body: string, minute = 1): NodeRow {
  const stamp = at(minute);
  return {
    id,
    site_id: SITE_ID,
    kind,
    key: id,
    rev: 1,
    hash: sha256(utf8(body)),
    body,
    created_at: stamp,
    updated_at: stamp,
  };
}

function snapshot(id: string, refs: { kind: string; text: string }[], minute: number): SnapshotRow {
  const nodes = refs.map((r) => ({ kind: r.kind, hash: sha256(utf8(r.text)) }));
  return {
    id,
    site_id: SITE_ID,
    parent_id: null,
    site_rev: 1,
    body: JSON.stringify({ id, nodes }),
    created_at: at(minute),
  };
}

function blobsOf(...texts: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const text of texts
    .map((t) => [sha256(utf8(t)), t] as const)
    .sort(([x], [y]) => (x < y ? -1 : 1)))
    out[text[0]] = text[1];
  return out;
}

const SITE_BODY = (published?: string) =>
  JSON.stringify({
    id: SITE_ID,
    name: "Demo site",
    slug: "demo",
    ...(published ? { publishedSnapshotId: published } : {}),
  });

/**
 * A bundle as `exportSite` returns it: blob asset A current and in both snapshots, B only in the
 * second, an external asset, a taken-down blob asset, a project and a ledger row.
 */
function sampleBundle(o: { aBytes?: number } = {}): SiteBundle {
  const aBody = asset("asset_aaaaaa01", SHA.a, o.aBytes === undefined ? {} : { bytes: o.aBytes });
  const bBody = asset("asset_bbbbbb01", SHA.b, { type: "image/webp" });
  const site = SITE_BODY("snap_00000001");
  const nodes = [
    node("asset_aaaaaa01", "asset", aBody),
    node("asset_eeeeee01", "asset", asset("asset_eeeeee01", SHA.ext, { external: true })),
    node("asset_gggggg01", "asset", asset("asset_gggggg01", SHA.gone)),
    node(SITE_ID, "site", site, 3),
  ];
  const snapshots = [
    snapshot(
      "snap_00000001",
      [
        { kind: "asset", text: aBody },
        { kind: "site", text: site },
      ],
      4,
    ),
    snapshot(
      "snap_00000002",
      [
        { kind: "asset", text: aBody },
        { kind: "asset", text: bBody },
      ],
      5,
    ),
  ];
  const blobs = blobsOf(aBody, bBody, site);
  const purged = [
    { sha256: SHA.gone, reason: "notice", legal: false, by: "human:user_x", at: at(6) },
  ];
  const media = bundleMedia({ nodes, snapshots, blobs }, new Set([SHA.gone]));
  return {
    format: "cloudhal.site-bundle@1",
    siteId: SITE_ID,
    project: { id: "prj_demo0001", rev: 2, body: "{}", created_at: at(0), updated_at: at(2) },
    nodes,
    snapshots,
    blobs,
    ...(media ? { media } : {}),
    purged,
  };
}

const openMedia = (m: BundleMedia) => chunked(BY_SHA.get(m.sha256) as Uint8Array, 64);

async function roundTrip(
  content: ArchiveContent,
  onMedia?: (sha: string) => void,
): Promise<SiteBundle> {
  const bytes = await collect(archiveStream(content).bytes);
  const result = await bundleFromArchive(readArchive(chunked(bytes, 1000)), {
    onMedia: async (item) => {
      onMedia?.(item.sha256);
      await collect(item.body);
    },
  });
  return result.bundle;
}

describe("bundle → archive → bundle", () => {
  it("comes back exactly, over several parts, with media streamed", async () => {
    const bundle = sampleBundle();
    expect(bundle.media?.map((m) => m.sha256)).toEqual([SHA.a, SHA.b].sort());
    const content = bundleToArchive(bundle, { createdBy: "0.6.1", partBytes: 200, openMedia });
    expect(content.nodes.length).toBeGreaterThan(1);
    expect(content.createdAt).toBe(at(6));
    expect(content.siteName).toBe("Demo site");
    const seen: string[] = [];
    expect(await roundTrip(content, (sha) => seen.push(sha))).toStrictEqual(bundle);
    expect(seen).toEqual([SHA.a, SHA.b].sort());
  });

  it("leaves out project, media and purged when the bundle has none", async () => {
    const site = SITE_BODY();
    const bundle: SiteBundle = {
      format: "cloudhal.site-bundle@1",
      siteId: SITE_ID,
      nodes: [
        node("asset_eeeeee01", "asset", asset("asset_eeeeee01", SHA.ext, { external: true })),
        node(SITE_ID, "site", site),
      ],
      snapshots: [snapshot("snap_00000001", [{ kind: "site", text: site }], 2)],
      blobs: blobsOf(site),
    };
    const content = bundleToArchive(bundle, { createdBy: "0.6.1", openMedia });
    const { manifest } = archiveStream(content);
    expect(manifest.files.map((f) => f.path)).toEqual([
      "nodes/0001.ndjson",
      "snapshots/0001.ndjson",
      "blobs/0001.ndjson",
    ]);
    const back = await roundTrip(content);
    expect(back).toStrictEqual(bundle);
    expect(Object.keys(back)).toEqual(["format", "siteId", "nodes", "snapshots", "blobs"]);
  });

  it("--no-media: no media files, and the media rebuilt from the rows", async () => {
    const bundle = sampleBundle();
    const content = bundleToArchive(bundle, { createdBy: "0.6.1", mediaOmitted: true, openMedia });
    expect(content.media).toBeUndefined();
    expect(archiveStream(content).manifest.mediaOmitted).toBe(true);
    expect(await roundTrip(content)).toStrictEqual(bundle);
  });

  it("refuses to write a snapshot whose node body the bundle lacks", () => {
    const bundle = sampleBundle();
    const { [Object.keys(bundle.blobs)[0] as string]: _dropped, ...blobs } = bundle.blobs;
    expect(() => bundleToArchive({ ...bundle, blobs }, { createdBy: "0.6.1", openMedia })).toThrow(
      /not in the bundle/,
    );
  });
});

describe("bundleMedia (exportSite's rule)", () => {
  it("lets the last body seen win, skips external and taken-down content, sorts by hash", () => {
    const current = asset("asset_aaaaaa01", SHA.a, { type: "image/png" });
    const later = asset("asset_aaaaaa01", SHA.a, { type: "image/webp" });
    const rows = {
      nodes: [
        node("asset_aaaaaa01", "asset", current),
        node("asset_bbbbbb01", "asset", asset("asset_bbbbbb01", SHA.b)),
        node("asset_eeeeee01", "asset", asset("asset_eeeeee01", SHA.ext, { external: true })),
        node("asset_gggggg01", "asset", asset("asset_gggggg01", SHA.gone)),
      ],
      snapshots: [snapshot("snap_00000001", [{ kind: "asset", text: later }], 2)],
      blobs: blobsOf(later),
    };
    expect(bundleMedia(rows, new Set([SHA.gone]))).toEqual(
      [
        { sha256: SHA.a, bytes: 300, mediaType: "image/webp" },
        { sha256: SHA.b, bytes: 500, mediaType: "image/png" },
      ].sort((x, y) => (x.sha256 < y.sha256 ? -1 : 1)),
    );
    expect(bundleMedia({ nodes: [], snapshots: [], blobs: {} }, new Set())).toBeUndefined();
  });
});

describe("latestOnly", () => {
  function threeSnapshots(published: string) {
    const site = SITE_BODY(published);
    const a = asset("asset_aaaaaa01", SHA.a);
    const b = asset("asset_bbbbbb01", SHA.b);
    const s2 = { ...snapshot("snap_00000002", [{ kind: "asset", text: b }], 5) };
    const s3 = {
      ...snapshot("snap_00000003", [{ kind: "site", text: site }], 6),
      parent_id: s2.id,
    };
    const bundle: SiteBundle = {
      format: "cloudhal.site-bundle@1",
      siteId: SITE_ID,
      nodes: [node(SITE_ID, "site", site)],
      snapshots: [snapshot("snap_00000001", [{ kind: "asset", text: a }], 4), s2, s3],
      blobs: blobsOf(a, b, site),
      media: [],
      purged: [{ sha256: SHA.gone, reason: "", legal: true, by: "", at: "" }],
    };
    return { bundle, a, b, site };
  }

  it("keeps the published and the latest snapshot, their blobs and media; purged stays", () => {
    const { bundle, a, site } = threeSnapshots("snap_00000001");
    const kept = latestOnly(bundle, "snap_00000003");
    expect(kept.snapshots.map((s) => s.id)).toEqual(["snap_00000001", "snap_00000003"]);
    expect(kept.snapshots[1]?.parent_id).toBe("snap_00000002");
    expect(kept.blobs).toEqual(blobsOf(a, site));
    expect(kept.media).toEqual([{ sha256: SHA.a, bytes: 300, mediaType: "image/png" }]);
    expect(kept.purged).toEqual(bundle.purged);
    expect(kept.nodes).toBe(bundle.nodes);
  });

  it("refuses a site whose field operation is unfinished (its before snapshot would go)", () => {
    const { bundle } = threeSnapshots("snap_00000003");
    const marker = { id: "snap_00000002", fromKey: "speaker" };
    const field = { key: "presenter", type: "text", localized: false, migration: marker };
    const site = JSON.stringify({
      ...JSON.parse(SITE_BODY("snap_00000003")),
      collections: { posts: { fields: [] }, events: { fields: [field] } },
    });
    expect(() => latestOnly({ ...bundle, nodes: [node(SITE_ID, "site", site)] })).toThrow(
      "field operation snap_00000002 on events has not finished, and --latest-only would drop the snapshot it needs",
    );
  });

  it("keeps one when published is latest, and falls back to the last row without an id", () => {
    const { bundle, site } = threeSnapshots("snap_00000003");
    const one = latestOnly(bundle);
    expect(one.snapshots.map((s) => s.id)).toEqual(["snap_00000003"]);
    expect(one.blobs).toEqual(blobsOf(site));
    expect(one).not.toHaveProperty("media");
  });
});

describe("contentCreatedAt", () => {
  it("is the newest row timestamp, the ledger's included, never the clock", () => {
    const bundle = sampleBundle();
    expect(contentCreatedAt(bundle)).toBe(at(6));
    const purge = bundle.purged?.[0] as BundlePurge;
    expect(contentCreatedAt({ ...bundle, purged: [{ ...purge, at: "" }] })).toBe(at(5));
    const offset = { ...purge, at: "2026-10-21T01:30:00+02:00" };
    expect(contentCreatedAt({ ...bundle, purged: [offset] })).toBe("2026-10-20T23:30:00.000Z");
  });

  it("refuses a bundle without a single timestamp", () => {
    const bare = {
      format: "cloudhal.site-bundle@1" as const,
      siteId: SITE_ID,
      nodes: [{ ...node(SITE_ID, "site", SITE_BODY()), created_at: "", updated_at: "" }],
      snapshots: [],
      blobs: {},
    };
    expect(() => contentCreatedAt(bare)).toThrow(/no row with a timestamp/);
  });
});

describe("archiveFileName", () => {
  it("is <slug>-<UTC date>.cloudhal, falling back to the name's slug, then the id", () => {
    const site = { id: SITE_ID, slug: "english", name: "English" };
    expect(archiveFileName(site, "2026-10-25T09:00:00.000Z")).toBe("english-20261025.cloudhal");
    expect(archiveFileName(site, "2026-10-25T01:30:00+02:00")).toBe("english-20261024.cloudhal");
    expect(archiveFileName({ ...site, slug: "Not A Slug", name: "Türkçe Blog" }, at(0))).toBe(
      "turkce-blog-20261020.cloudhal",
    );
    expect(archiveFileName({ ...site, slug: "", name: "日本" }, at(0))).toBe(
      `${SITE_ID}-20261020.cloudhal`,
    );
  });
});

describe("localMediaReader", () => {
  const key = (sha: string) => `media/${SITE_ID}/${sha}`;
  const m = { sha256: SHA.a, bytes: BYTES.a.length, mediaType: "image/png" };

  it("streams through getStream, falls back to get, and names a missing file", async () => {
    const store = new MemoryBlobStore();
    await store.put(key(SHA.a), BYTES.a);
    expect(Buffer.compare(await collect(localMediaReader(store, SITE_ID)(m)), BYTES.a)).toBe(0);
    const plain = {
      name: "plain",
      get: (k: string) => store.get(k),
      head: (k: string) => store.head(k),
      put: (k: string, d: Uint8Array) => store.put(k, d),
      delete: (k: string) => store.delete(k),
      list: (p?: string) => store.list(p),
    };
    expect(Buffer.compare(await collect(localMediaReader(plain, SITE_ID)(m)), BYTES.a)).toBe(0);
    const absent = { ...m, sha256: SHA.b };
    await expect(collect(localMediaReader(store, SITE_ID)(absent))).rejects.toThrow(
      /local media [0-9a-f]{64} is missing/,
    );
    await expect(collect(localMediaReader(plain, SITE_ID)(absent))).rejects.toThrow(/is missing/);
  });
});

/** Raw rows of the sample bundle, for crafted archives the writer does not judge. */
function rawContent(edit: {
  nodes?: (rows: Record<string, unknown>[]) => unknown[];
  blobs?: (rows: { hash: string; body: string }[]) => unknown[];
  ledger?: unknown[];
  media?: (sources: ArchiveMediaSource[]) => ArchiveMediaSource[];
  bundle?: SiteBundle;
}): ArchiveContent {
  const bundle = edit.bundle ?? sampleBundle();
  const content = bundleToArchive(bundle, { createdBy: "0.6.1", openMedia });
  const nodes = bundle.nodes.map((n) => ({ ...n }) as Record<string, unknown>);
  const blobs = Object.entries(bundle.blobs).map(([hash, body]) => ({ hash, body }));
  return {
    ...content,
    nodes: splitNdjson(edit.nodes ? edit.nodes(nodes) : nodes),
    blobs: splitNdjson(edit.blobs ? edit.blobs(blobs) : blobs),
    ...(edit.ledger ? { ledger: encodeNdjson(edit.ledger) } : {}),
    media: edit.media ? edit.media([...(content.media ?? [])]) : content.media,
  };
}

async function refusal(content: ArchiveContent, seen: string[] = []): Promise<string> {
  const error = await roundTrip(content, (sha) => seen.push(sha)).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(Error);
  return (error as Error).message;
}

describe("bundleFromArchive refuses", () => {
  it("rows that are not exactly the bundle's", async () => {
    expect(await refusal(rawContent({ nodes: (r) => [...r, r[0]] }))).toMatch(
      /^nodes\/0001\.ndjson line 5: a node id appears twice$/,
    );
    expect(
      await refusal(rawContent({ nodes: (r) => [{ ...r[0], extra: 1 }, ...r.slice(1)] })),
    ).toMatch(/^nodes\/0001\.ndjson line 1: needs exactly the fields id, site_id, kind/);
    expect(
      await refusal(rawContent({ nodes: (r) => [{ ...r[0], rev: "1" }, ...r.slice(1)] })),
    ).toBe("nodes/0001.ndjson line 1: rev must be a non-negative integer");
    expect(
      await refusal(
        rawContent({ nodes: (r) => [...r.slice(0, 3), { ...r[3], site_id: "site_other001" }] }),
      ),
    ).toBe("nodes/0001.ndjson line 4: site_id is not the archive's site");
    expect(await refusal(rawContent({ nodes: (r) => r.slice(0, 3) }))).toBe(
      `nodes: the archive has no site node for ${SITE_ID}`,
    );
  });

  it("lines that are not JSON or not UTF-8", async () => {
    expect(await refusal({ ...rawContent({}), nodes: [utf8('{"id":\n')] })).toBe(
      "nodes/0001.ndjson line 1: not JSON",
    );
    expect(
      await refusal({ ...rawContent({}), nodes: [Uint8Array.from([0x7b, 0xff, 0x7d, 0x0a])] }),
    ).toBe("nodes/0001.ndjson: not UTF-8");
  });

  it("a snapshot ref whose node body is not in the archive", async () => {
    const message = await refusal(rawContent({ blobs: (rows) => rows.slice(1) }));
    expect(message).toMatch(/^snapshots\/0001\.ndjson line \d: references a node body/);
  });

  it("media no asset needs, before onMedia sees them", async () => {
    const seen: string[] = [];
    const extra = {
      sha256: SHA.extra,
      bytes: BYTES.extra.length,
      open: () => chunked(BYTES.extra, 64),
    };
    const message = await refusal(rawContent({ media: (m) => [...m, extra] }), seen);
    expect(message).toBe(`media/${SHA.extra}: no asset of the archive needs this file`);
    expect(seen).not.toContain(SHA.extra);
  });

  it("media the ledger took down (invariant 5), missing media and a size the asset disagrees with", async () => {
    const ledger = [
      { sha256: SHA.a, reason: "notice", legal: true, by: "human:user_x", at: at(7) },
    ];
    expect(await refusal(rawContent({ ledger }))).toBe(
      `media/${SHA.a}: the archive's ledger has taken this content down`,
    );
    expect(await refusal(rawContent({ media: (m) => m.filter((s) => s.sha256 !== SHA.b) }))).toBe(
      `media/${SHA.b}: an asset needs it, and the archive does not hold it`,
    );
    const bundle = sampleBundle({ aBytes: 301 });
    const sources = (m: ArchiveMediaSource[]) =>
      m.map((s) => (s.sha256 === SHA.a ? { ...s, bytes: BYTES.a.length } : s));
    expect(await refusal(rawContent({ bundle, media: sources }))).toBe(
      `media/${SHA.a}: 300 bytes, its asset says 301`,
    );
  });

  it("asset bodies the media rule cannot trust, without quoting them", async () => {
    const evil = "\u001b[31mEVIL";
    const blobAsset = (extra: Record<string, unknown>) =>
      JSON.stringify({ ...JSON.parse(asset("asset_aaaaaa01", SHA.a)), ...extra });
    const withBody = (body: string) =>
      rawContent({
        nodes: (rows) => rows.map((n) => (n.id === "asset_aaaaaa01" ? { ...n, body } : n)),
      });
    const line = "nodes/0001.ndjson line 1: the asset body";
    for (const [body, message] of [
      [evil, `${line} is not JSON`],
      ["null", `${line} is not a JSON object`],
      // The media ledger reads `storage.kind` of every asset body.
      [blobAsset({ storage: undefined }), `${line} needs storage, an object with a kind`],
      [blobAsset({ storage: { kind: 7 } }), `${line} needs storage, an object with a kind`],
      [blobAsset({ sha256: evil }), `${line} needs a sha256 of 64 lowercase hex digits`],
      [blobAsset({ bytes: evil }), `${line} needs bytes, a non-negative integer`],
      [blobAsset({ bytes: -1 }), `${line} needs bytes, a non-negative integer`],
      [blobAsset({ mediaType: 7 }), `${line} needs a mediaType string`],
    ] as const) {
      const got = await refusal(withBody(body));
      expect(got).toBe(message);
      expect(got).not.toContain("\u001b");
    }
    // The body a snapshot's asset ref points at.
    const aHash = sha256(utf8(asset("asset_aaaaaa01", SHA.a)));
    const got = await refusal(
      rawContent({
        blobs: (rows) => rows.map((b) => (b.hash === aHash ? { ...b, body: evil } : b)),
      }),
    );
    expect(got).toBe("snapshots/0001.ndjson line 1: an asset body it references is not JSON");
    // An external asset's hash is not the media rule's business.
    const external = asset("asset_eeeeee01", SHA.ext, { external: true });
    const odd = JSON.stringify({ ...JSON.parse(external), sha256: evil });
    const bundle = sampleBundle();
    const nodes = bundle.nodes.map((n) => (n.id === "asset_eeeeee01" ? { ...n, body: odd } : n));
    expect(
      await roundTrip(bundleToArchive({ ...bundle, nodes }, { createdBy: "0.6.1", openMedia })),
    ).toStrictEqual({
      ...bundle,
      nodes,
    });
  });

  it("and never echoes untrusted ids", async () => {
    const evil = "page_\u001b[31mred\u001b[0m";
    const message = await refusal(
      rawContent({ nodes: (r) => [{ ...r[0], id: evil }, { ...r[0], id: evil }, ...r.slice(1)] }),
    );
    expect(message).toBe("nodes/0001.ndjson line 2: a node id appears twice");
    expect(message).not.toContain("\u001b");
  });
});
