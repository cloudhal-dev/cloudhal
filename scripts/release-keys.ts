/**
 * The release trust ceremony (RFC-0046 §9, #226; runbook: docs/security/release-signing-keys.md).
 * Node built-ins, plus `@cloudhal/release-verify` (loaded when signing) to check every signed
 * document the way consumers do before it is written. No command ever prints a private key.
 *
 *   node scripts/release-keys.ts root-init --key-id cloudhal-root-2026a --out <dir> [--passphrase-file <f>]
 *       An Ed25519 root: <dir>/<id>.key.enc (PKCS#8, AES-256-CBC under PBKDF2-HMAC-SHA256 with
 *       600,000 iterations of the passphrase) + <id>.pub.json. sign-keys also reads older roots.
 *   node scripts/release-keys.ts yank-init --key-id cloudhal-yank-2026a --out <dir>
 *       The yank key: <dir>/<id>.pem (mode 0600, for the RELEASE_YANK_KEY secret) + <id>.pub.json.
 *   node scripts/release-keys.ts sign-keys --root-key <id>.key.enc --root-pub <id>.pub.json
 *       [--source security/keys.source.json] [--out security] [--months 12] [--passphrase-file <f>]
 *       keys.json + keys.json.sig, signed by the root, expiring after --months (at most 13).
 *   node scripts/release-keys.ts sign-yanked --key-id <yank id> [--key-file <pem>] [--list security/yank-list.json]
 *       [--keys security/keys.json] [--out <dir>] [--published <file|url>] [--first-run | --rotate]
 *       [--accept-expired] [--yank=<v1,v2> | --revoke=<id1,id2>] [--reason=<text>]
 *       yanked.json + yanked.json.sig, expiring in 30 days. The key comes from --key-file or the
 *       RELEASE_YANK_KEY environment variable. It refuses a key that is not the active yank key
 *       of keys.json. The published list (`<file>` and `<file>.sig`) must verify as a consumer
 *       would before anything of it is carried forward. The list signed is every published entry
 *       (append-only), the source, and the emergency `--yank`/`--revoke` entries (comma-separated);
 *       its serial is one above the published one. `--rotate`: the first list of a new yank key,
 *       nothing of the old key's list carried forward, serial 1 (runbook, Rotation).
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  sign,
  verify,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { canonicalJson, sha256 } from "./release-bundle/manifest.ts";
import { encryptPkcs8 } from "./release-keys/pkcs8.ts";
import {
  checkAppendOnly,
  mergeYankList,
  type PublishedPair,
  readPublished,
  verifyPublished,
  type YankExtra,
  type YankSource,
} from "./release-keys/yank-list.ts";

export { type Pbes2Params, ROOT_KDF_ITERATIONS, readPbes2 } from "./release-keys/pkcs8.ts";
export {
  checkAppendOnly,
  MAX_EXTRA,
  mergeYankList,
  parseExtra,
  type YankExtra,
  type YankSource,
} from "./release-keys/yank-list.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
const KEY_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const DAY_MS = 86_400_000;

type Log = (line: string) => void;

export interface PublicKeyFile {
  readonly keyId: string;
  /** Raw 32-byte Ed25519 public key, base64. */
  readonly publicKey: string;
}

/** The raw 32-byte public key (base64) of a private or public Ed25519 key. */
const rawPublicKey = (key: KeyObject): string => {
  const pub = key.type === "public" ? key : createPublicKey(key);
  const der = pub.export({ format: "der", type: "spki" });
  return Buffer.from(der.subarray(SPKI_ED25519.length)).toString("base64");
};

const publicKeyOf = (raw: string): KeyObject =>
  createPublicKey({
    key: Buffer.concat([SPKI_ED25519, Buffer.from(raw, "base64")]),
    format: "der",
    type: "spki",
  });

/** Whole seconds, `YYYY-MM-DDTHH:MM:SSZ`, as every contract timestamp here. */
const iso = (ms: number) =>
  new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");

function checkKeyId(keyId: string, role: "root" | "yank"): void {
  if (!KEY_ID.test(keyId)) throw new Error(`not a key id: ${keyId}`);
  if (!keyId.includes(`-${role}-`))
    throw new Error(`a ${role} key id names its role: cloudhal-${role}-<year><letter>`);
}

function writeNew(file: string, content: string | Uint8Array, mode = 0o644): void {
  if (existsSync(file)) throw new Error(`${file} exists; refusing to overwrite a key`);
  writeFileSync(file, content, { mode, flag: "wx" });
}

