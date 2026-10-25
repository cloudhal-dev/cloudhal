/**
 * Helpers for the site archive tests (RFC-0039 step 1): fixed sample content, chunked sources, a
 * full read-back, and hand-built tar streams for hostile input. The ustar offsets used to patch
 * headers are spelled out here, apart from src/archive/tar.ts, as an independent reading of the
 * format.
 */
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { expect } from "vitest";
import {
  type ArchiveContent,
  ArchiveError,
  type ArchiveErrorCode,
  type ArchiveMediaSource,
  archiveStream,
  encodeNdjson,
  type ReadArchiveOptions,
  readArchive,
  type SiteArchiveManifest,
  splitNdjson,
  type WriteArchiveOptions,
} from "../src/archive/index.ts";
import { sealTarHeader, tarHeader, tarPadding } from "../src/archive/tar.ts";

/** ustar header offsets (POSIX.1-1988). */
export const USTAR = {
  name: 0,
  size: 124,
  checksum: 148,
  typeflag: 156,
  linkname: 157,
  magic: 257,
  version: 263,
  prefix: 345,
} as const;

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
export const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

export const SITE = {
  siteId: "site_demo0001",
  siteName: "Demo site",
  createdBy: "0.6.1",
  createdAt: "2026-10-20T12:00:00.000Z",
};

/** Deterministic bytes of a given length. */
export function pattern(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (i * 31 + seed * 7) % 251;
  return out;
}

/** Byte-for-byte equality. */
export const same = (a: Uint8Array | undefined, b: Uint8Array): boolean =>
  a !== undefined && Buffer.compare(a, b) === 0;

/** XORs one byte in place. */
export function flip(bytes: Uint8Array, at: number, mask = 1): void {
  bytes[at] = (bytes[at] as number) ^ mask;
}

/** `files[index]` of a manifest object under test. */
export function listedAt(
  manifest: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  return (manifest.files as Record<string, unknown>[])[index] as Record<string, unknown>;
}

export async function* chunked(bytes: Uint8Array, size: number): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size);
}

export async function collect(iter: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of iter) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export function memoryMedia(bytes: Uint8Array, chunk = 64 * 1024): ArchiveMediaSource {
  return { sha256: sha256(bytes), bytes: bytes.length, open: () => chunked(bytes, chunk) };
}

export const MEDIA = [pattern(3000, 1), pattern(700, 2), pattern(0, 3), pattern(70_000, 4)];

export const NODE_ROWS = Array.from({ length: 12 }, (_, i) => ({
  id: `page_${String(i).padStart(8, "0")}`,
  kind: "page",
  body: JSON.stringify({ title: `Page ${i}`, text: "lorem ipsum ".repeat(5) }),
}));

/** Sample content: nodes in several parts, snapshots, blobs, project, ledger and media. */
export function sampleContent(overrides: Partial<ArchiveContent> = {}): ArchiveContent {
  return {
    ...SITE,
    project: utf8(JSON.stringify({ id: "prj_demo0001", rev: 1 })),
    nodes: splitNdjson(NODE_ROWS, { partBytes: 512 }),
    snapshots: splitNdjson([{ id: "snap_00000001" }, { id: "snap_00000002" }]),
    blobs: splitNdjson([{ hash: "a".repeat(64), body: "{}" }]),
    ledger: encodeNdjson([{ sha256: "b".repeat(64), reason: "dmca", legal: true }]),
    media: MEDIA.map((m) => memoryMedia(m)),
    ...overrides,
  };
}

export async function writeBytes(
  content: ArchiveContent,
  options: WriteArchiveOptions = {},
): Promise<Buffer> {
  return collect(archiveStream(content, options).bytes);
}

export interface ReadBack {
  manifest: SiteArchiveManifest;
  files: { path: string; bytes: Buffer }[];
}

/** Every item of an archive, media bodies read in full. */
export async function readAll(
  bytes: Uint8Array,
  options: ReadArchiveOptions & { chunk?: number } = {},
): Promise<ReadBack> {
  let manifest: SiteArchiveManifest | undefined;
  const files: { path: string; bytes: Buffer }[] = [];
  for await (const item of readArchive(chunked(bytes, options.chunk ?? 4096), options)) {
    if (item.type === "manifest") manifest = item.manifest;
    else if (item.type === "file") files.push({ path: item.path, bytes: Buffer.from(item.bytes) });
    else files.push({ path: item.path, bytes: await collect(item.body) });
  }
  if (!manifest) throw new Error("no manifest");
  return { manifest, files };
}

