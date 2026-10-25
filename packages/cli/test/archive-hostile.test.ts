/**
 * RFC-0039 invariant 3 and Security: an archive is untrusted input. Damaged, edited, reordered or
 * oversized archives, paths outside the layout, links and devices, and broken or padded gzip are
 * refused, and nothing unverified is handed over as verified.
 */
import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type ArchiveErrorCode, type ArchiveItem, readArchive } from "../src/archive/index.ts";
import { encodeManifest } from "../src/archive/manifest.ts";
import { tarLength } from "../src/archive/tar.ts";
import {
  archiveOf,
  baseFiles,
  chunked,
  collect,
  expectArchiveError,
  flip,
  listedAt,
  MEDIA,
  pattern,
  type RawEntry,
  rawTar,
  readAll,
  retar,
  sampleContent,
  sha256,
  USTAR,
  writeBytes,
} from "./archive-fixture.ts";

const valid = await writeBytes(sampleContent());

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "archive-hostile-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** The offset of the body of `path` in a tar stream. */
function bodyOffset(tar: Buffer, path: string): number {
  for (let at = 0; at < tar.length; at += 512)
    if (
      Buffer.from(tar.subarray(at, at + 100))
        .toString("latin1")
        .split("\0")[0] === path
    )
      return at + 512;
  throw new Error(`no ${path}`);
}

/** Items read until the first error, which is returned with them. */
async function readUntilError(archive: Uint8Array, drainMedia = true) {
  const seen: ArchiveItem[] = [];
  try {
    for await (const item of readArchive(chunked(archive, 4096))) {
      seen.push(item);
      if (item.type === "media" && drainMedia) await collect(item.body);
    }
  } catch (error) {
    return { seen, error };
  }
  return { seen, error: undefined };
}

describe("damaged and edited files", () => {
  it("refuses a part with a flipped byte and never hands it over", async () => {
    const damaged = retar(valid, (tar) => {
      flip(tar, bodyOffset(tar, "nodes/0002.ndjson") + 10);
      return tar;
    });
    const { seen, error } = await readUntilError(damaged);
    await expectArchiveError(Promise.reject(error), "damaged", /^nodes\/0002\.ndjson: .*SHA-256/);
    expect(seen.map((i) => (i.type === "manifest" ? "manifest.json" : i.path))).toEqual([
      "manifest.json",
      "project.json",
      "nodes/0001.ndjson",
    ]);
  });

  it("refuses a media file with a flipped byte, read or not", async () => {
    const { manifest } = await readAll(valid);
    const media = manifest.files.find((f) => f.path.startsWith("media/") && f.bytes > 0);
    const path = media?.path as string;
    const damaged = retar(valid, (tar) => {
      flip(tar, bodyOffset(tar, path) + 5);
      return tar;
    });
    // Read: the body's last next() throws.
    let bodyError: unknown;
    for await (const item of readArchive(chunked(damaged, 1000))) {
      if (item.type !== "media" || item.path !== path) continue;
      bodyError = await collect(item.body).then(
        () => undefined,
        (e: unknown) => e,
      );
      break;
    }
    await expectArchiveError(Promise.reject(bodyError), "damaged", path);
    // Not read: the reader drains it and throws before the next item.
    const { seen, error } = await readUntilError(damaged, false);
    await expectArchiveError(Promise.reject(error), "damaged", path);
    expect(seen.at(-1)).toMatchObject({ type: "media", path });
  });

  it("refuses a listed hash other than the media name, a size or a row count that disagrees", async () => {
    const files = baseFiles();
    const edited = (edit: (m: Record<string, unknown>) => void) =>
      readAll(archiveOf(files, { manifest: edit }));
    await expectArchiveError(
      edited((m) => {
        listedAt(m, 4).sha256 = "0".repeat(64);
      }),
      "invalid_manifest",
      /SHA-256 other than its name/,
    );
    await expectArchiveError(
      edited((m) => {
        listedAt(m, 1).bytes = 25;
      }),
      "mismatch",
      /^nodes\/0001\.ndjson: 24 bytes in the archive, 25 in manifest\.json/,
    );
    await expectArchiveError(
      edited((m) => {
        (m.counts as { nodes: number }).nodes = 2;
      }),
      "mismatch",
      /nodes: the parts hold 3 rows, manifest\.json counts 2/,
    );
  });
});

