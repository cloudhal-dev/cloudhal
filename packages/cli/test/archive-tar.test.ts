/** RFC-0039 §1: the ustar blocks Cloudhal writes, and the streaming reader's refusals. */
import { describe, expect, it } from "vitest";
import { parseTarHeader, TAR_RECORD, tarEnd, tarHeader } from "../src/archive/tar.ts";
import { readTar } from "../src/archive/tar-read.ts";
import {
  chunked,
  collect,
  expectArchiveError,
  pattern,
  type RawEntry,
  rawTar,
  same,
  USTAR,
} from "./archive-fixture.ts";

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  Buffer.from(bytes.subarray(start, start + length)).toString("latin1");

async function entriesOf(tar: Uint8Array, chunk = 512, maxEntries = 100) {
  const out: { path: string; body: Buffer }[] = [];
  for await (const entry of readTar(chunked(tar, chunk), { maxEntries }))
    out.push({ path: entry.path, body: await collect(entry.body) });
  return out;
}

const drain = (tar: Uint8Array, maxEntries = 100) => entriesOf(tar, 512, maxEntries);

describe("tar header bytes", () => {
  it("writes fixed fields, an octal size and an unsigned checksum", () => {
    const h = tarHeader("nodes/0001.ndjson", 1234);
    expect(h.length).toBe(512);
    expect(ascii(h, 0, 100)).toBe(`nodes/0001.ndjson${"\0".repeat(83)}`);
    expect(ascii(h, 100, 8)).toBe("0000644\0");
    expect(ascii(h, 108, 8)).toBe("0000000\0");
    expect(ascii(h, 116, 8)).toBe("0000000\0");
    expect(ascii(h, 124, 12)).toBe(`${(1234).toString(8).padStart(11, "0")}\0`);
    expect(ascii(h, 136, 12)).toBe("00000000000\0");
    expect(ascii(h, 156, 1)).toBe("0");
    expect(ascii(h, 157, 100)).toBe("\0".repeat(100));
    expect(ascii(h, 257, 8)).toBe("ustar\u000000");
    expect(ascii(h, 265, 64)).toBe("\0".repeat(64)); // uname, gname
    expect(ascii(h, 345, 155)).toBe("\0".repeat(155)); // prefix
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : (h[i] as number);
    expect(ascii(h, 148, 8)).toBe(`${sum.toString(8).padStart(6, "0")}\0 `);
    expect(parseTarHeader(h)).toEqual({ path: "nodes/0001.ndjson", size: 1234 });
  });

  it("ends with two zero blocks padded to a 10240-byte record", () => {
    for (const written of [0, 512, 9216, 9728, 10240, 20480 + 512]) {
      const end = tarEnd(written);
      expect((written + end.length) % TAR_RECORD).toBe(0);
      expect(end.length).toBeGreaterThanOrEqual(1024);
      expect(end.every((b) => b === 0)).toBe(true);
    }
  });

  it("refuses names it cannot write as a plain ustar name", () => {
    expect(() => tarHeader("x".repeat(100), 1)).toThrow(/1-99 printable/);
    expect(() => tarHeader("a b", 1)).toThrow(/printable/);
    expect(() => tarHeader("", 1)).toThrow(/printable/);
  });
});

