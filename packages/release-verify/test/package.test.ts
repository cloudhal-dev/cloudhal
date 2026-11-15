/**
 * What keeps the package honest (RFC-0046 §11a): the pinned keys equal the key doc, the limits
 * equal the producer's, the generated files are current and import only the three runtime modules,
 * the root entry is Worker-safe, and the helpers follow §1 and §3.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LIMITS as PRODUCER_LIMITS } from "../../../scripts/release-bundle/manifest.ts";
import { releaseAssetNames as producerAssetNames } from "../../../scripts/release-bundle/statement.ts";
import { generate, OUT_DIR } from "../scripts/gen-validators.ts";
import {
  ERROR_CODES,
  foldPath,
  LIMITS,
  missingScopes,
  PINNED_KEYS,
  PINNED_ROOTS,
  releaseAssetNames,
  releaseAssetUrls,
  unsafePathReason,
  verifyKeys,
} from "../src/index.ts";
import { fixture } from "./helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../..");
const SRC = path.resolve(here, "../src");

describe("the package and its sources of truth", () => {
  const keyDoc = () =>
    readFileSync(path.join(ROOT, "docs/security/release-signing-keys.md"), "utf8")
      .split("\n")
      .filter((l) => l.startsWith("| `"))
      .map((l) => l.split("|").map((c) => c.trim()));
  const day = (d: string) => `${d}T00:00:00Z`;

  it("PINNED_KEYS is the key doc's release keys, row for row, with their windows", () => {
    // | `id` | Ed25519 | `public key` | status | since | not after |
    const rows = keyDoc().filter((r) => (r[1] as string).startsWith("`cloudhal-release-"));
    const fromDoc = Object.fromEntries(
      rows.map((r) => [
        (r[1] as string).slice(1, -1),
        {
          publicKey: (r[3] as string).slice(1, -1),
          status: r[4],
          notBefore: day(r[5] as string),
          notAfter: day(r[6] as string),
        },
      ]),
    );
    expect(fromDoc).toEqual(PINNED_KEYS);
    expect(Object.isFrozen(PINNED_KEYS)).toBe(true);
  });

  it("PINNED_ROOTS is the key doc's root keys, row for row", () => {
    // | `cloudhal-root-…` | Ed25519 | `public key` | since |
    const rows = keyDoc().filter((r) => (r[1] as string).startsWith("`cloudhal-root-"));
    const fromDoc = Object.fromEntries(
      rows.map((r) => [
        (r[1] as string).slice(1, -1),
        { publicKey: (r[3] as string).slice(1, -1) },
      ]),
    );
    expect(fromDoc).toEqual(PINNED_ROOTS);
    expect(Object.keys(PINNED_ROOTS)).toEqual(["cloudhal-root-2026a"]);
    expect(Object.isFrozen(PINNED_ROOTS)).toBe(true);
    for (const root of Object.values(PINNED_ROOTS)) expect(Object.isFrozen(root)).toBe(true);
  });

  it("the committed security/keys.json verifies with PINNED_ROOTS, byte for byte as published", async () => {
    const document = readFileSync(path.join(ROOT, "security/keys.json"));
    const signature = readFileSync(path.join(ROOT, "security/keys.json.sig"));
    // Inside its validity; the yearly re-signing (runbook, Rotation step 5) replaces both files.
    const now = new Date("2026-12-01T00:00:00Z");
    const list = await verifyKeys({ document, signature, roots: PINNED_ROOTS, now });
    expect(list.document.signing.keyId).toBe("cloudhal-root-2026a");
    expect(list.document.issuedAt).toBe("2026-11-15T07:00:45Z");
    // The same list the source holds (the source is what the next re-signing starts from).
    const source = JSON.parse(readFileSync(path.join(ROOT, "security/keys.source.json"), "utf8"));
    expect(list.document.keys).toEqual(source.keys);
    // A flipped byte, or the signature of another document, is refused.
    const flipped = new Uint8Array(document);
    flipped[flipped.indexOf(0x32)] = 0x33; // the first "2" of a date
    await expect(
      verifyKeys({ document: flipped, signature, roots: PINNED_ROOTS, now }),
    ).rejects.toMatchObject({
      code: "key-list-invalid",
    });
  });

  it("the key doc's yank key row is the committed keys.json's yank key", () => {
    const doc = readFileSync(path.join(ROOT, "docs/security/release-signing-keys.md"), "utf8");
    // | `cloudhal-yank-…` | Ed25519 | `public key` | status | since | not after | (inside a list item)
    const rows = doc
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("| `cloudhal-yank-"))
      .map((l) => l.split("|").map((c) => c.trim()));
    const keys = JSON.parse(readFileSync(path.join(ROOT, "security/keys.json"), "utf8")) as {
      keys: {
        keyId: string;
        publicKey: string;
        role: string;
        status: string;
        notBefore: string;
        notAfter: string;
      }[];
    };
    const yank = keys.keys.filter((k) => k.role === "yank");
    expect(
      rows.map((r) => ({
        keyId: (r[1] as string).slice(1, -1),
        publicKey: (r[3] as string).slice(1, -1),
        status: r[4],
        notBefore: day(r[5] as string),
        notAfter: day(r[6] as string),
      })),
    ).toEqual(yank.map(({ role: _role, ...k }) => k));
  });

  it("LIMITS and the asset names equal the producer's", () => {
    expect(LIMITS).toEqual(PRODUCER_LIMITS);
    expect(releaseAssetNames("0.9.0")).toEqual(producerAssetNames("0.9.0"));
  });

  it("the committed generated files are what the generator writes now", () => {
    const files = generate();
    expect(readdirSync(OUT_DIR).sort()).toEqual([...files.keys()].sort());
    for (const [name, text] of files)
      expect(readFileSync(path.join(OUT_DIR, name), "utf8"), `src/generated/${name}`).toBe(text);
  });

  it("the validators import only ajv's runtime helpers and ajv-formats' formats", () => {
    const js = readFileSync(path.join(OUT_DIR, "validators.js"), "utf8");
    const imports = [...js.matchAll(/^import [^;]* from "([^"]+)";$/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual([
      "ajv-formats/dist/formats.js",
      "ajv/dist/runtime/equal.js",
      "ajv/dist/runtime/ucs2length.js",
    ]);
    expect(js).not.toMatch(/new Function|\beval\(/);
  });

  it("the root entry reaches no node: module (only ./attestation may)", () => {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/^(?:import|export)[^;]*? from "([^"]+)";/gms)) {
        const spec = m[1] as string;
        expect(spec.startsWith("node:"), `${path.relative(SRC, file)} imports ${spec}`).toBe(false);
        if (spec.startsWith(".")) visit(path.resolve(path.dirname(file), spec));
      }
    };
    visit(path.join(SRC, "index.ts"));
    expect(seen.has(path.join(SRC, "attestation.ts"))).toBe(false);
    expect(seen.size).toBeGreaterThan(8);
  });

  it("error codes are unique", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});

describe("missingScopes (§3)", () => {
  const v090 = JSON.parse(new TextDecoder().decode(fixture("manifest.json")));
  const next = { requiredScopes: ["account-settings.read", "workers-scripts.admin", "d1.write"] };

  it("lets Workers Admin cover the Workers Editor of v0.9.0's manifest", () => {
    const admin = [
      "account-settings.read",
      "workers-scripts.admin",
      "d1.write",
      "workers-r2.write",
    ];
    expect(v090.requiredScopes).toContain("workers-scripts.edit");
    expect(missingScopes(v090, admin)).toEqual([]);
    expect(missingScopes(next, admin)).toEqual([]);
  });

  it("is not fooled by Object.prototype names", () => {
    expect(missingScopes(next, ["constructor", "__proto__", "toString"])).toEqual(
      next.requiredScopes,
    );
  });

  it("compares every other id exactly: Editor never covers Admin", () => {
    const editor = ["account-settings.read", "workers-scripts.edit", "d1.write"];
    expect(missingScopes(next, editor)).toEqual(["workers-scripts.admin"]);
    expect(missingScopes(v090, ["workers-scripts.admin"])).toEqual([
      "account-settings.read",
      "d1.write",
      "workers-r2.write",
    ]);
    expect(missingScopes(next, ["d1.read", "account-settings.write"])).toEqual(next.requiredScopes);
  });
});

describe("releaseAssetUrls and paths", () => {
  it("names the five assets of §1 on the release's tag", () => {
    expect(releaseAssetUrls("0.10.0-next.1").map((a) => a.url)).toEqual([
      "https://github.com/cloudhal-dev/cloudhal/releases/download/v0.10.0-next.1/cloudhal-release-0.10.0-next.1.tar.gz",
      "https://github.com/cloudhal-dev/cloudhal/releases/download/v0.10.0-next.1/manifest.json",
      "https://github.com/cloudhal-dev/cloudhal/releases/download/v0.10.0-next.1/release-statement.json",
      "https://github.com/cloudhal-dev/cloudhal/releases/download/v0.10.0-next.1/release-statement.sig",
      "https://github.com/cloudhal-dev/cloudhal/releases/download/v0.10.0-next.1/cloudhal-release-0.10.0-next.1.sigstore.json",
    ]);
  });

  it("refuses a version that could leave the release's path", () => {
    for (const v of ["../0.9.0", "0.9.0/../x", "0.9", "v0.9.0", "0.9.0-", "01.2.3", ""])
      expect(() => releaseAssetUrls(v), v).toThrow(TypeError);
  });

  it("foldPath meets the case forms file systems treat as one name", () => {
    expect(foldPath("ẞ")).toBe(foldPath("ß"));
    expect(foldPath("ß")).toBe(foldPath("SS"));
    expect(foldPath("ΐ")).toBe(foldPath("Ϊ́"));
    expect(foldPath("e\u0301")).toBe(foldPath("É"));
    expect(foldPath("a")).not.toBe(foldPath("b"));
  });

  it("unsafePathReason: each rule, and linear on a 100k-character path", () => {
    expect(unsafePathReason("chunks/a.mjs", "module")).toBeUndefined();
    expect(unsafePathReason("chunks/_.._x.mjs", "module")).toBeUndefined();
    expect(unsafePathReason("/fonts/v1/a.woff2", "asset")).toBeUndefined();
    expect(unsafePathReason("a/../b", "module")).toBe("a .. segment");
    expect(unsafePathReason("a/./b", "module")).toBe("a . segment");
    expect(unsafePathReason("a//b", "module")).toBe("an empty segment");
    expect(unsafePathReason("a/", "module")).toBe("an empty segment");
    expect(unsafePathReason("/a", "module")).toBe("a leading /");
    expect(unsafePathReason("a", "asset")).toBe("an asset path that does not start with /");
    expect(unsafePathReason("a\\b", "entry")).toBe("a backslash");
    expect(unsafePathReason("a\u007fb", "entry")).toBe("a control character");
    expect(unsafePathReason("a\nb", "entry")).toBe("a control character");
    expect(unsafePathReason(`${"é".repeat(257)}`, "entry")).toBe("longer than 512 bytes");
    const long = `${"a/".repeat(50_000)}..`;
    const t = performance.now();
    expect(unsafePathReason(long, "entry")).toBe("longer than 512 bytes");
    expect(unsafePathReason(long.slice(-400), "entry")).toBe("a .. segment");
    expect(performance.now() - t).toBeLessThan(200);
  });
});