const HEX = "ab".repeat(32);
const BAD_PATHS = [
  "../x",
  "/etc/passwd",
  "nodes/../manifest.json",
  "nodes\\0001.ndjson",
  "./manifest.json",
  "nodes/0000.ndjson",
  "nodes/1.ndjson",
  "nodes/00001.ndjson",
  "nodes/0001.json",
  `media/${HEX.toUpperCase()}`,
  `media/${HEX.slice(1)}`,
  `media/${HEX}.png`,
  `media/${HEX}/`,
  "Manifest.json",
  "project.json/",
  "x.txt",
  "ledger.ndjson.gz",
  "",
];

describe("paths outside the layout", () => {
  it.each(BAD_PATHS)("refuses %j as an entry and in the manifest", async (bad) => {
    const files = baseFiles();
    await expectArchiveError(
      readAll(archiveOf([...files, { path: bad, body: "x" }], { listed: files })),
      "unsafe_entry",
    );
    await expectArchiveError(
      readAll(
        archiveOf(files, {
          manifest: (m) => {
            (m.files as unknown[]).push({ path: bad, sha256: HEX, bytes: 1 });
          },
        }),
      ),
      "invalid_manifest",
    );
  });

  it("refuses symlinks, hard links and directories inside a valid archive", async () => {
    const files = baseFiles();
    for (const flag of ["2", "1", "5"]) {
      const link: RawEntry = {
        path: "nodes/0003.ndjson",
        body: "",
        patch: (h) => {
          h[USTAR.typeflag] = flag.charCodeAt(0);
          if (flag !== "5") h.set(Buffer.from("/etc/passwd"), USTAR.linkname);
        },
      };
      await expectArchiveError(
        readAll(archiveOf([...files.slice(0, 3), link, ...files.slice(3)], { listed: files })),
        "unsafe_entry",
      );
    }
  });
});

describe("entries against the manifest", () => {
  const files = baseFiles();
  const [project, n1, n2, s1, media] = files as [RawEntry, RawEntry, RawEntry, RawEntry, RawEntry];
  const other = Buffer.from("other media");
  const second: RawEntry = { path: `media/${sha256(other)}`, body: other };
  const [low, high] = [media, second].sort((a, b) => (a.path < b.path ? -1 : 1)) as [
    RawEntry,
    RawEntry,
  ];
  const cases: [string, RawEntry[], RawEntry[], RegExp][] = [
    [
      "an unlisted extra entry",
      [...files, { path: "blobs/0001.ndjson", body: "{}\n" }],
      files,
      /not listed/,
    ],
    ["a duplicate entry", [project, n1, n1, n2, s1, media], files, /twice or out of order/],
    ["snapshots before nodes", [project, s1, n1, n2, media], files, /twice or out of order/],
    [
      "unsorted media",
      [project, n1, n2, s1, high, low],
      [project, n1, n2, s1, low, high],
      /twice or out of order/,
    ],
    [
      "a listed but missing file",
      files.slice(0, 4),
      files,
      /listed in manifest\.json but not in the archive/,
    ],
    [
      "a second manifest",
      [...files, { path: "manifest.json", body: "{}" }],
      files,
      /appears twice/,
    ],
  ];
  it.each(cases)("refuses %s", async (_, entries, listed, text) => {
    await expectArchiveError(readAll(archiveOf(entries, { listed })), "mismatch", text);
  });
});

describe("caps", () => {
  it("refuses an oversized manifest before reading it", async () => {
    // A declared size of 1 GiB and no body: the cap answers before the truncation could.
    const tar = rawTar([{ path: "manifest.json", body: "{}", size: 1 << 30 }], { end: false });
    await expectArchiveError(readAll(gzipSync(tar)), "too_large", /manifest\.json is above/);
    await expectArchiveError(readAll(valid, { limits: { manifestBytes: 100 } }), "too_large");
  });

  it("refuses parts, media, totals and entry counts above the caps at manifest time", async () => {
    await expectArchiveError(readAll(valid, { limits: { partBytes: 100 } }), "too_large", /cap/);
    await expectArchiveError(
      readAll(valid, { limits: { mediaBytes: 1000 } }),
      "too_large",
      /media\//,
    );
    await expectArchiveError(
      readAll(valid, { limits: { totalBytes: 50_000 } }),
      "too_large",
      /decompressed/,
    );
    await expectArchiveError(readAll(valid, { limits: { entries: 5 } }), "too_large", /entries/);
  });

  it("counts decompressed bytes while streaming", async () => {
    const { manifest } = await readAll(valid);
    const exact = tarLength([
      encodeManifest(manifest).length,
      ...manifest.files.map((f) => f.bytes),
    ]);
    expect((await readAll(valid, { limits: { totalBytes: exact } })).files).toHaveLength(
      manifest.files.length,
    );
    // 512 more zeros after the end: within the padding the reader allows, beyond the cap.
    const padded = retar(valid, (tar) => Buffer.concat([tar, new Uint8Array(512)]));
    expect((await readAll(padded, { limits: { totalBytes: exact + 512 } })).files).toHaveLength(
      manifest.files.length,
    );
    await expectArchiveError(
      readAll(padded, { limits: { totalBytes: exact + 511 } }),
      "too_large",
      /decompressed/,
    );
  });
});

