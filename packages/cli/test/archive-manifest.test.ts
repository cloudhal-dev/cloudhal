/**
 * RFC-0039 §1 and invariant 4: `manifest.json` comes first and is checked strictly; an archive of
 * a newer format, contracts schemaVersion or bundle format is refused with the CLI version needed.
 */
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { ArchiveErrorCode } from "../src/archive/index.ts";
import {
  archiveOf,
  baseFiles,
  expectArchiveError,
  listedAt,
  manifestFor,
  pattern,
  type RawEntry,
  rawTar,
  readAll,
  sha256,
} from "./archive-fixture.ts";

type Edit = (m: Record<string, unknown>) => void;

const files = baseFiles();
const withManifest = (edit: Edit) => readAll(archiveOf(files, { manifest: edit }));
const counts = (m: Record<string, unknown>) => m.counts as Record<string, unknown>;
/** Edits that set one value: on the manifest, its counts, or one listed file. */
const set =
  (key: string, value: unknown): Edit =>
  (m) => {
    m[key] = value;
  };
const setCount =
  (key: string, value: unknown): Edit =>
  (m) => {
    counts(m)[key] = value;
  };
const setFile =
  (index: number, key: string, value: unknown): Edit =>
  (m) => {
    listedAt(m, index)[key] = value;
  };
const drop =
  (key: string): Edit =>
  (m) => {
    delete m[key];
  };

describe("the first entry", () => {
  it("must be manifest.json", async () => {
    const tar = rawTar([
      ...files,
      { path: "manifest.json", body: JSON.stringify(manifestFor(files)) },
    ]);
    await expectArchiveError(readAll(gzipSync(tar)), "not_archive", /first entry/);
    await expectArchiveError(readAll(gzipSync(new Uint8Array(10240))), "not_archive");
    await expectArchiveError(readAll(gzipSync(new Uint8Array(0))), "not_archive");
  });

  it("must be UTF-8 JSON without a byte order mark", async () => {
    const raw = (body: Uint8Array | string) =>
      readAll(gzipSync(rawTar([{ path: "manifest.json", body }])));
    await expectArchiveError(raw("{not json"), "invalid_manifest", /UTF-8 JSON/);
    await expectArchiveError(raw(new Uint8Array([0x7b, 0xff, 0x7d])), "invalid_manifest");
    const bom = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(JSON.stringify(manifestFor(files))),
    ]);
    await expectArchiveError(raw(bom), "invalid_manifest");
    await expectArchiveError(raw("[]"), "not_archive");
  });
});

