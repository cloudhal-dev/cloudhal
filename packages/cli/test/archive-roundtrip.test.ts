/**
 * RFC-0039 §1 and invariants 3, 5 and 7: what the writer writes, the reader reads back byte for
 * byte, the same content gives the same bytes, and content the reader would refuse is never
 * written.
 */
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { CONTRACT_SCHEMA_VERSION } from "@cloudhal/core-contracts";
import { SITE_BUNDLE_FORMAT } from "@cloudhal/core-ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type ArchiveContent,
  ArchiveError,
  archiveStream,
  readArchive,
  SITE_ARCHIVE_FORMAT,
  splitNdjson,
  writeArchiveFile,
} from "../src/archive/index.ts";
import { encodeManifest } from "../src/archive/manifest.ts";
import {
  collect,
  expectArchiveError,
  MEDIA,
  memoryMedia,
  NODE_ROWS,
  readAll,
  SITE,
  same,
  sampleContent,
  sha256,
  utf8,
  writeBytes,
} from "./archive-fixture.ts";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "archive-roundtrip-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** The fixed order of RFC-0039 §1 for the sample content. */
const ORDER = [
  "project.json",
  ...sampleContent().nodes.map((_, i) => `nodes/${String(i + 1).padStart(4, "0")}.ndjson`),
  "snapshots/0001.ndjson",
  "blobs/0001.ndjson",
  ...MEDIA.map((m) => `media/${sha256(m)}`).sort(),
  "ledger.ndjson",
];

describe("round trip", () => {
  it("reads back the manifest first and every file in the fixed order", async () => {
    const content = sampleContent();
    const { manifest, bytes } = archiveStream(content);
    const archive = await collect(bytes);
    expect(ORDER.filter((p) => p.startsWith("nodes/")).length).toBeGreaterThan(1);
    for (const chunk of [1, 333, 64 * 1024]) {
      const back = await readAll(archive, { chunk });
      expect(back.manifest).toEqual(manifest);
      expect(back.files.map((f) => f.path)).toEqual(ORDER);
      const byPath = new Map(back.files.map((f) => [f.path, f.bytes]));
      expect(same(byPath.get("project.json"), content.project as Uint8Array)).toBe(true);
      expect(same(byPath.get("ledger.ndjson"), content.ledger as Uint8Array)).toBe(true);
      const nodes = Buffer.concat(
        ORDER.filter((p) => p.startsWith("nodes/")).map((p) => byPath.get(p) as Buffer),
      );
      expect(same(nodes, Buffer.concat(content.nodes))).toBe(true);
      for (const m of MEDIA) expect(same(byPath.get(`media/${sha256(m)}`), m)).toBe(true);
    }
  });

  it("writes the RFC manifest with counts it computes", async () => {
    const { manifest } = archiveStream(sampleContent());
    expect(Object.keys(manifest)).toEqual([
      "format",
      "contracts",
      "bundle",
      "siteId",
      "siteName",
      "createdBy",
      "createdAt",
      "counts",
      "files",
    ]);
    expect(manifest).toMatchObject({
      format: SITE_ARCHIVE_FORMAT,
      contracts: { schemaVersion: CONTRACT_SCHEMA_VERSION },
      bundle: SITE_BUNDLE_FORMAT,
      ...SITE,
      counts: {
        nodes: NODE_ROWS.length,
        snapshots: 2,
        blobs: 1,
        media: MEDIA.length,
        mediaBytes: MEDIA.reduce((n, m) => n + m.length, 0),
      },
    });
    const text = Buffer.from(encodeManifest(manifest)).toString("utf8");
    expect(text.startsWith('{\n  "format": "cloudhal.site-archive@1",\n')).toBe(true);
    expect(text.endsWith("}\n")).toBe(true);
  });

  it("writes mediaOmitted archives without media, and minimal ones", async () => {
    const omitted = sampleContent({ media: undefined, mediaOmitted: true });
    const back = await readAll(await writeBytes(omitted));
    expect(back.manifest.mediaOmitted).toBe(true);
    expect(back.manifest.counts).toMatchObject({ media: 0, mediaBytes: 0 });
    expect(back.files.some((f) => f.path.startsWith("media/"))).toBe(false);
    const minimal: ArchiveContent = {
      ...SITE,
      nodes: splitNdjson([{ id: "n" }]),
      snapshots: [],
      blobs: [],
    };
    const small = await readAll(await writeBytes(minimal));
    expect(small.files.map((f) => f.path)).toEqual(["nodes/0001.ndjson"]);
    expect("mediaOmitted" in small.manifest).toBe(false);
  });
});

