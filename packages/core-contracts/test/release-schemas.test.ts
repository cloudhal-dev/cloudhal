/**
 * RFC-0046: the two release roots, `release-manifest` and `release-statement`.
 *
 * Portability: a remote deployer may keep its own copy of both schemas under its own `$id`. The
 * copies must stay identical to these except the root `$id` and the root `description`.
 * `RELEASE_SCHEMA_FINGERPRINTS` is the SHA-256 of each root's canonical JSON without those two
 * keys; a consumer's test pins the same constants, so a change here fails until it is carried to
 * every copy (and the constants are updated on both sides in the same change).
 *
 * Fingerprint canonical JSON: object keys sorted by UTF-16 code unit (`Array.prototype.sort`),
 * arrays in order, primitives as `JSON.stringify` writes them, no whitespace; SHA-256 as lower-case
 * hex over the UTF-8 bytes. Equal to
 * `jq -cS 'del(."$id", .description)' <schema> | tr -d '\n' | sha256sum` for these ASCII schemas.
 */
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INDEX_EXPORTS } from "../scripts/schema-list.ts";
import { isValid } from "../src/validate.ts";

/** Shared with every portable copy of the two roots; update all of them in the same change. */
export const RELEASE_SCHEMA_FINGERPRINTS = {
  "release-manifest": "620fa5848e9bd82f885cd72f7fba65529050bc23b3ccf6ec1ef1860dd2aa60aa",
  "release-statement": "462eab7d3ca77f0cd2107d533c8f3e8ac201db65e8162cac6ff2b7ab96a38e59",
} as const;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type JsonObject = { [k: string]: Json };

export function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k] as Json)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function schemaFingerprint(schema: JsonObject): string {
  const { $id: _id, description: _description, ...rest } = schema;
  return createHash("sha256").update(canonicalJson(rest), "utf8").digest("hex");
}

/** RFC-0046 §1 file bytes: keys sorted recursively, 2-space indent, trailing newline. */
function sortedDeep(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortedDeep);
  if (value !== null && typeof value === "object") {
    const out: JsonObject = {};
    for (const k of Object.keys(value).sort()) out[k] = sortedDeep(value[k] as Json);
    return out;
  }
  return value;
}
const fileBytes = (doc: Json) => Buffer.from(`${JSON.stringify(sortedDeep(doc), null, 2)}\n`);

const here = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(here, "..");
const REPO = path.resolve(PKG, "../..");
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8")) as JsonObject;
const loadSchema = (name: string) => readJson(path.join(PKG, `schemas/${name}.schema.json`));
async function fixtures(kind: "valid" | "invalid", name: string): Promise<[string, JsonObject][]> {
  const dir = path.join(PKG, "fixtures", kind, name);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(files.map(async (f) => [f, await readJson(path.join(dir, f))] as const));
}

const manifest = await loadSchema("release-manifest");
const statement = await loadSchema("release-statement");
const ROOTS = Object.keys(
  RELEASE_SCHEMA_FINGERPRINTS,
) as (keyof typeof RELEASE_SCHEMA_FINGERPRINTS)[];

describe("release schema fingerprints (portable copies stay identical)", () => {
  it.each(ROOTS)("%s matches the shared constant", async (name) => {
    expect(schemaFingerprint(await loadSchema(name))).toBe(RELEASE_SCHEMA_FINGERPRINTS[name]);
  });

  it.each(ROOTS)("%s has this repository's permanent $id (ADR-0037)", async (name) => {
    expect((await loadSchema(name)).$id).toBe(
      `https://cloudhal.dev/schemas/v1/${name}.schema.json`,
    );
  });

  it("ignores only the root $id and description", () => {
    const base = schemaFingerprint(statement);
    expect(schemaFingerprint({ ...statement, $id: "https://example.test/x" })).toBe(base);
    expect(schemaFingerprint({ ...statement, description: "other wording" })).toBe(base);
    expect(schemaFingerprint({ ...statement, title: "Other" })).not.toBe(base);
    const defs = statement.$defs as JsonObject;
    expect(
      schemaFingerprint({ ...statement, $defs: { ...defs, Extra: { type: "string" } } }),
    ).not.toBe(base);
  });

  it("canonical JSON sorts keys recursively and keeps array order", () => {
    expect(canonicalJson({ b: [2, 1, { d: 1, c: "x" }], a: null })).toBe(
      '{"a":null,"b":[2,1,{"c":"x","d":1}]}',
    );
  });

  it("references common only for SchemaVersion and Timestamp", () => {
    for (const root of [manifest, statement]) {
      const refs = [...JSON.stringify(root).matchAll(/"\$ref":"(common[^"]*)"/g)].map((m) => m[1]);
      expect(new Set(refs)).toEqual(
        new Set(["common.schema.json#/$defs/SchemaVersion", "common.schema.json#/$defs/Timestamp"]),
      );
    }
  });
});