describe("readTar", () => {
  const sizes = [0, 1, 511, 512, 513, 4096 + 17];
  const entries: RawEntry[] = sizes.map((size, i) => ({
    path: `f${i}`,
    body: pattern(size, i),
  }));

  it("reads bodies of every size in any chunking", async () => {
    const tar = rawTar(entries, { tail: new Uint8Array(4096) });
    for (const chunk of [1, 7, 512, 64 * 1024]) {
      const got = await entriesOf(tar, chunk);
      expect(got.map((e) => e.path)).toEqual(entries.map((e) => e.path));
      for (const [i, e] of got.entries())
        expect(same(e.body, entries[i]?.body as Uint8Array)).toBe(true);
    }
  });

  it("skips bodies that are not read and refuses a stale body", async () => {
    const tar = rawTar(entries);
    const paths: string[] = [];
    let stale: AsyncIterable<Uint8Array> | undefined;
    for await (const entry of readTar(chunked(tar, 100), { maxEntries: 100 })) {
      paths.push(entry.path);
      if (entry.path === "f3") stale = entry.body;
    }
    expect(paths).toEqual(entries.map((e) => e.path));
    await expectArchiveError(collect(stale as AsyncIterable<Uint8Array>), "invalid_input", /after/);
  });

  it("refuses links, devices, directories, FIFOs and extension headers", async () => {
    for (const flag of ["1", "2", "3", "4", "5", "6", "7", "x", "g", "L", "K", "A"]) {
      const tar = rawTar([
        {
          path: "f",
          body: "x",
          patch: (h) => {
            h[USTAR.typeflag] = flag.charCodeAt(0);
          },
        },
      ]);
      await expectArchiveError(drain(tar), "unsafe_entry", /regular files only/);
    }
  });

  it("refuses prefixes, link names, other magic, base-256 sizes and odd names", async () => {
    const patches: ((h: Uint8Array) => void)[] = [
      (h) => h.fill(0x61, USTAR.prefix, USTAR.prefix + 1),
      (h) => h.fill(0x61, USTAR.linkname, USTAR.linkname + 1),
      (h) => h.set(Buffer.from("ustar  \0"), USTAR.magic), // GNU tar's old format
      (h) => h.set(Buffer.from("01"), USTAR.version),
      (h) => h.fill(0x80, USTAR.size, USTAR.size + 1),
      (h) => h.set(Buffer.from("12x"), USTAR.size),
      (h) => h.set(Buffer.from("f\0junk"), USTAR.name),
      (h) => h.set(Buffer.from("f\u001b[31m"), USTAR.name),
      (h) => h.fill(0x61, USTAR.name, USTAR.name + 100),
      (h) => h.fill(0, USTAR.name, USTAR.name + 100),
    ];
    for (const patch of patches) {
      const error = await expectArchiveError(
        drain(rawTar([{ path: "f", body: "x", patch }])),
        "unsafe_entry",
      );
      expect(error.message).not.toContain("\u001b");
    }
  });

  it("refuses a bad checksum as damage", async () => {
    const tar = rawTar([{ path: "nodes/0001.ndjson", body: "x" }]);
    tar[3] = (tar[3] as number) ^ 1; // a flipped name bit, checksum unchanged
    await expectArchiveError(drain(tar), "damaged", /checksum/);
  });

  it("checks the end of the archive", async () => {
    const one: RawEntry[] = [{ path: "f", body: "abc" }];
    const body = rawTar(one, { end: false });
    const zero = new Uint8Array(512);
    const cases: [Uint8Array, string][] = [
      [Buffer.concat([body, zero]), "truncated"],
      [Buffer.concat([body, zero, rawTar(one, { end: false })]), "damaged"],
      [body, "truncated"],
      [body.subarray(0, 700), "truncated"],
      [body.subarray(0, 300), "truncated"],
      [rawTar(one, { tail: Buffer.from([0, 0, 1]) }), "damaged"],
      [rawTar(one, { tail: new Uint8Array(TAR_RECORD + 1) }), "damaged"],
      [new Uint8Array(0), "not_archive"],
    ];
    for (const [tar, code] of cases)
      await expectArchiveError(drain(tar), code as "truncated" | "damaged" | "not_archive");
    expect(await drain(rawTar(one, { tail: new Uint8Array(TAR_RECORD) }))).toHaveLength(1);
  });

  it("caps the number of entries", async () => {
    await expectArchiveError(drain(rawTar(entries), 3), "too_large", /more than 3 entries/);
    expect(await drain(rawTar(entries), entries.length)).toHaveLength(entries.length);
  });
});