describe("gzip", () => {
  it("refuses a truncated stream, even after the last item", async () => {
    for (const cut of [5, Math.floor(valid.length / 2), valid.length - 4]) {
      await expectArchiveError(readAll(valid.subarray(0, cut)), "truncated");
    }
  });

  it("refuses corrupt data, a wrong CRC, non-gzip input and garbage after the trailer", async () => {
    const crc = Buffer.from(valid);
    flip(crc, crc.length - 8);
    await expectArchiveError(readAll(crc), "damaged", /gzip/);
    const mid = Buffer.from(valid);
    flip(mid, Math.floor(mid.length / 2), 0xff);
    await expectArchiveError(readAll(mid), "damaged");
    await expectArchiveError(readAll(Buffer.from("hello")), "not_archive", /not gzip/);
    await expectArchiveError(readAll(Buffer.concat([valid, Buffer.from("garbage")])), "damaged");
  });

  it("tells damaged gzip from input that is not gzip by its first bytes, at any size", async () => {
    // Read in one chunk, an archive under 16 KiB decompressed fails in zlib before any output.
    const small = archiveOf(baseFiles());
    const crc = Buffer.from(small);
    flip(crc, crc.length - 8);
    const mid = Buffer.from(small);
    flip(mid, Math.floor(mid.length / 2), 0xff);
    const cases: [Uint8Array, ArchiveErrorCode, number[], RegExp?][] = [
      [crc, "damaged", [crc.length, 64], /gzip data is corrupt/],
      // In 64-byte chunks the damaged manifest is parsed first: invalid_manifest.
      [mid, "damaged", [mid.length]],
      [Buffer.concat([small, Buffer.from("garbage")]), "damaged", [small.length + 7, 64]],
      [small.subarray(0, small.length - 4), "truncated", [small.length, 64]],
      [Buffer.from("hello"), "not_archive", [5, 1], /not gzip/],
      [Buffer.from([0x1f]), "not_archive", [1], /not gzip/],
      [new Uint8Array(0), "not_archive", [1], /it is empty/],
    ];
    for (const [bytes, code, chunks, text] of cases)
      for (const chunk of chunks) await expectArchiveError(readAll(bytes, { chunk }), code, text);
  });

  it("refuses data after the gzip stream that starts with a zero byte, however it is chunked", async () => {
    const tails = [
      Buffer.from([0]),
      Buffer.from("\0junk"),
      Buffer.alloc(64),
      Buffer.concat([Buffer.alloc(64), Buffer.from("junk")]),
      Buffer.concat([Buffer.from([0]), Buffer.alloc(1_200_000, "A")]),
    ];
    for (const tail of tails) {
      const padded = Buffer.concat([valid, tail]);
      for (const chunk of [padded.length, 4096, 64])
        await expectArchiveError(readAll(padded, { chunk }), "damaged", /after its gzip stream/);
      async function* apart() {
        yield valid;
        yield* chunked(tail, 16);
      }
      await expectArchiveError(collectItems(readArchive(apart())), "damaged", /gzip stream/);
    }
  });

  it("refuses data after the gzip stream of a file read stream", async () => {
    const tails = [
      Buffer.alloc(8),
      Buffer.from("\0hidden"),
      Buffer.concat([Buffer.from([0]), Buffer.alloc(200_000, "A")]),
      Buffer.alloc(1 << 20),
    ];
    for (const [i, tail] of tails.entries()) {
      const file = path.join(dir, `tail-${i}.cloudhal`);
      await writeFile(file, Buffer.concat([valid, tail]));
      await expectArchiveError(
        collectItems(readArchive(createReadStream(file))),
        "damaged",
        /after its gzip stream/,
      );
    }
    const clean = path.join(dir, "clean.cloudhal");
    await writeFile(clean, valid);
    expect(await collectItems(readArchive(createReadStream(clean)))).toBeGreaterThan(1);
  });

  it("stops a gzip bomb after the end of the archive", async () => {
    const member = gzipSync(new Uint8Array(1 << 20)); // 1 MiB of zeros in about 1 KiB
    let pulled = 0;
    async function* bomb() {
      yield valid;
      for (let i = 0; i < 1024; i++) {
        pulled++;
        yield member;
      }
    }
    await expectArchiveError(collectItems(readArchive(bomb())), "damaged", /after its end/);
    expect(pulled).toBeLessThan(64);
  });

  it("refuses a second gzip member that holds another entry", async () => {
    const extra = gzipSync(rawTar([{ path: "nodes/0004.ndjson", body: "{}\n" }]));
    await expectArchiveError(readAll(Buffer.concat([valid, extra])), "damaged", /after its end/);
  });
});