describe("release-statement shape (RFC-0046 §2)", () => {
  const props = statement.properties as { [k: string]: JsonObject };
  const defs = statement.$defs as { [k: string]: JsonObject };
  const signingOf = (root: JsonObject) =>
    ((root.properties as { [k: string]: JsonObject }).signing as { properties: JsonObject })
      .properties as { [k: string]: { enum?: Json[] } };

  it("copies CloudhalVersion and Sha256Hex byte for byte from the manifest", () => {
    const mdefs = manifest.$defs as JsonObject;
    expect(JSON.stringify(defs.CloudhalVersion)).toBe(JSON.stringify(mdefs.CloudhalVersion));
    expect(JSON.stringify(defs.Sha256Hex)).toBe(JSON.stringify(mdefs.Sha256Hex));
  });

  it("is signed only in the statement form; the manifest admits both forms", () => {
    const signing = signingOf(statement);
    const msigning = signingOf(manifest);
    expect(signing.signature?.enum).toEqual(["release-statement.sig"]);
    expect(signing.algorithm?.enum).toEqual(["Ed25519"]);
    expect(msigning.signature?.enum).toEqual(["manifest.sig", "release-statement.sig"]);
    // Both documents must name the same key, so they share one key id grammar.
    expect(JSON.stringify(signing.keyId)).toBe(JSON.stringify(msigning.keyId));
  });

  it("names exactly the RFC fields, all required", () => {
    expect(statement.required).toEqual([
      "schemaVersion",
      "format",
      "version",
      "channel",
      "securityRelease",
      "commit",
      "createdAt",
      "signing",
      "manifest",
      "tarball",
    ]);
    expect(Object.keys(props).sort()).toEqual([...(statement.required as string[])].sort());
    expect(props.format?.enum).toEqual(["cloudhal.release-statement@1"]);
    expect(props.channel?.enum).toEqual(["stable", "next"]);
    const asset = defs.StatementAsset?.properties as { [k: string]: JsonObject };
    expect(asset.bytes).toEqual({ type: "integer", minimum: 1, maximum: 104857600 });
  });
});

describe("release fixtures", () => {
  const PRERELEASE = /-/;

  it("valid statements cover stable, next and security releases and keep the RFC invariants", async () => {
    const valid = await fixtures("valid", "release-statement");
    expect(valid.map(([f]) => f)).toEqual(["next-prerelease.json", "security.json", "stable.json"]);
    for (const [file, doc] of valid) {
      const version = doc.version as string;
      const m = doc.manifest as JsonObject;
      const t = doc.tarball as JsonObject;
      expect(m.name, file).toBe("manifest.json");
      expect(t.name, file).toBe(`cloudhal-release-${version}.tar.gz`);
      expect(m.bytes as number, file).toBeLessThanOrEqual(1_900_000);
      expect(doc.channel === "next", file).toBe(PRERELEASE.test(version));
      expect(fileBytes(doc).length, file).toBeLessThanOrEqual(4096);
      expect(doc.createdAt as string, file).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    }
    expect(valid.find(([f]) => f === "security.json")?.[1].securityRelease).toBe(true);
    expect(valid.find(([f]) => f === "next-prerelease.json")?.[1].channel).toBe("next");
  });

  it("invalid statements cover every refused shape", async () => {
    const names = (await fixtures("invalid", "release-statement")).map(([f]) => f);
    for (const required of [
      "missing-tarball.json",
      "bad-format.json",
      "sig-name-wrong.json",
      "key-id-bad.json",
      "sha-short.json",
      "bytes-zero.json",
      "extra-field.json",
    ])
      expect(names).toContain(required);
  });

  it("a statement form manifest exists and validates; a manifest.sig statement does not", async () => {
    const valid = await fixtures("valid", "release-manifest");
    const signed = valid.filter(
      ([, doc]) => (doc.signing as JsonObject).signature === "release-statement.sig",
    );
    expect(signed.length).toBeGreaterThan(0);
    for (const [, doc] of signed) expect(isValid("release-manifest", doc)).toBe(true);
    const [, stable] = (await fixtures("valid", "release-statement"))[2] as [string, JsonObject];
    const asManifestSig = {
      ...stable,
      signing: { ...(stable.signing as JsonObject), signature: "manifest.sig" },
    };
    expect(isValid("release-statement", stable)).toBe(true);
    expect(isValid("release-statement", asManifestSig)).toBe(false);
  });
});

