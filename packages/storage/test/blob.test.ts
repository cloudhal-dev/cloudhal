import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FsBlobStore } from "../src/blob/fs.ts";
import { MemoryBlobStore } from "../src/blob/memory.ts";
import { R2BlobStore } from "../src/blob/r2.ts";
import { createMiniflareR2, describeBlobStoreConformance } from "../src/testing.ts";

describeBlobStoreConformance("memory", { create: async () => new MemoryBlobStore() });

let dir: string | undefined;
describeBlobStoreConformance("fs", {
  async create() {
    dir ??= await mkdtemp(path.join(os.tmpdir(), "cloudhal-blob-"));
    return new FsBlobStore(dir);
  },
  async dispose() {
    if (dir) await rm(dir, { recursive: true, force: true });
  },
});

let r2: Awaited<ReturnType<typeof createMiniflareR2>> | undefined;
describeBlobStoreConformance("r2 (Miniflare)", {
  async create() {
    r2 ??= await createMiniflareR2();
    return new R2BlobStore(r2.bucket);
  },
  async dispose() {
    await r2?.dispose();
  },
});
