/**
 * RFC-0046 §11a on small synthetic bundles signed with a throwaway key: every refusal that needs a
 * tampered but validly signed bundle (editing the real manifest only ever reaches
 * `manifest-mismatch`), the two-pass tarball reads, and entry-path safety.
 */
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { tarHeader } from "../../../scripts/release-bundle/tar.ts";
import { type ReleaseVerifyErrorCode, type VerifiedEntry, verifyRelease } from "../src/index.ts";
import { chunked, flip, type Synthetic, type SyntheticOptions, synthetic } from "./helpers.ts";

/** The refusal code of verifying and then reading every entry, or "ok". */
async function codeOf(b: Synthetic | Promise<Synthetic>): Promise<ReleaseVerifyErrorCode | "ok"> {
  try {
    const r = await verifyRelease((await b).input);
    for await (const _ of r.entries()) {
      // drain
    }
    return "ok";
  } catch (e) {
    const code = (e as { code?: ReleaseVerifyErrorCode }).code;
    if (!code) throw e;
    return code;
  }
}
const make = (o: SyntheticOptions) => synthetic(o);

describe("a valid synthetic bundle", () => {
  it("verifies and yields every listed part once, with its manifest facts", async () => {
    const b = await synthetic();
    const r = await verifyRelease(b.input);
    const got: VerifiedEntry[] = [];
    for await (const e of r.entries()) got.push(e);
    expect(got).toHaveLength(b.listed);
    expect(got.map((e) => e.tarPath)).toEqual([
      "admin/assets/app.js",
      "admin/modules/worker.js",
      "site/assets/fonts/v1/a.woff2",
      "site/assets/index.html",
      "site/modules/chunks/page.mjs",
      "site/modules/entry.mjs",
    ]);
    const entry = got.find((e) => e.tarPath === "site/modules/entry.mjs");
    expect(entry).toMatchObject({ worker: "site", kind: "module", path: "entry.mjs", type: "esm" });
    expect(new TextDecoder().decode(entry?.bytes)).toContain("site");
    expect(got.find((e) => e.kind === "asset" && e.worker === "site")?.path).toBe(
      "/fonts/v1/a.woff2",
    );
  });

  it("reads the tarball from a stream in odd-sized chunks, twice", async () => {
    const b = await synthetic();
    let opened = 0;
    const r = await verifyRelease({
      ...b.input,
      tarball: () => {
        opened++;
        return chunked(b.tarball, 7);
      },
    });
    let n = 0;
    for await (const _ of r.entries()) n++;
    expect([opened, n]).toEqual([2, b.listed]);
  });

  it("lets a consumer stop early without hanging", async () => {
    const b = await synthetic();
    const r = await verifyRelease({ ...b.input, tarball: () => chunked(b.tarball, 64) });
    for await (const _ of r.entries()) break;
  });
});

describe("refusals that need a validly signed bundle", () => {
  it("a manifest whose version is not the statement's (invariant 5)", async () => {
    expect(await codeOf(make({ manifest: (m) => (m.version = "0.9.1") }))).toBe(
      "statement-manifest-mismatch",
    );
    expect(await codeOf(make({ manifest: (m) => (m.commit = "f".repeat(40)) }))).toBe(
      "statement-manifest-mismatch",
    );
  });

  it("a manifest that names the legacy manifest.sig, or is not valid", async () => {
    const legacy = (m: Record<string, unknown>) => {
      (m.signing as Record<string, unknown>).signature = "manifest.sig";
    };
    expect(await codeOf(make({ manifest: legacy }))).toBe("manifest-invalid");
    expect(await codeOf(make({ manifest: (m) => (m.extra = true) }))).toBe("manifest-invalid");
  });

  it("statement invariants the schema cannot express (1 and 3)", async () => {
    expect(
      await codeOf(
        make({ statement: (s) => ((s.manifest as Record<string, unknown>).name = "other.json") }),
      ),
    ).toBe("statement-invalid");
    const b = await make({ statement: (s) => (s.channel = "next") });
    const r = await verifyRelease({
      ...b.input,
      request: { version: "0.9.0", channel: "next" },
    }).catch((e: { code: string }) => e.code);
    expect(r).toBe("statement-invalid");
  });

  it("a manifest above 1,900,000 bytes (invariant 2)", async () => {
    const s = (st: Record<string, unknown>) =>
      ((st.manifest as Record<string, unknown>).bytes = 2_000_000);
    expect(await codeOf(make({ statement: s }))).toBe("statement-invalid");
  });

  it("a tarball that is not the one the statement pins", async () => {
    const b = await synthetic();
    const input = { ...b.input, tarball: () => flip(b.tarball) };
    expect(await codeOf({ ...b, input })).toBe("tarball-mismatch");
    const longer = new Uint8Array(b.tarball.length + 1);
    longer.set(b.tarball);
    expect(await codeOf({ ...b, input: { ...b.input, tarball: () => longer } })).toBe(
      "tarball-mismatch",
    );
  });

  it("an unlisted, a missing and a changed entry", async () => {
    const extra = (e: { path: string; bytes: Uint8Array }[]) => {
      e.push({ path: "site/modules/extra.mjs", bytes: new Uint8Array([1]) });
    };
    expect(await codeOf(make({ entries: extra }))).toBe("entry-unlisted");
    const drop = (e: { path: string; bytes: Uint8Array }[]) => {
      e.splice(
        e.findIndex((x) => x.path === "admin/assets/app.js"),
        1,
      );
    };
    expect(await codeOf(make({ entries: drop }))).toBe("entry-missing");
    const sameSize = (e: { path: string; bytes: Uint8Array }[]) => {
      const x = e.find((y) => y.path === "site/assets/index.html");
      if (x) x.bytes = flip(x.bytes);
    };
    expect(await codeOf(make({ entries: sameSize }))).toBe("entry-mismatch");
    const longer = (e: { path: string; bytes: Uint8Array }[]) => {
      const x = e.find((y) => y.path === "site/assets/index.html");
      if (x) x.bytes = new Uint8Array([...x.bytes, 0x0a]);
    };
    expect(await codeOf(make({ entries: longer }))).toBe("entry-mismatch");
  });

  it("planVersion above what the caller supports", async () => {
    const b = await synthetic({ manifest: (m) => (m.planVersion = 2) });
    expect(await codeOf({ ...b, input: { ...b.input, planVersion: 1 } })).toBe(
      "plan-version-unsupported",
    );
  });
});

