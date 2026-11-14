/**
 * The release tarball's byte format (RFC-0046 §7): ustar entries, regular files only, mode 0644,
 * uid/gid 0, empty user and group names, one fixed mtime (the release's `createdAt`), sorted by
 * path, a PAX `path` record before any entry whose name is longer than 100 bytes or not printable
 * ASCII, two zero blocks at the end; then gzip with RFC-0039's fixed parameters and header
 * (`gzipFixed`: mtime 0, no name, OS 255). The same parts give the same bytes on every run.
 */
import { gzipFixed } from "../../packages/cli/src/archive/gzip.ts";
import { needsPax, ustarName } from "../../packages/release-verify/src/tar.ts";
import type { SourceFile } from "./read-build.ts";

const enc = new TextEncoder();

function field(h: Uint8Array, at: number, len: number, value: string): void {
  h.set(enc.encode(value).subarray(0, len), at);
}

function octal(h: Uint8Array, at: number, len: number, value: number): void {
  field(h, at, len, `${value.toString(8).padStart(len - 1, "0")}\0`);
}

/** One 512-byte ustar header: mode 0644, uid/gid 0, no owner names, link name or prefix. */
export function tarHeader(name: string, size: number, flag: "0" | "x", mtime: number): Uint8Array {
  const h = new Uint8Array(512);
  field(h, 0, 100, name);
  octal(h, 100, 8, 0o644);
  octal(h, 108, 8, 0);
  octal(h, 116, 8, 0);
  octal(h, 124, 12, size);
  octal(h, 136, 12, mtime);
  h.fill(0x20, 148, 156);
  h[156] = flag.charCodeAt(0);
  field(h, 257, 6, "ustar\0");
  field(h, 263, 2, "00");
  let sum = 0;
  for (const x of h) sum += x;
  field(h, 148, 8, `${sum.toString(8).padStart(6, "0")}\0 `);
  return h;
}

/** One PAX `path` record: `"<len> path=<value>\n"`, `len` counting itself. */
export function paxRecord(p: string): Uint8Array {
  const body = ` path=${p}\n`;
  const n = enc.encode(body).length;
  let len = n + 1;
  while (n + String(len).length !== len) len = n + String(len).length;
  return enc.encode(`${len}${body}`);
}

const pad = (n: number) => new Uint8Array((512 - (n % 512)) % 512);

// One naming rule with the verifier (RFC-0046 §7): the PAX record when a path needs one, and the
// ustar name field as the longest suffix of at most 100 UTF-8 bytes on a code-point boundary.
export { needsPax, ustarName };

/** The ustar archive of `entries` in the order given (callers sort them), two zero end blocks. */
export function tarArchive(entries: readonly SourceFile[], mtime: number): Uint8Array {
  if (!Number.isSafeInteger(mtime) || mtime < 0)
    throw new Error("tar mtime must be a whole second");
  const out: Uint8Array[] = [];
  for (const e of entries) {
    if (needsPax(e.path)) {
      const rec = paxRecord(e.path);
      out.push(tarHeader("././@PaxHeader", rec.length, "x", mtime), rec, pad(rec.length));
    }
    out.push(tarHeader(ustarName(e.path), e.bytes.length, "0", mtime), e.bytes);
    out.push(pad(e.bytes.length));
  }
  out.push(new Uint8Array(1024));
  return Buffer.concat(out);
}

async function* once(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}

/** `bytes` gzip-compressed with RFC-0039's fixed parameters and header. */
export async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const c of gzipFixed(once(bytes))) chunks.push(c);
  return new Uint8Array(Buffer.concat(chunks));
}