describe("deterministic bytes (invariant 7)", () => {
  it("gives identical bytes for the same content, whatever the media order or chunking", async () => {
    const first = await writeBytes(sampleContent());
    expect(same(await writeBytes(sampleContent()), first)).toBe(true);
    const reordered = sampleContent({ media: [...MEDIA].reverse().map((m) => memoryMedia(m, 1)) });
    expect(same(await writeBytes(reordered), first)).toBe(true);
    // Rows are written in the caller's order: sorting them is the caller's job.
    const nodes = splitNdjson([...NODE_ROWS].reverse(), { partBytes: 512 });
    expect(same(await writeBytes(sampleContent({ nodes })), first)).toBe(false);
  });

  it("writes a fixed gzip header and a platform-independent tar stream", async () => {
    const archive = await writeBytes(sampleContent());
    expect(Buffer.from(archive.subarray(0, 10)).toString("hex")).toBe("1f8b08000000000000ff");
    const tar = gunzipSync(archive);
    expect(tar.length % 10240).toBe(0);
    // A golden hash of the uncompressed tar (gzip bytes differ between zlib builds, the tar does
    // not). Update it on purpose, only when the format changes.
    expect(sha256(tar)).toBe("81d8e9868fa915e24229bc3c4fc1a1acdfbfc41fd862fc335aa583b85e16a716");
  });
});

describe("writer refusals", () => {
  const bad: [string, Partial<ArchiveContent>, string][] = [
    [
      "a media hash that is not hex",
      { media: [{ ...memoryMedia(MEDIA[0] as Uint8Array), sha256: "A".repeat(64) }] },
      "invalid_input",
    ],
    [
      "duplicate media",
      { media: [memoryMedia(MEDIA[0] as Uint8Array), memoryMedia(MEDIA[0] as Uint8Array)] },
      "invalid_input",
    ],
    ["media with mediaOmitted", { mediaOmitted: true }, "invalid_input"],
    ["an empty part", { nodes: [new Uint8Array(0)] }, "invalid_input"],
    ["a part without a final newline", { nodes: [utf8('{"id":"n"}')] }, "invalid_input"],
    ["an empty project", { project: new Uint8Array(0) }, "invalid_input"],
    ["10000 parts", { blobs: Array.from({ length: 10_000 }, () => utf8("{}\n")) }, "too_large"],
    ["a createdAt that is not RFC 3339", { createdAt: "yesterday" }, "invalid_input"],
    ["a createdBy that is not a version", { createdBy: "1.0 \u001b[2J" }, "invalid_input"],
    ["a siteId that is not an id", { siteId: "../site" }, "invalid_input"],
  ];

  it.each(bad)("refuses %s before writing anything", async (_, overrides, code) => {
    const content = sampleContent(overrides);
    expect(() => archiveStream(content)).toThrow(ArchiveError);
    const target = path.join(dir, "refused.cloudhal");
    await expectArchiveError(writeArchiveFile(target, content), code as "invalid_input");
    expect(await readdir(dir)).toEqual([]);
  });

  it("refuses what a reader with the same limits would refuse", async () => {
    const content = sampleContent();
    await expectArchiveError(
      Promise.resolve().then(() => archiveStream(content, { limits: { manifestBytes: 500 } })),
      "too_large",
    );
    await expectArchiveError(
      Promise.resolve().then(() => archiveStream(content, { limits: { partBytes: 100 } })),
      "too_large",
    );
    await expectArchiveError(
      Promise.resolve().then(() => archiveStream(content, { limits: { mediaBytes: 1000 } })),
      "too_large",
    );
    await expectArchiveError(
      Promise.resolve().then(() => archiveStream(content, { limits: { entries: 5 } })),
      "too_large",
    );
    await expectArchiveError(
      Promise.resolve().then(() => archiveStream(content, { limits: { totalBytes: 50_000 } })),
      "too_large",
    );
    await expectArchiveError(
      Promise.resolve().then(() => archiveStream(content, { limits: { entries: 0 } })),
      "invalid_input",
    );
  });
});

