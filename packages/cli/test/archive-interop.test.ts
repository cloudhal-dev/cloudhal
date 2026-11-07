/**
 * RFC-0039 §1: a `.cloudhal` file is a standard gzipped ustar. The system `tar` (bsdtar on macOS,
 * GNU tar on Linux CI) lists exactly the archive's paths and extracts identical bytes. Skipped
 * where no `tar` is installed.
 */
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeArchiveFile } from "../src/archive/index.ts";
import { encodeManifest } from "../src/archive/manifest.ts";
import { MEDIA, same, sampleContent, sha256 } from "./archive-fixture.ts";

const hasTar = spawnSync("tar", ["--version"], { stdio: "ignore" }).status === 0;

describe.skipIf(!hasTar)("system tar", () => {
  it("lists and extracts the archive", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "archive-interop-"));
    try {
      const file = path.join(dir, "site.cloudhal");
      const content = sampleContent();
      const manifest = await writeArchiveFile(file, content);
      const list = spawnSync("tar", ["-tzf", file], { encoding: "utf8" });
      expect(list.status, list.stderr).toBe(0);
      expect(list.stdout.split("\n").filter(Boolean)).toEqual([
        "manifest.json",
        ...manifest.files.map((f) => f.path),
      ]);
      const out = path.join(dir, "out");
      await mkdir(out);
      const extract = spawnSync("tar", ["-xzf", file, "-C", out], { encoding: "utf8" });
      expect(extract.status, extract.stderr).toBe(0);
      const read = (p: string) => readFile(path.join(out, p));
      expect(same(await read("manifest.json"), encodeManifest(manifest))).toBe(true);
      expect(same(await read("project.json"), content.project as Uint8Array)).toBe(true);
      expect(same(await read("ledger.ndjson"), content.ledger as Uint8Array)).toBe(true);
      for (const [i, part] of content.nodes.entries())
        expect(same(await read(`nodes/${String(i + 1).padStart(4, "0")}.ndjson`), part)).toBe(true);
      for (const m of MEDIA) expect(same(await read(`media/${sha256(m)}`), m)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