describe("the manifest's shape", () => {
  const cases: [string, Edit][] = [
    ["an unknown key", set("extra", 1)],
    ["an unknown counts key", setCount("pages", 1)],
    ["an unknown files key", setFile(0, "mode", 420)],
    ["a missing field", drop("siteName")],
    ["a missing contracts version", set("contracts", {})],
    ["a contracts version 0", set("contracts", { schemaVersion: 0 })],
    ["a negative count", setCount("blobs", -1)],
    ["a fractional count", setCount("blobs", 0.5)],
    ["a site id that is not an id", set("siteId", "../x")],
    ["an empty site name", set("siteName", "")],
    ["a createdAt that is not RFC 3339", set("createdAt", "2026-10-20")],
    ["a bundle that is not a bundle format", set("bundle", "zip")],
    ["files that are not an array", set("files", {})],
    [
      "a file listed twice",
      (m) => {
        (m.files as unknown[]).splice(1, 0, listedAt(m, 1));
      },
    ],
    [
      "files out of order",
      (m) => {
        (m.files as unknown[]).reverse();
      },
    ],
    ["a gap in the part numbers", setFile(2, "path", "nodes/0003.ndjson")],
    ["an empty part", setFile(2, "bytes", 0)],
    ["an uppercase hash", setFile(0, "sha256", "A".repeat(64))],
    ["a size that is not an integer", setFile(0, "bytes", "21")],
    ["a media count that disagrees", setCount("media", 2)],
    ["a media size that disagrees", setCount("mediaBytes", 1)],
    ["mediaOmitted false", set("mediaOmitted", false)],
    ["mediaOmitted with media", set("mediaOmitted", true)],
    [
      "a manifest that lists itself",
      (m) => {
        (m.files as unknown[]).unshift({ path: "manifest.json", sha256: "0".repeat(64), bytes: 1 });
      },
    ],
  ];
  it.each(cases)("refuses %s", async (_, edit) => {
    await expectArchiveError(withManifest(edit), "invalid_manifest", /^manifest\.json: /);
  });

  it("echoes an unknown key only when it is short, printable ASCII", async () => {
    const places: [string, (key: string) => Edit][] = [
      ["the manifest", (key) => set(key, 1)],
      ["contracts", (key) => set("contracts", { schemaVersion: 1, [key]: 1 })],
      ["counts", (key) => setCount(key, 1)],
      ["files[0]", (key) => setFile(0, key, 1)],
    ];
    const hidden = ["\u001b[2J", "\u009b2J\u009b31m", "a\u202eb", "\u0085", "two words"];
    const long = "k".repeat(2_000_000);
    for (const [where, edit] of places) {
      const at = `manifest.json: ${where} has an unknown key `;
      const shown = await expectArchiveError(withManifest(edit("extra")), "invalid_manifest");
      expect(shown.message).toBe(`${at}"extra"`);
      const cut = await expectArchiveError(withManifest(edit(long)), "invalid_manifest");
      expect(cut.message).toBe(`${at}"${"k".repeat(120)}..."`);
      for (const key of hidden) {
        const error = await expectArchiveError(withManifest(edit(key)), "invalid_manifest");
        expect(error.message).toBe(
          `${at}(not shown: it has spaces, controls or non-ASCII characters)`,
        );
      }
    }
  });

  it("accepts mediaOmitted without media", async () => {
    const noMedia = files.slice(0, 4);
    const back = await readAll(
      archiveOf(noMedia, {
        manifest: (m) => {
          m.mediaOmitted = true;
        },
      }),
    );
    expect(back.manifest.mediaOmitted).toBe(true);
    expect(back.files.map((f) => f.path)).toEqual(noMedia.map((f) => f.path));
  });

  it("accepts an empty media file", async () => {
    const empty: RawEntry = { path: `media/${sha256(new Uint8Array(0))}`, body: new Uint8Array(0) };
    const media = pattern(10, 1);
    const entries = [
      ...files.slice(0, 4),
      ...[empty, { path: `media/${sha256(media)}`, body: media }].sort((a, b) =>
        a.path < b.path ? -1 : 1,
      ),
    ];
    expect((await readAll(archiveOf(entries))).files).toHaveLength(6);
  });
});

describe("versions (invariant 4)", () => {
  const notArchive: [string, Edit][] = [
    ["no format", drop("format")],
    ["another format", set("format", "zip")],
    ["the bundle format as the archive format", set("format", "cloudhal.site-bundle@1")],
    ["a format version 0", set("format", "cloudhal.site-archive@0")],
  ];
  it.each(notArchive)("refuses %s as not an archive", async (_, edit) => {
    await expectArchiveError(withManifest(edit), "not_archive", /not a Cloudhal site archive/);
  });

  const newer: [string, Edit][] = [
    [
      "archive format 2 of any shape",
      (m) => {
        for (const key of Object.keys(m)) if (key !== "createdBy") delete m[key];
        m.format = "cloudhal.site-archive@2";
        m.parts = ["whatever @2 holds"];
      },
    ],
    ["contracts schemaVersion 2", set("contracts", { schemaVersion: 2 })],
    ["bundle format 2", set("bundle", "cloudhal.site-bundle@2")],
  ];
  it.each(newer)("refuses %s, naming the CLI version", async (_, edit) => {
    await expectArchiveError(
      withManifest((m) => {
        m.createdBy = "9.9.9";
        edit(m);
      }),
      "unsupported_version" as ArchiveErrorCode,
      /newer Cloudhal .*; update @cloudhal\/cli to 9\.9\.9 or later$/,
    );
  });

  it("does not echo a createdBy that is not a version", async () => {
    const error = await expectArchiveError(
      withManifest((m) => {
        m.format = "cloudhal.site-archive@3";
        m.createdBy = "1.0\u001b[2J";
      }),
      "unsupported_version",
      /to a newer version$/,
    );
    expect(error.message).not.toContain("\u001b");
  });
});