export interface RawEntry {
  path: string;
  body: Uint8Array | string;
  /** Declared size, when it should differ from the body's. */
  size?: number;
  /** Edits the header before it is sealed with a fresh checksum. */
  patch?: (header: Uint8Array) => void;
}

function setName(header: Uint8Array, path: Uint8Array): void {
  header.fill(0, USTAR.name, USTAR.name + 100);
  header.set(path.subarray(0, 100), USTAR.name);
}

/** A tar stream built entry by entry; `end: false` leaves out the two zero blocks. */
export function rawTar(
  entries: RawEntry[],
  options: { end?: boolean; tail?: Uint8Array } = {},
): Buffer {
  const out: Uint8Array[] = [];
  for (const entry of entries) {
    const body = typeof entry.body === "string" ? utf8(entry.body) : entry.body;
    const header = tarHeader("x", entry.size ?? body.length);
    setName(header, utf8(entry.path));
    entry.patch?.(header);
    out.push(sealTarHeader(header), body, tarPadding(body.length));
  }
  if (options.end !== false) out.push(new Uint8Array(1024));
  if (options.tail) out.push(options.tail);
  return Buffer.concat(out);
}

const LF = 0x0a;
function rows(body: Uint8Array): number {
  return body.filter((b) => b === LF).length;
}

/** A manifest (as a plain object, for tests to break) listing `files`. */
export function manifestFor(files: RawEntry[]): Record<string, unknown> {
  const counts = { nodes: 0, snapshots: 0, blobs: 0, media: 0, mediaBytes: 0 };
  const listed = files.map((f) => {
    const body = typeof f.body === "string" ? utf8(f.body) : f.body;
    const kind = f.path.split("/")[0] as string;
    if (kind === "nodes" || kind === "snapshots" || kind === "blobs") counts[kind] += rows(body);
    if (kind === "media") {
      counts.media++;
      counts.mediaBytes += body.length;
    }
    return { path: f.path, sha256: sha256(body), bytes: body.length };
  });
  return {
    format: "cloudhal.site-archive@1",
    contracts: { schemaVersion: 1 },
    bundle: "cloudhal.site-bundle@1",
    ...SITE,
    counts,
    files: listed,
  };
}

/** A small valid file set: project, two node parts, one snapshot part and a media file. */
export function baseFiles(): RawEntry[] {
  const media = pattern(900, 9);
  return [
    { path: "project.json", body: '{"id":"prj_demo0001"}' },
    { path: "nodes/0001.ndjson", body: '{"id":"n1"}\n{"id":"n2"}\n' },
    { path: "nodes/0002.ndjson", body: '{"id":"n3"}\n' },
    { path: "snapshots/0001.ndjson", body: '{"id":"s1"}\n' },
    { path: `media/${sha256(media)}`, body: media },
  ];
}

/**
 * A gzipped archive of `entries` whose manifest lists `listed` (default: the same entries);
 * `manifest` edits the manifest object first.
 */
export function archiveOf(
  entries: RawEntry[],
  options: {
    listed?: RawEntry[];
    manifest?: (m: Record<string, unknown>) => void;
    end?: boolean;
    tail?: Uint8Array;
  } = {},
): Buffer {
  const manifest = manifestFor(options.listed ?? entries);
  options.manifest?.(manifest);
  const head: RawEntry = { path: "manifest.json", body: JSON.stringify(manifest) };
  return gzipSync(rawTar([head, ...entries], options));
}

/** The offset of the body of `path` in a tar stream. */
export function bodyOffset(tar: Buffer, path: string): number {
  for (let at = 0; at < tar.length; at += 512)
    if (
      Buffer.from(tar.subarray(at, at + 100))
        .toString("latin1")
        .split("\0")[0] === path
    )
      return at + 512;
  throw new Error(`no ${path}`);
}

/** A valid archive's tar, edited, compressed again. */
export function retar(archive: Uint8Array, edit: (tar: Buffer) => Buffer | undefined): Buffer {
  const tar = gunzipSync(archive);
  return gzipSync(edit(tar) ?? tar);
}

/** Awaits a rejection and checks it is an ArchiveError with `code` (and `text`). */
export async function expectArchiveError(
  promise: Promise<unknown>,
  code: ArchiveErrorCode,
  text?: string | RegExp,
): Promise<ArchiveError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, `expected an ArchiveError ${code}`).toBeInstanceOf(ArchiveError);
  const archiveError = error as ArchiveError;
  expect({ code: archiveError.code, message: archiveError.message }).toMatchObject({ code });
  if (text !== undefined) expect(archiveError.message).toMatch(text);
  return archiveError;
}