async function collectItems(items: AsyncIterable<ArchiveItem>): Promise<number> {
  let n = 0;
  for await (const item of items) {
    if (item.type === "media") await collect(item.body);
    n++;
  }
  return n;
}

type MediaItem = Extract<ArchiveItem, { type: "media" }>;

/** The first media item of `items` with at least `size` bytes. */
async function firstMedia(items: AsyncGenerator<ArchiveItem>, size = 0): Promise<MediaItem> {
  for (;;) {
    const next = await items.next();
    if (next.done) throw new Error("no media item");
    if (next.value.type === "media" && next.value.size >= size) return next.value;
  }
}

/** Reads an iterator to its end. */
async function toEnd(body: AsyncIterator<Uint8Array>): Promise<void> {
  for (;;) if ((await body.next()).done) return;
}

describe("media bodies", () => {
  it("refuses a body read after the next item was requested, an empty one too", async () => {
    const held: MediaItem[] = [];
    for await (const item of readArchive(chunked(valid, 4096)))
      if (item.type === "media") held.push(item);
    expect(held.map((m) => m.size).sort((a, b) => a - b)).toEqual(
      MEDIA.map((m) => m.length).sort((a, b) => a - b),
    );
    for (const item of held)
      await expectArchiveError(
        collect(item.body),
        "invalid_input",
        `${item.path}: a media body was read after the next item was requested`,
      );
  });

  it("refuses to move on while a body is still being read", async () => {
    const items = readArchive(chunked(valid, 1000));
    const body = (await firstMedia(items, 1)).body[Symbol.asyncIterator]();
    const pending = body.next(); // a sink started without awaiting it
    await expectArchiveError(items.next(), "invalid_input", /is still being read/);
    await pending.catch(() => undefined);
    await expectArchiveError(body.next(), "invalid_input", /after the next item/);
  });

  it("keeps a read error, so a retry never ends a partial body cleanly", async () => {
    // Named and listed by the hash of the 512 bytes the archive holds, declared 1024 long.
    const held = pattern(512, 5);
    const cut: RawEntry = { path: `media/${sha256(held)}`, body: held, size: 1024 };
    const archive = archiveOf([...baseFiles().slice(0, 4), cut], {
      end: false,
      manifest: (m) => {
        listedAt(m, 4).bytes = 1024;
        (m.counts as { mediaBytes: number }).mediaBytes = 1024;
      },
    });
    const items = readArchive(chunked(archive, 4096));
    const body = (await firstMedia(items)).body[Symbol.asyncIterator]();
    await expectArchiveError(toEnd(body), "truncated");
    await expectArchiveError(body.next(), "truncated");
    await expectArchiveError(items.next(), "truncated");
  });
});

describe("stopping early", () => {
  it("closes the source when the caller stops after the manifest", async () => {
    let closed = false;
    async function* source() {
      try {
        yield* chunked(valid, 512);
      } finally {
        closed = true;
      }
    }
    for await (const item of readArchive(source())) {
      expect(item.type).toBe("manifest");
      break;
    }
    await vi.waitFor(() => expect(closed).toBe(true));
  });
});
