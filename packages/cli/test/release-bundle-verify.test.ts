import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildReleaseBundle,
  type ReleaseBundle,
  writeReleaseBundle,
} from "../../../scripts/release-bundle/build.ts";
import { canonicalJson } from "../../../scripts/release-bundle/manifest.ts";
import {
  readBuildOutput,
  readDeploySecrets,
  type SourceFile,
} from "../../../scripts/release-bundle/read-build.ts";
import { statementOf } from "../../../scripts/release-bundle/statement.ts";
import { gzipBytes, tarArchive } from "../../../scripts/release-bundle/tar.ts";
import { checkGzipHeader, gunzipBytes, readTar } from "../../../scripts/release-bundle/tar-read.ts";
import { verifyBundle } from "../../../scripts/release-bundle/verify.ts";
import { facts, fixtureProject } from "./fixtures/release-bundle/fixture.ts";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

const MTIME = Date.parse("2026-11-12T08:00:00Z") / 1000;
const enc = new TextEncoder();

async function bundleDir(version = "0.8.0"): Promise<{ dir: string; b: ReleaseBundle }> {
  const fx = fixtureProject();
  roots.push(fx.root);
  const out = readBuildOutput({ project: fx.project, studio: fx.studio });
  const secrets = readDeploySecrets(path.join(fx.project, ".cloudhal/deploy/secrets.json"));
  const b = await buildReleaseBundle(out, facts({ version }), secrets);
  const dir = mkdtempSync(path.join(os.tmpdir(), "release-bundle-out-"));
  roots.push(dir);
  writeReleaseBundle(b, dir);
  return { dir, b };
}

/** A throwaway key: raw public half (base64) and a signer. */
function throwaway() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const raw = (publicKey.export({ format: "jwk" }) as { x: string }).x;
  return {
    publicKey: Buffer.from(raw, "base64url").toString("base64"),
    sign: (b: Uint8Array) => sign(null, b, privateKey),
  };
}

/** Replaces the tarball with one of `entries` and re-pins it in the statement. */
async function retar(dir: string, b: ReleaseBundle, tar: Uint8Array): Promise<void> {
  const gz = await gzipBytes(tar);
  const { bytes } = statementOf(b.statement, b.manifestBytes, gz);
  writeFileSync(path.join(dir, "cloudhal-release-0.8.0.tar.gz"), gz);
  writeFileSync(path.join(dir, "release-statement.json"), bytes);
}

const entriesOf = async (b: ReleaseBundle): Promise<SourceFile[]> =>
  readTar(await gunzipBytes(b.tarball), MTIME);