function writePublic(out: string, keyId: string, key: KeyObject, log: Log): PublicKeyFile {
  const pub: PublicKeyFile = { keyId, publicKey: rawPublicKey(key) };
  writeNew(path.join(out, `${keyId}.pub.json`), `${JSON.stringify(pub, null, 2)}\n`);
  const fingerprint = sha256(Buffer.from(pub.publicKey, "base64"));
  log(`${keyId}: public key ${pub.publicKey} (SHA-256 of the raw key ${fingerprint})`);
  return pub;
}

/** An Ed25519 root, its private key written only encrypted with `passphrase`. */
export function rootInit(o: {
  keyId: string;
  out: string;
  passphrase: string;
  log: Log;
}): PublicKeyFile {
  checkKeyId(o.keyId, "root");
  if (o.passphrase.length < 12) throw new Error("the passphrase must be at least 12 characters");
  mkdirSync(o.out, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  // Not `privateKey.export({ cipher })`: that is 2,048 PBKDF2 iterations, with no way to ask for more.
  const enc = encryptPkcs8(privateKey, o.passphrase);
  writeNew(path.join(o.out, `${o.keyId}.key.enc`), enc, 0o600);
  o.log(`wrote ${o.keyId}.key.enc (encrypted; seal two copies with the passphrase, apart)`);
  return writePublic(o.out, o.keyId, publicKey, o.log);
}

/** The yank key, its PEM written with mode 0600 for the `RELEASE_YANK_KEY` secret. */
export function yankInit(o: { keyId: string; out: string; log: Log }): PublicKeyFile {
  checkKeyId(o.keyId, "yank");
  mkdirSync(o.out, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  writeNew(
    path.join(o.out, `${o.keyId}.pem`),
    privateKey.export({ format: "pem", type: "pkcs8" }),
    0o600,
  );
  o.log(
    `wrote ${o.keyId}.pem: gh secret set RELEASE_YANK_KEY --env release-yank < ${o.keyId}.pem, then move it offline`,
  );
  return writePublic(o.out, o.keyId, publicKey, o.log);
}

/** `ms` plus `months` calendar months (UTC), clamped to the target month's last day. */
function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  const target = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + months,
      1,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
    ),
  );
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return target.getTime();
}

/**
 * The consumer's own verifier, which checks the exact signed bytes before anything is written
 * (schema, unique key ids, windows, timestamps, sizes). Needs `@cloudhal/release-verify`'s
 * dependencies installed (the workflow installs that one package, without scripts).
 */
async function verifier() {
  try {
    return await import("../packages/release-verify/src/index.ts");
  } catch (e) {
    throw new Error(
      `the release verifier is not installed (pnpm install --filter @cloudhal/release-verify): ${(e as Error).message}`,
    );
  }
}

/** Runs `check`; a refusal names what was about to be signed. */
async function selfCheck(what: string, check: () => Promise<unknown>): Promise<void> {
  try {
    await check();
  } catch (e) {
    throw new Error(`the signed ${what} does not verify, nothing written: ${(e as Error).message}`);
  }
}

function signDocument(doc: unknown, key: KeyObject, check: KeyObject) {
  const bytes = Buffer.from(canonicalJson(doc));
  const signature = sign(null, bytes, key);
  if (signature.length !== 64 || !verify(null, bytes, check, signature))
    throw new Error("the signature does not verify with the expected public key");
  return { document: new Uint8Array(bytes), signature: new Uint8Array(signature) };
}

/** `keys.json` + `keys.json.sig`, signed by the root; the root key must match `rootPub`. */
export async function signKeys(o: {
  rootKey: string;
  passphrase: string;
  rootPub: PublicKeyFile;
  source: { keys: unknown[] };
  out: string;
  now: number;
  months?: number;
}): Promise<{ document: Uint8Array; signature: Uint8Array }> {
  const months = o.months ?? 12;
  if (!(months >= 1 && months <= 13)) throw new Error("keys.json is valid for 1 to 13 months");
  checkKeyId(o.rootPub.keyId, "root");
  let key: KeyObject;
  try {
    key = createPrivateKey({ key: o.rootKey, passphrase: o.passphrase });
  } catch {
    throw new Error("the root key does not open with this passphrase");
  }
  if (rawPublicKey(key) !== o.rootPub.publicKey)
    throw new Error(`the root key is not ${o.rootPub.keyId}`);
  if (!Array.isArray(o.source.keys) || o.source.keys.length === 0)
    throw new Error("the source lists no keys");
  const issued = Math.floor(o.now / 1000) * 1000;
  const doc = {
    schemaVersion: 1,
    format: "cloudhal.release-keys@1",
    issuedAt: iso(issued),
    expires: iso(addMonths(issued, months)),
    signing: { keyId: o.rootPub.keyId, algorithm: "Ed25519", signature: "keys.json.sig" },
    keys: o.source.keys,
  };
  const signed = signDocument(doc, key, publicKeyOf(o.rootPub.publicKey));
  const rv = await verifier();
  await selfCheck("key list", () =>
    rv.verifyKeys({
      ...signed,
      roots: { [o.rootPub.keyId]: { publicKey: o.rootPub.publicKey } },
      now: new Date(issued),
    }),
  );
  mkdirSync(o.out, { recursive: true });
  writeFileSync(path.join(o.out, "keys.json"), signed.document);
  writeFileSync(path.join(o.out, "keys.json.sig"), signed.signature);
  return signed;
}

