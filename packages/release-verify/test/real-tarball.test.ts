/**
 * Opt-in: the real v0.9.0 tarball, end to end. It runs only when CLOUDHAL_RELEASE_ASSETS names a
 * directory holding the downloaded assets (`gh release download v0.9.0 --repo
 * cloudhal-dev/cloudhal --dir <dir>`); the `release-verify-v0-9-0` CI job does that. Ordinary
 * runs skip it and never touch the network.
 */
import { createReadStream, readFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { verifyRelease } from "../src/index.ts";

const DIR = process.env.CLOUDHAL_RELEASE_ASSETS;

describe.skipIf(!DIR)("the real v0.9.0 tarball", () => {
  const file = (name: string) => path.join(DIR as string, name);

  it("verifies with the pinned key and yields every listed part", async () => {
    const release = await verifyRelease({
      request: { version: "0.9.0" },
      statement: readFileSync(file("release-statement.json")),
      signature: readFileSync(file("release-statement.sig")),
      manifest: readFileSync(file("manifest.json")),
      tarball: () =>
        Readable.toWeb(
          createReadStream(file("cloudhal-release-0.9.0.tar.gz")),
        ) as unknown as ReadableStream<Uint8Array>,
      planVersion: 1,
    });
    const m = release.manifest;
    const listed =
      m.workers.site.modules.length +
      m.workers.site.assets.files.length +
      m.workers.admin.modules.length +
      m.workers.admin.assets.files.length +
      (m.starter.kind === "bundle" ? 1 : 0);
    let n = 0;
    for await (const e of release.entries()) {
      n++;
      if (e.kind === "module") expect(e.type).toBeDefined();
    }
    expect(n).toBe(listed);
  }, 120_000);
});
