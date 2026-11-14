/**
 * The streaming tar and gzip readers (RFC-0046 §7) below `verifyRelease`: limits a signed bundle
 * cannot reach through the manifest (its size limit comes first), byte sources of every form, and
 * a linear run on an adversarial header.
 */
import { describe, expect, it } from "vitest";
import { gzipBytes, tarArchive } from "../../../scripts/release-bundle/tar.ts";
import { chunksOf, gunzip, readTar } from "../src/tar.ts";
import { chunked } from "./helpers.ts";

const MTIME = 1_700_000_000;
const drain = async (it: AsyncIterable<unknown>) => {
  let n = 0;
  for await (const _ of it) n++;
  return n;
};
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );

describe("readTar and gunzip", () => {
  it("refuses more than 30,000 entries", async () => {
    const entries = Array.from({ length: 30_001 }, (_, i) => ({
      path: `p/${String(i).padStart(6, "0")}`,
      bytes: new Uint8Array(0),
    }));
    const tar = tarArchive(entries, MTIME);
    expect(await codeOf(drain(readTar(chunksOf(tar), MTIME, () => {})))).toBe("limit-exceeded");
  });

  it("refuses a tarball that decompresses beyond the cap", async () => {
    const tar = tarArchive([{ path: "a", bytes: new Uint8Array(200_000) }], MTIME);
    const gz = await gzipBytes(tar);
    expect(await codeOf(drain(gunzip(chunksOf(gz), 100_000)))).toBe("limit-exceeded");
    expect(await drain(gunzip(chunksOf(gz)))).toBeGreaterThan(0);
  });

  it("refuses gzip that is corrupt after a valid header, and a truncated one", async () => {
    const gz = await gzipBytes(tarArchive([{ path: "a", bytes: new Uint8Array(5000) }], MTIME));
    const corrupt = new Uint8Array(gz);
    for (let i = 12; i < corrupt.length - 8; i++) corrupt[i] = 0xff;
    expect(await codeOf(drain(gunzip(chunksOf(corrupt))))).toBe("tar-format");
    expect(await codeOf(drain(gunzip(chunksOf(gz.subarray(0, 5)))))).toBe("tar-format");
  });

  it("reads Uint8Array, ReadableStream and async iterable sources alike", async () => {
    const tar = tarArchive(
      [
        { path: "a", bytes: new Uint8Array(700).fill(1) },
        { path: `${"d/".repeat(60)}long-name-needs-pax`, bytes: new Uint8Array(3) },
      ],
      MTIME,
    );
    async function* iter() {
      for (let i = 0; i < tar.length; i += 333) yield tar.subarray(i, i + 333);
    }
    for (const source of [tar, chunked(tar, 1), chunked(tar, 513), iter()]) {
      const got: string[] = [];
      for await (const e of readTar(chunksOf(source), MTIME, () => {}))
        got.push(`${e.path}:${e.bytes.length}`);
      expect(got).toEqual(["a:700", `${"d/".repeat(60)}long-name-needs-pax:3`]);
    }
  });

  it("calls admit before buffering an entry's bytes", async () => {
    const tar = tarArchive([{ path: "big", bytes: new Uint8Array(1_000_000) }], MTIME);
    let pulled = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(c) {
        if (pulled >= tar.length) return c.close();
        c.enqueue(tar.subarray(pulled, pulled + 4096));
        pulled += 4096;
      },
    });
    const admit = () => {
      throw Object.assign(new Error("no"), { code: "entry-unlisted" });
    };
    expect(await codeOf(drain(readTar(chunksOf(source), MTIME, admit)))).toBe("entry-unlisted");
    expect(pulled).toBeLessThan(100_000);
  });

  it("stays linear on a 100k-byte header-like run of digits", async () => {
    const junk = new Uint8Array(100_000).fill(0x37); // "7" everywhere: no header parses
    const t = performance.now();
    expect(await codeOf(drain(readTar(chunksOf(junk), MTIME, () => {})))).toBe("tar-format");
    expect(performance.now() - t).toBeLessThan(500);
  });
});