describe("entry-path", () => {
  const module =
    (p: string) => (m: { workers: Record<"site" | "admin", Record<string, unknown>> }) => {
      const mods = m.workers.site.modules as { path: string }[];
      (mods[0] as { path: string }).path = p;
    };

  it("refuses .. and . segments in a listing before the tarball is read", async () => {
    let read = 0;
    for (const p of ["../evil.mjs", "chunks/../../evil.mjs", "./entry.mjs", "chunks/./x.mjs"]) {
      const b = await synthetic({ manifest: module(p) });
      const code = await verifyRelease({
        ...b.input,
        tarball: () => {
          read++;
          return b.tarball;
        },
      }).catch((e: { code: string }) => e.code);
      expect(code, p).toBe("entry-path");
    }
    expect(read).toBe(0);
  });

  it("refuses unsafe asset paths and paths that fold to the same name", async () => {
    // files[0] is /index.html, files[1] /fonts/v1/a.woff2 (helpers.ts).
    const asset =
      (p: string) => (m: { workers: Record<"site" | "admin", Record<string, unknown>> }) => {
        const files = (m.workers.site.assets as { files: { path: string }[] }).files;
        (files[1] as { path: string }).path = p;
      };
    for (const p of ["/fonts/../../etc/passwd", "/./a", "//a", "/a\\b", "/a\u0001b", "/"])
      expect(await codeOf(make({ manifest: asset(p) })), p).toBe("entry-path");
    expect(await codeOf(make({ manifest: asset("/Index.html") }))).toBe("entry-path");
    expect(await codeOf(make({ manifest: asset("/INDEX.HTML") }))).toBe("entry-path");
    // modules[0] is entry.mjs, modules[1] chunks/page.mjs.
    expect(await codeOf(make({ manifest: module("Chunks/Page.mjs") }))).toBe("entry-path");
  });

  it("refuses unsafe tar entry names before anything else about them", async () => {
    for (const p of ["site/modules/../x.mjs", "site/modules/a\\b.mjs", "site//modules/x.mjs"]) {
      const add = (e: { path: string; bytes: Uint8Array }[]) => {
        e.push({ path: p, bytes: new Uint8Array([1]) });
      };
      expect(await codeOf(make({ entries: add })), p).toBe("entry-path");
    }
  });
});

describe("tar format (§7)", () => {
  it("refuses a gzip header that is not the fixed one", async () => {
    const zlib = async (tar: Uint8Array) => new Uint8Array(gzipSync(tar));
    expect(await codeOf(make({ compress: zlib }))).toBe("tar-format");
  });

  it("refuses an entry whose mtime is not createdAt", async () => {
    expect(await codeOf(make({ mtime: 1 }))).toBe("tar-format");
  });

  it("refuses data after the end blocks and a missing second end block", async () => {
    const junk = (tar: Uint8Array) => new Uint8Array([...tar, 1, ...new Uint8Array(511)]);
    expect(await codeOf(make({ tar: junk }))).toBe("tar-format");
    const short = (tar: Uint8Array) => tar.subarray(0, tar.length - 512);
    expect(await codeOf(make({ tar: short }))).toBe("tar-format");
  });

  it("refuses a directory entry and an entry above the part limit", async () => {
    const dir = (tar: Uint8Array) => {
      const h = tarHeader("site/modules/dir", 0, "0", Date.parse("2026-11-13T16:13:20Z") / 1000);
      h[156] = "5".charCodeAt(0);
      let sum = 0;
      for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : (h[i] as number);
      h.set(new TextEncoder().encode(`${sum.toString(8).padStart(6, "0")}\0 `), 148);
      return new Uint8Array([...h, ...tar]);
    };
    expect(await codeOf(make({ tar: dir }))).toBe("tar-format");
    const huge = (tar: Uint8Array) => {
      const h = tarHeader(
        "site/modules/huge",
        64 * 1024 * 1024 + 1,
        "0",
        Date.parse("2026-11-13T16:13:20Z") / 1000,
      );
      return new Uint8Array([...h, ...tar]);
    };
    expect(await codeOf(make({ tar: huge }))).toBe("limit-exceeded");
  });
});