describe("media verified while writing", () => {
  const target = () => path.join(dir, "site.cloudhal");
  const withMedia = (open: () => AsyncIterable<Uint8Array>) => {
    const m = MEDIA[0] as Uint8Array;
    return sampleContent({ media: [{ sha256: sha256(m), bytes: m.length, open }] });
  };

  it("aborts a longer body without reading it all", async () => {
    let pulled = 0;
    let closed = false;
    async function* endless() {
      try {
        for (;;) {
          pulled++;
          yield new Uint8Array(1024);
        }
      } finally {
        closed = true;
      }
    }
    await expectArchiveError(writeArchiveFile(target(), withMedia(endless)), "damaged", /longer/);
    expect(pulled).toBeLessThan(10);
    expect(closed).toBe(true);
    expect(await readdir(dir)).toEqual([]);
  });

  it("refuses a short or wrong body, leaving an existing file as it was", async () => {
    await writeFile(target(), "old");
    const m = MEDIA[0] as Uint8Array;
    const wrong = Buffer.from(m);
    wrong[0] = (wrong[0] as number) ^ 1;
    for (const [body, text] of [
      [m.subarray(1), /has 2999 of 3000 bytes/],
      [wrong, /SHA-256/],
    ] as const) {
      const error = await expectArchiveError(
        writeArchiveFile(
          target(),
          withMedia(() => yieldOnce(body)),
        ),
        "damaged",
        text,
      );
      expect(error.path).toBe(`media/${sha256(m)}`);
      expect(await readdir(dir)).toEqual(["site.cloudhal"]);
      expect(await readFile(target(), "utf8")).toBe("old");
    }
    await rm(target());
  });

  it("ends a failed stream before the gzip trailer, so its bytes never read as an archive", async () => {
    /** What the stream emitted before a media source one byte short failed it. */
    const partial = async (media: Uint8Array) => {
      const short = {
        sha256: sha256(media),
        bytes: media.length,
        open: () => yieldOnce(media.subarray(1)),
      };
      const { bytes } = archiveStream(sampleContent({ media: [short] }));
      const chunks: Uint8Array[] = [];
      await expectArchiveError(
        (async () => {
          for await (const chunk of bytes) chunks.push(chunk);
        })(),
        "damaged",
      );
      return Buffer.concat(chunks);
    };
    // zlib had emitted nothing yet: an empty file.
    const empty = await partial(MEDIA[0] as Uint8Array);
    expect(empty.length).toBe(0);
    await expectArchiveError(readAll(empty), "not_archive", /it is empty/);
    // zlib had emitted part of the stream: no trailer, so it is truncated.
    const cut = await partial(noise(256 * 1024));
    expect(cut.length).toBeGreaterThan(0);
    await expectArchiveError(readAll(cut), "truncated");
  });

  it("stops on an abort, removing its temporary file and leaving an existing file as it was", async () => {
    await writeFile(target(), "old");
    const m = MEDIA[0] as Uint8Array;
    const controller = new AbortController();
    async function* interrupted() {
      yield m.subarray(0, 100);
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 20));
      yield m.subarray(100);
    }
    const write = writeArchiveFile(target(), withMedia(interrupted), { signal: controller.signal });
    await expect(write).rejects.toMatchObject({ name: "AbortError" });
    expect(await readdir(dir)).toEqual(["site.cloudhal"]);
    expect(await readFile(target(), "utf8")).toBe("old");
    await rm(target());
    // Aborted before it starts: no file is opened.
    const early = writeArchiveFile(target(), sampleContent(), { signal: AbortSignal.abort() });
    await expect(early).rejects.toMatchObject({ name: "AbortError" });
    expect(await readdir(dir)).toEqual([]);
  });

  it("writes a file that reads back from disk", async () => {
    const manifest = await writeArchiveFile(target(), sampleContent());
    let read: unknown;
    for await (const item of readArchive(createReadStream(target())))
      if (item.type === "manifest") read = item.manifest;
    expect(read).toEqual(manifest);
    expect(await readdir(dir)).toEqual(["site.cloudhal"]);
    await rm(target());
  });
});

/** Bytes that do not compress (a fixed LCG), so gzip emits output as it goes. */
function noise(length: number): Uint8Array {
  const out = new Uint8Array(length);
  let x = 1;
  for (let i = 0; i < length; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    out[i] = x >>> 24;
  }
  return out;
}

async function* yieldOnce(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}
