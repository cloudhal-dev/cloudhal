/** RFC-0039 §1: NDJSON parts of at most 8 MB, one row per line. */
import { describe, expect, it } from "vitest";
import { encodeNdjson, PART_SPLIT_BYTES, splitNdjson } from "../src/archive/index.ts";
import { countRows } from "../src/archive/parts.ts";
import { expectArchiveError } from "./archive-fixture.ts";

const text = (part: Uint8Array) => Buffer.from(part).toString("utf8");
/** A row whose NDJSON line is exactly `bytes` long: `"xxx…"` plus the newline. */
const rowOf = (bytes: number) => "x".repeat(bytes - 3);

describe("splitNdjson", () => {
  it("starts a new part when the next line would cross the limit", () => {
    // Lines of 32 bytes: two fill a 64-byte part exactly, a third starts the next one.
    const two = splitNdjson([rowOf(32), rowOf(32)], { partBytes: 64 });
    expect(two.map((p) => p.length)).toEqual([64]);
    const three = splitNdjson([rowOf(32), rowOf(32), rowOf(1 + 3)], { partBytes: 64 });
    expect(three.map((p) => p.length)).toEqual([64, 4]);
    const over = splitNdjson([rowOf(32), rowOf(33)], { partBytes: 64 });
    expect(over.map((p) => p.length)).toEqual([32, 33]);
  });

  it("puts a line larger than a part alone in its own part", () => {
    const parts = splitNdjson([rowOf(10), rowOf(100), rowOf(10), rowOf(10)], { partBytes: 64 });
    expect(parts.map((p) => p.length)).toEqual([10, 100, 20]);
    expect(splitNdjson([rowOf(100), rowOf(10)], { partBytes: 64 }).map((p) => p.length)).toEqual([
      100, 10,
    ]);
  });

  it("refuses a line above the reader's part cap, naming the row", async () => {
    await expectArchiveError(
      Promise.resolve().then(() =>
        splitNdjson([rowOf(10), rowOf(200)], { partBytes: 64, maxLineBytes: 199 }),
      ),
      "too_large",
      /row 1 is 200 bytes/,
    );
  });

  it("keeps row order, counts bytes not characters, and ends every part with a newline", () => {
    const rows = [{ a: "ü".repeat(20) }, { b: "  and \ud800" }, ["x"], 7, null, "é"];
    const parts = splitNdjson(rows, { partBytes: 48 });
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
      expect(part[part.length - 1]).toBe(0x0a);
    }
    const lines = rows.map((r) => `${JSON.stringify(r)}\n`);
    expect(parts.map(text).join("")).toBe(lines.join(""));
    // ü is two bytes: the first line is 49 bytes, above 48, and so alone.
    expect(parts[0]?.length).toBe(Buffer.byteLength(lines[0] as string));
    expect(parts.reduce((n, p) => n + countRows(p, "p"), 0)).toBe(rows.length);
    expect(splitNdjson([])).toEqual([]);
    expect(() => splitNdjson([undefined])).toThrow(/row 0 has no JSON form/);
  });

  it("splits at the real 8 MiB threshold", () => {
    const half = PART_SPLIT_BYTES / 2;
    expect(splitNdjson([rowOf(half), rowOf(half)]).map((p) => p.length)).toEqual([
      PART_SPLIT_BYTES,
    ]);
    expect(splitNdjson([rowOf(half), rowOf(half + 1)]).map((p) => p.length)).toEqual([
      half,
      half + 1,
    ]);
  });
});

describe("encodeNdjson and countRows", () => {
  it("writes one file and refuses one above the cap", async () => {
    expect(text(encodeNdjson([{ a: 1 }, { b: 2 }]))).toBe('{"a":1}\n{"b":2}\n');
    expect(encodeNdjson([]).length).toBe(0);
    await expectArchiveError(
      Promise.resolve().then(() => encodeNdjson([rowOf(10), rowOf(10)], 19)),
      "too_large",
    );
  });

  it("counts newlines and refuses what JSON.stringify never writes", async () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(countRows(enc("{}\n[]\n"), "nodes/0001.ndjson")).toBe(2);
    for (const bad of ["", "{}", "{}\n\n", "\n{}\n"])
      await expectArchiveError(
        Promise.resolve().then(() => countRows(enc(bad), "nodes/0001.ndjson")),
        "damaged",
        /^nodes\/0001\.ndjson: /,
      );
  });
});