describe("verifyBundle", () => {
  it("accepts the builder's own output, unsigned and signed with a pinned key", async () => {
    const { dir, b } = await bundleDir();
    expect((await verifyBundle(dir, { version: "0.8.0" })).parts).toBe(b.parts.length);
    const k = throwaway();
    writeFileSync(path.join(dir, "release-statement.sig"), k.sign(b.statementBytes));
    const r = await verifyBundle(dir, {
      version: "0.8.0",
      signed: true,
      publicKeys: { "cloudhal-release-2026a": k.publicKey },
    });
    expect(r.statement.signing.keyId).toBe("cloudhal-release-2026a");
  });

  it("refuses a signature by another key, a missing signature and an unknown key id", async () => {
    const { dir, b } = await bundleDir();
    const signed = (keys: Record<string, string>) =>
      verifyBundle(dir, { version: "0.8.0", signed: true, publicKeys: keys });
    await expect(signed({ "cloudhal-release-2026a": throwaway().publicKey })).rejects.toThrow(
      /release-statement\.sig is missing/,
    );
    writeFileSync(path.join(dir, "release-statement.sig"), throwaway().sign(b.statementBytes));
    await expect(signed({ "cloudhal-release-2026a": throwaway().publicKey })).rejects.toThrow(
      /does not verify/,
    );
    await expect(signed({ other: throwaway().publicKey })).rejects.toThrow(
      /no pinned public key for cloudhal-release-2026a/,
    );
  });

  it("binds the statement to the requested version and channel (invariant 7)", async () => {
    const { dir } = await bundleDir();
    await expect(verifyBundle(dir, { version: "0.8.1" })).rejects.toThrow(
      /for 0\.8\.0, not 0\.8\.1/,
    );
    await expect(verifyBundle(dir, { version: "0.8.0", channel: "next" })).rejects.toThrow(
      /channel stable, not next/,
    );
  });

  it("refuses a statement that is not its canonical serialisation", async () => {
    const { dir, b } = await bundleDir();
    writeFileSync(path.join(dir, "release-statement.json"), JSON.stringify(b.statement));
    await expect(verifyBundle(dir, { version: "0.8.0" })).rejects.toThrow(/not canonical JSON/);
  });

  it("refuses a manifest or tarball the statement does not pin", async () => {
    const { dir, b } = await bundleDir();
    const m = JSON.parse(new TextDecoder().decode(b.manifestBytes));
    writeFileSync(path.join(dir, "manifest.json"), canonicalJson({ ...m, securityRelease: true }));
    await expect(verifyBundle(dir, { version: "0.8.0" })).rejects.toThrow(
      /manifest\.json does not match the statement/,
    );
    writeReleaseBundle(b, dir);
    const gz = new Uint8Array(b.tarball);
    gz[gz.length - 20] = (gz[gz.length - 20] as number) ^ 1;
    writeFileSync(path.join(dir, "cloudhal-release-0.8.0.tar.gz"), gz);
    await expect(verifyBundle(dir, { version: "0.8.0" })).rejects.toThrow(
      /tar\.gz does not match the statement/,
    );
  });

  it("refuses an unlisted entry, a missing part and a changed part, even when re-pinned", async () => {
    const { dir, b } = await bundleDir();
    const entries = await entriesOf(b);
    const extra = [...entries, { path: "site/modules/zz-extra.mjs", bytes: enc.encode("x") }];
    await retar(dir, b, tarArchive(extra, MTIME));
    await expect(verifyBundle(dir, { version: "0.8.0" })).rejects.toThrow(
      /zz-extra\.mjs is in the tarball but not in the manifest/,
    );
    await retar(dir, b, tarArchive(entries.slice(1), MTIME));
    await expect(verifyBundle(dir, { version: "0.8.0" })).rejects.toThrow(
      /is in the manifest but not in the tarball/,
    );
    const changed = entries.map((e, i) => (i === 0 ? { ...e, bytes: enc.encode("changed") } : e));
    await retar(dir, b, tarArchive(changed, MTIME));
    await expect(verifyBundle(dir, { version: "0.8.0" })).rejects.toThrow(
      /does not match the manifest's size and SHA-256/,
    );
    await retar(dir, b, tarArchive([...entries].reverse(), MTIME));
    await expect(verifyBundle(dir, { version: "0.8.0" })).rejects.toThrow(/not sorted/);
    await retar(dir, b, tarArchive(entries, MTIME + 1));
    await expect(verifyBundle(dir, { version: "0.8.0" })).rejects.toThrow(/mtime is not createdAt/);
  });
});