/**
 * `yanked.json` + `yanked.json.sig`, signed by the yank key that `keys` lists as active. The
 * published list is verified before anything of it is carried forward (release-keys/yank-list.ts).
 */
export async function signYanked(o: {
  keyId: string;
  keyPem: string;
  /** `keys.json` and its signature, verified here against `roots` (default: the pinned root). */
  keyList: { document: Uint8Array; signature: Uint8Array };
  roots?: Readonly<Record<string, { readonly publicKey: string }>>;
  source: YankSource;
  /** The published `yanked.json` and `.sig` (none for the very first list). */
  published: PublishedPair | undefined;
  /** The first run after a yank-key rotation: the old key's list is not carried forward. */
  rotate?: boolean;
  /** Carry forward a published list that expired during an outage (verified as of its issue). */
  acceptExpired?: boolean;
  extra?: YankExtra;
  out: string;
  now: number;
}): Promise<{ document: Uint8Array; signature: Uint8Array }> {
  const rv = await verifier();
  const keys = await rv.verifyKeys({
    ...o.keyList,
    ...(o.roots ? { roots: o.roots } : {}),
    now: new Date(o.now),
  });
  checkKeyId(o.keyId, "yank");
  const listed = keys.document.keys.find((k) => k.keyId === o.keyId);
  if (listed?.role !== "yank" || listed.status !== "active")
    throw new Error(`keys.json does not list ${o.keyId} as an active yank key`);
  if (o.now < Date.parse(listed.notBefore) || o.now > Date.parse(listed.notAfter))
    throw new Error(`${o.keyId} is outside its window`);
  let key: KeyObject;
  try {
    key = createPrivateKey(o.keyPem);
  } catch {
    throw new Error("the yank key is missing or not a PKCS#8 PEM key");
  }
  if (rawPublicKey(key) !== listed.publicKey)
    throw new Error(`the yank key given is not ${o.keyId} of keys.json`);
  if (!Array.isArray(o.source.versions) || !Array.isArray(o.source.revokedKeys))
    throw new Error("the yank list source needs versions and revokedKeys");
  const published = await verifyPublished({
    rv,
    keys,
    keyId: o.keyId,
    published: o.published,
    now: o.now,
    ...(o.rotate ? { rotate: true } : {}),
    ...(o.acceptExpired ? { acceptExpired: true } : {}),
  });
  const list = mergeYankList(o.source, published?.list, o.extra ?? {}, o.now);
  checkAppendOnly(list, published?.list);
  const issued = Math.floor(o.now / 1000) * 1000;
  const doc = {
    schemaVersion: 1,
    format: "cloudhal.release-yank-list@1",
    // One more than the published list's, so a consumer that keeps state refuses a rollback.
    serial: (published?.serial ?? 0) + 1,
    issuedAt: iso(issued),
    expires: iso(issued + 30 * DAY_MS),
    signing: { keyId: o.keyId, algorithm: "Ed25519", signature: "yanked.json.sig" },
    versions: list.versions,
    revokedKeys: list.revokedKeys,
  };
  const signed = signDocument(doc, key, publicKeyOf(listed.publicKey));
  // The verified published list is the memory this one must keep, as consumers do.
  await selfCheck("yank list", () =>
    rv.verifyYanked({
      ...signed,
      keys,
      now: new Date(issued),
      ...(published ? { memory: published.memory } : {}),
    }),
  );
  mkdirSync(o.out, { recursive: true });
  writeFileSync(path.join(o.out, "yanked.json"), signed.document);
  writeFileSync(path.join(o.out, "yanked.json.sig"), signed.signature);
  return signed;
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;

/** A passphrase from a file, or typed twice on the terminal without echo. */
async function passphrase(file: string | undefined, twice: boolean): Promise<string> {
  if (file) return readFileSync(file, "utf8").replace(/\r?\n$/, "");
  if (!process.stdin.isTTY) throw new Error("no terminal: pass --passphrase-file");
  const ask = (prompt: string) =>
    new Promise<string>((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
      const out = rl as unknown as { _writeToOutput: (s: string) => void };
      out._writeToOutput = (s: string) => {
        if (s.startsWith(prompt)) process.stdout.write(prompt);
      };
      rl.question(prompt, (answer) => {
        rl.close();
        process.stdout.write("\n");
        resolve(answer);
      });
    });
  const first = await ask("Root passphrase: ");
  if (twice && (await ask("Again: ")) !== first) throw new Error("the passphrases differ");
  return first;
}

/** `sign-yanked` from the parsed flags (see the file comment). */
async function signYankedCli(
  v: Readonly<Record<string, string | boolean | undefined>>,
  keyId: string,
  log: Log,
): Promise<void> {
  const str = (name: string) => (typeof v[name] === "string" ? (v[name] as string) : undefined);
  const security = path.join(ROOT, "security");
  const keyPem = str("key-file")
    ? readFileSync(str("key-file") as string, "utf8")
    : (process.env.RELEASE_YANK_KEY ?? "");
  delete process.env.RELEASE_YANK_KEY;
  const out = str("out") ?? path.join(ROOT, ".build/yank-list");
  const keysFile = str("keys") ?? path.join(security, "keys.json");
  await signYanked({
    keyId,
    keyPem,
    keyList: { document: readFileSync(keysFile), signature: readFileSync(`${keysFile}.sig`) },
    // Default: the pinned root. --root-pub only before the root is pinned (or in tests).
    ...(str("root-pub")
      ? (() => {
          const pub = readJson<PublicKeyFile>(str("root-pub") as string);
          return { roots: { [pub.keyId]: { publicKey: pub.publicKey } } };
        })()
      : {}),
    source: readJson<YankSource>(str("list") ?? path.join(security, "yank-list.json")),
    published: await readPublished(str("published"), v["first-run"] === true),
    ...(v.rotate === true ? { rotate: true } : {}),
    ...(v["accept-expired"] === true ? { acceptExpired: true } : {}),
    extra: {
      ...(str("yank") ? { yank: str("yank") as string } : {}),
      ...(str("revoke") ? { revoke: str("revoke") as string } : {}),
      ...(str("reason") ? { reason: str("reason") as string } : {}),
    },
    out,
    now: Date.now(),
  });
  log(`signed ${path.join(out, "yanked.json")} and yanked.json.sig`);
}

export async function main(argv: readonly string[], log: Log = console.log): Promise<void> {
  const [command, ...rest] = argv;
  const { values: v } = parseArgs({
    args: rest,
    options: {
      "key-id": { type: "string" },
      out: { type: "string" },
      "passphrase-file": { type: "string" },
      "root-key": { type: "string" },
      "root-pub": { type: "string" },
      source: { type: "string" },
      months: { type: "string" },
      "key-file": { type: "string" },
      list: { type: "string" },
      keys: { type: "string" },
      published: { type: "string" },
      "first-run": { type: "boolean" },
      rotate: { type: "boolean" },
      "accept-expired": { type: "boolean" },
      yank: { type: "string" },
      revoke: { type: "string" },
      reason: { type: "string" },
    },
  });
  const need = (name: keyof typeof v) => {
    const value = v[name];
    if (typeof value !== "string") throw new Error(`--${name} is required`);
    return value;
  };
  const security = path.join(ROOT, "security");
  if (command === "root-init") {
    const pass = await passphrase(v["passphrase-file"], true);
    rootInit({ keyId: need("key-id"), out: need("out"), passphrase: pass, log });
  } else if (command === "yank-init") {
    yankInit({ keyId: need("key-id"), out: need("out"), log });
  } else if (command === "sign-keys") {
    const pass = await passphrase(v["passphrase-file"], false);
    const out = v.out ?? security;
    await signKeys({
      rootKey: readFileSync(need("root-key"), "utf8"),
      passphrase: pass,
      rootPub: readJson<PublicKeyFile>(need("root-pub")),
      source: readJson<{ keys: unknown[] }>(v.source ?? path.join(security, "keys.source.json")),
      out,
      now: Date.now(),
      ...(v.months ? { months: Number(v.months) } : {}),
    });
    log(`signed ${path.join(out, "keys.json")} and keys.json.sig`);
  } else if (command === "sign-yanked") {
    await signYankedCli(v, need("key-id"), log);
  } else {
    throw new Error(
      "usage: node scripts/release-keys.ts root-init|yank-init|sign-keys|sign-yanked …",
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (e) {
    console.error(`release-keys: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
