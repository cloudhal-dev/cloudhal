/**
 * RFC-0028 §5: `cloudhal media placeholders` draws a placeholder in the local Chrome for images
 * nothing drew one for (an agent's upload, an import): a lean 24 px WebP and the dominant colour,
 * colour only for transparent images; measured fields and the focal point stay.
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { PNG_1X1 } from "@cloudhal/core-ts/media/fixtures";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mediaPlaceholders } from "../src/commands/media-placeholders.ts";
import { init, readProjectConfig } from "../src/index.ts";
import { findChrome } from "../src/render-chrome.ts";

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = (CRC[(c ^ x) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Uint8Array) => {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
};
/** A real, decodable RGB PNG of one colour. */
function solidPng(w: number, h: number, [r, g, b]: [number, number, number]): Uint8Array {
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) raw.set([r, g, b], y * (1 + w * 3) + 1 + x * 3);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const person = { kind: "human" as const, id: "user_placeholder1", name: "Ada" };

describe.skipIf(!findChrome())("cloudhal media placeholders (RFC-0028 §5)", () => {
  let tmp: string;
  let projectDir: string;
  let siteId: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-placeholders-"));
    projectDir = path.join(tmp, "site");
    siteId = (await init({ dir: projectDir, name: "Placeholder Site" })).siteId;
  });
  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("draws a lean LQIP and the colour; transparent images get the colour only", async () => {
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    const ingest = (bytes: Uint8Array, filename: string) =>
      local.store.ingestAsset({
        siteId,
        bytes,
        filename,
        uploadedBy: person,
        source: { kind: "upload" },
        fields: { alt: { en: filename } },
      });
    const { asset: red } = await ingest(solidPng(64, 40, [200, 40, 40]), "red.png");
    const { asset: clear } = await ingest(PNG_1X1, "clear.png");
    await local.store.updateAsset({
      ...red,
      image: { ...(red.image as NonNullable<typeof red.image>), focal: { x: 0.2, y: 0.8 } },
    });
    await local.close();

    const dry = await mediaPlaceholders({ projectDir, dryRun: true });
    expect(dry).toMatchObject({ where: "local", candidates: 2, drawn: 0, dryRun: true });

    const report = await mediaPlaceholders({ projectDir });
    expect(report).toMatchObject({ candidates: 2, drawn: 2, failed: [] });

    const after = await openLocalStore(path.join(projectDir, cfg.dataDir));
    const r = (await after.store.getAsset(red.id))?.image;
    const c = (await after.store.getAsset(clear.id))?.image;
    await after.close();
    expect(r).toMatchObject({ width: 64, height: 40, focal: { x: 0.2, y: 0.8 } });
    expect(r?.color).toMatch(/^#c[0-9a-f]2[0-9a-f]2[0-9a-f]$/);
    expect(r?.lqip).toMatch(/^data:image\/webp;base64,/);
    expect(atob(String(r?.lqip ?? "").slice(23))).not.toContain("ICCP");
    expect(c).toMatchObject({ alpha: true });
    expect(c?.lqip).toBeUndefined();

    // Done: nothing is left to draw, unless asked to redraw everything.
    expect(await mediaPlaceholders({ projectDir, dryRun: true })).toMatchObject({ candidates: 0 });
    expect(await mediaPlaceholders({ projectDir, dryRun: true, all: true })).toMatchObject({
      candidates: 2,
    });
  }, 60_000);
});