describe("package root exports of the release roots", async () => {
  const index = await readFile(path.join(PKG, "src/generated/index.ts"), "utf8");
  const exported = (root: string) => {
    const line = index.split("\n").find((l) => l.endsWith(` from "./${root}.ts";`));
    return line?.match(/^export type \{ (.*) \} from/)?.[1]?.split(", ") ?? [];
  };

  it("re-export only the release-specific names, never the portable local $defs", () => {
    expect(exported("release-manifest")).toEqual([
      "ReleaseManifest",
      "WorkerArtifact",
      "BindingTemplate",
    ]);
    expect(exported("release-statement")).toEqual(["ReleaseStatement", "StatementAsset"]);
    expect(INDEX_EXPORTS["release-manifest"]).toEqual(exported("release-manifest"));
    expect(INDEX_EXPORTS["release-statement"]).toEqual(exported("release-statement"));
    const all = [...index.matchAll(/^export type \{ (.*) \} from/gm)].flatMap((m) =>
      (m[1] as string).split(", "),
    );
    for (const local of Object.keys(manifest.$defs as JsonObject)) {
      if (!["WorkerArtifact", "BindingTemplate"].includes(local)) expect(all).not.toContain(local);
    }
  });
});

/** SPKI DER of an Ed25519 public key: this 12-byte prefix plus the raw 32 bytes. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const keyFromRaw = (raw: Buffer) =>
  createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });

describe("statement signatures (RFC-0046 §2, with a throwaway key)", () => {
  it("verify over the exact bytes and fail after any change, including re-serialisation", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const raw = publicKey.export({ format: "der", type: "spki" }).subarray(12);
    expect(raw.length).toBe(32);
    const [, doc] = (await fixtures("valid", "release-statement"))[2] as [string, JsonObject];
    const bytes = fileBytes(doc);
    const sig = sign(null, bytes, privateKey);
    expect(sig.length).toBe(64);
    expect(verify(null, bytes, keyFromRaw(raw), sig)).toBe(true);

    const reserialised = Buffer.from(JSON.stringify(JSON.parse(bytes.toString("utf8"))));
    expect(reserialised.equals(bytes)).toBe(false);
    expect(verify(null, reserialised, keyFromRaw(raw), sig)).toBe(false);
    const tampered = Buffer.from(bytes);
    tampered[tampered.indexOf("0.8.0") + 4] = "1".charCodeAt(0);
    expect(verify(null, tampered, keyFromRaw(raw), sig)).toBe(false);
  });
});

describe("RFC-0046 and the release key list", async () => {
  const rfc = await readFile(path.join(REPO, "docs/rfcs/0046-release-bundles.md"), "utf8");
  const keys = await readFile(path.join(REPO, "docs/security/release-signing-keys.md"), "utf8");
  const releaseWorkflow = await readFile(path.join(REPO, ".github/workflows/release.yml"), "utf8");
  const KEY_ID = "cloudhal-release-2026a";
  const PUBLIC_KEY = "7az3pPc4oT0AOfRcdfOZZQkM6XAGHo2jXEdDZ1qEVR8=";

  it("is a product-neutral proposal", () => {
    expect(rfc).toMatch(/^# RFC-0046: Signed release bundles\n/);
    expect(rfc).toContain("\n- Status: Proposed\n");
    for (const doc of [
      rfc,
      keys,
      JSON.stringify(manifest.description),
      JSON.stringify(statement.description),
    ])
      expect(doc).not.toMatch(/clavius/i);
    expect(rfc).not.toMatch(/SLSA Build L3/i);
  });

  it("pins the active key, whose other published forms agree", () => {
    const row = keys.split("\n").find((l) => l.startsWith(`| \`${KEY_ID}\``));
    expect(row).toContain(`\`${PUBLIC_KEY}\``);
    expect(row).toContain("| active |");
    const raw = Buffer.from(PUBLIC_KEY, "base64");
    expect(raw.length).toBe(32);
    const key = keyFromRaw(raw);
    expect(key.asymmetricKeyType).toBe("ed25519");
    expect(keys).toContain(raw.toString("hex"));
    expect(keys).toContain(createHash("sha256").update(raw).digest("hex"));
    const pem = (key.export({ format: "pem", type: "spki" }) as string).trim().split("\n");
    for (const line of pem) expect(keys).toContain(line);
  });

  it("binds the signed statement to the requested version and channel", () => {
    const verification = rfc.slice(
      rfc.indexOf("Verification by a consumer"),
      rfc.indexOf("### 3."),
    );
    const steps = verification.match(/^\d\. .*$/gm) ?? [];
    expect(steps[2]).toMatch(/^3\. Bind the statement to the request \(invariant 7\)/);
    expect(steps[2]).toContain("`version` equals the requested version");
    expect(steps[2]).toContain("`channel` equals the requested channel");
    expect(rfc).toMatch(/^7\. \*\*The statement is for the release the consumer asked for\.\*\*/m);
    expect(rfc).toMatch(/^4\. Verification hard-fails.*binding the statement to the request/m);
    expect(keys).toContain("if (statement.version !== version) throw");
    expect(keys).toContain(
      'if (statement.channel !== (version.includes("-") ? "next" : "stable"))',
    );
  });

  it("re-checks the draft's assets immediately before publishing it", () => {
    const publication = rfc.slice(rfc.indexOf("### 6."), rfc.indexOf("### 7."));
    const steps = (publication.match(/^\d\. \*\*[^*]+\*\*/gm) ?? []).map((l) => l.slice(3));
    expect(steps).toEqual([
      "**Tag**",
      "**Draft**",
      "**Attach and re-check**",
      "**npm publish**",
      "**Re-check before publishing**",
      "**Publish the release**",
    ]);
    expect(publication).toContain("the run refuses to publish, re-uploads");
  });

  it("claims two factors only for consumers that verify the attestation", () => {
    expect(rfc).toContain("**Two factors for a consumer that verifies both.**");
    expect(rfc).toContain("relies on the release key alone");
    expect(rfc).not.toMatch(/Together they defeat theft/);
    // bundle-sign checks out nothing: its pin is inline in the job, not read from the doc.
    expect(rfc).toContain("written inline in the `bundle-sign` job");
  });

  it("describes custody and revocation as they are", () => {
    expect(keys).not.toMatch(/The private key exists only as the secret/);
    expect(keys).not.toMatch(/No other job, workflow, repository, machine or service/);
    expect(keys).not.toMatch(/re-signed with another key/);
    expect(keys).toContain("can never be re-signed. The remedy is a new version");
    expect(keys).toContain("the maintainer moves the generated file to offline storage");
  });

  it.skipIf(!releaseWorkflow.includes("bundle-sign:"))(
    "the bundle-sign job pins the same key id and public key inline",
    () => {
      expect(releaseWorkflow).toContain(KEY_ID);
      expect(releaseWorkflow).toContain(PUBLIC_KEY);
    },
  );

  it("documents the three hand checks", () => {
    expect(keys).toContain("crypto");
    expect(keys).toContain(ED25519_SPKI_PREFIX.toString("hex"));
    expect(keys).toContain("gh release verify-asset");
    expect(keys).toContain(
      "--signer-workflow cloudhal-dev/cloudhal/.github/workflows/bundle-build.yml",
    );
  });
});