describe("the producer's self-check runs the consumer's rules (RFC-0046 §11a, #232)", () => {
  /** An unsigned bundle of the fixture build with `edit` applied to its build output first. */
  async function built(edit: (out: ReturnType<typeof readBuildOutput>) => void): Promise<string> {
    const fx = fixtureProject();
    roots.push(fx.root);
    const out = readBuildOutput({ project: fx.project, studio: fx.studio });
    edit(out);
    const secrets = readDeploySecrets(path.join(fx.project, ".cloudhal/deploy/secrets.json"));
    const b = await buildReleaseBundle(out, facts({ version: "0.8.0" }), secrets);
    const dir = mkdtempSync(path.join(os.tmpdir(), "release-bundle-out-"));
    roots.push(dir);
    writeReleaseBundle(b, dir);
    return dir;
  }
  const addAsset = (p: string) => (out: ReturnType<typeof readBuildOutput>) => {
    (out.site.assets as { path: string; bytes: Uint8Array }[]).push({
      path: p,
      bytes: enc.encode("x"),
    });
  };

  it("refuses assets that collide after case folding, unsigned", async () => {
    // Built in memory: a case-insensitive file system could not hold both files.
    const dir = await built(addAsset("/FAVICON.svg"));
    await expect(verifyBundle(dir, { version: "0.8.0" })).rejects.toMatchObject({
      code: "entry-path",
      message: expect.stringMatching(/collide/),
    });
  });

  it("refuses a path over 512 bytes and a .. segment, unsigned", async () => {
    const long = await built(
      addAsset(`/${"a".repeat(200)}/${"b".repeat(200)}/${"c".repeat(200)}.svg`),
    );
    await expect(verifyBundle(long, { version: "0.8.0" })).rejects.toMatchObject({
      code: "entry-path",
    });
    const dots = await built(addAsset("/x/../y.svg"));
    await expect(verifyBundle(dots, { version: "0.8.0" })).rejects.toMatchObject({
      code: "entry-path",
    });
  });

  it("writes and reads long non-ASCII names with one byte rule (PAX + ustar name)", async () => {
    const names = [`/${"界".repeat(30)}.txt`, `/x${"é".repeat(50)}`, `/${"😀".repeat(30)}`];
    const dir = await built((out) => {
      for (const n of names) addAsset(n)(out);
    });
    await expect(verifyBundle(dir, { version: "0.8.0" })).resolves.toMatchObject({});
  });
});

describe("tar and gzip format checks", () => {
  const file = { path: "site/modules/a.mjs", bytes: enc.encode("a") };

  it("round-trips long PAX paths", () => {
    const long = { path: `site/assets/${"x".repeat(150)}.css`, bytes: enc.encode("b") };
    expect(readTar(tarArchive([file, long], MTIME), MTIME).map((e) => e.path)).toEqual([
      file.path,
      long.path,
    ]);
  });

  it("refuses links, other modes, owners and a broken checksum", () => {
    const tar = tarArchive([file], MTIME);
    const patched = (at: number, value: string, reseal = true) => {
      const t = new Uint8Array(tar);
      t.set(enc.encode(value), at);
      if (reseal) {
        t.fill(0x20, 148, 156);
        let sum = 0;
        for (let i = 0; i < 512; i++) sum += t[i] as number;
        t.set(enc.encode(`${sum.toString(8).padStart(6, "0")}\0 `), 148);
      }
      return t;
    };
    expect(() => readTar(patched(156, "2"), MTIME)).toThrow(/type 2: not a file/);
    expect(() => readTar(patched(100, "0000755"), MTIME)).toThrow(/mode is not 0644/);
    expect(() => readTar(patched(108, "0000001"), MTIME)).toThrow(/uid or gid/);
    expect(() => readTar(patched(265, "root"), MTIME)).toThrow(/owner name/);
    expect(() => readTar(patched(0, "z", false), MTIME)).toThrow(/bad checksum/);
    expect(() => readTar(tar.subarray(0, 1024), MTIME)).toThrow(/truncated|zero blocks/);
  });

  it("refuses a gzip header that is not the fixed one", async () => {
    const gz = await gzipBytes(tarArchive([file], MTIME));
    expect(() => checkGzipHeader(gz)).not.toThrow();
    const os3 = new Uint8Array(gz);
    os3[9] = 3;
    expect(() => checkGzipHeader(os3)).toThrow(/OS byte/);
    const mtime = new Uint8Array(gz);
    mtime[4] = 1;
    expect(() => checkGzipHeader(mtime)).toThrow(/fixed one/);
  });
});
