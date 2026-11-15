/**
 * Extraction of a verified release (RFC-0046 §11b): a fresh directory every time (no stale
 * files), nothing outside it, no file written twice, `_headers` from the manifest. The verifier
 * already refuses unsafe paths and duplicates; these are the deployer's own second line.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { VerifiedEntry, VerifiedRelease } from "@cloudhal/release-verify";
import { afterEach, describe, expect, it } from "vitest";
import { extractRelease } from "../src/commands/deploy/release/extract.ts";
import { cleanup, tmp } from "./fixtures/release-deploy.ts";

afterEach(cleanup);

const bytes = (s: string) => new TextEncoder().encode(s);
const worker = (main: string, headers = "") => ({
  mainModule: main,
  modules: [{ path: main, type: "esm", bytes: 1, sha256: "0".repeat(64) }],
  assets: { count: 0, bytes: 0, files: [], headers },
});

function release(entries: Partial<VerifiedEntry>[]): VerifiedRelease {
  return {
    statement: {} as VerifiedRelease["statement"],
    manifest: {
      workers: { site: worker("entry.mjs", "/*\n  X-A: 1\n"), admin: worker("worker.js") },
    } as unknown as VerifiedRelease["manifest"],
    async *entries() {
      for (const e of entries) yield { tarPath: "", bytes: bytes("x"), ...e } as VerifiedEntry;
    },
  };
}

describe("extractRelease", () => {
  it("writes into a fresh directory: stale files go, _headers comes from the manifest", async () => {
    const dir = path.join(tmp("extract-"), "release/0.9.0");
    await mkdir(path.join(dir, "site/assets"), { recursive: true });
    await writeFile(path.join(dir, "site/assets/stale.html"), "old");
    const r = await extractRelease(
      release([
        { worker: "site", kind: "module", path: "entry.mjs" },
        { worker: "site", kind: "asset", path: "/index.html" },
        { worker: null, kind: "starter", path: "starter/site.cloudhal" },
      ]),
      dir,
    );
    expect(r.files).toBe(2);
    expect(existsSync(path.join(dir, "site/assets/stale.html"))).toBe(false);
    expect(await readFile(path.join(dir, "site/assets/_headers"), "utf8")).toBe("/*\n  X-A: 1\n");
    expect(existsSync(path.join(dir, "admin/assets/_headers"))).toBe(false);
    expect(r.site.modulesByType).toEqual({ esm: ["entry.mjs"] });
  });

  it("refuses an entry outside the directory and an entry written twice", async () => {
    const dir = path.join(tmp("extract-"), "release/0.9.0");
    await expect(
      extractRelease(release([{ worker: "site", kind: "module", path: "../../escape.mjs" }]), dir),
    ).rejects.toMatchObject({ code: "extract-unsafe" });
    expect(existsSync(path.join(dir, "../escape.mjs"))).toBe(false);
    await expect(
      extractRelease(
        release([
          { worker: "site", kind: "asset", path: "/a.txt" },
          { worker: "site", kind: "asset", path: "/a.txt" },
        ]),
        dir,
      ),
    ).rejects.toMatchObject({ code: "extract-unsafe", message: expect.stringContaining("twice") });
  });
});
