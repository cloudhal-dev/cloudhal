/**
 * The root's encrypted PKCS#8 file (RFC-0046 §9; runbook: docs/security/release-signing-keys.md).
 *
 * Node's `KeyObject.export({ cipher, passphrase })` writes PBES2 with PBKDF2-HMAC-SHA256 at
 * OpenSSL's default of 2,048 iterations and has no option for more. `encryptPkcs8` writes the same
 * PBES2 structure itself (RFC 8018 §6.2 and appendix A.2/A.4, RFC 5958 `EncryptedPrivateKeyInfo`)
 * with `ROOT_KDF_ITERATIONS`, AES-256-CBC and HMAC-SHA256: the form
 * `openssl pkcs8 -topk8 -v2 aes-256-cbc -v2prf hmacWithSHA256 -iter 600000` writes. Node and
 * OpenSSL read it back with `createPrivateKey({ key, passphrase })`, as they read the older
 * 2,048-iteration files. `readPbes2` reads the parameters of either back, for tests and checks.
 */
import { createCipheriv, type KeyObject, pbkdf2Sync, randomBytes } from "node:crypto";

/** PBKDF2 iterations for the root (OWASP's figure for PBKDF2-HMAC-SHA256). */
export const ROOT_KDF_ITERATIONS = 600_000;

const OID = {
  pbes2: "2a864886f70d01050d", // 1.2.840.113549.1.5.13
  pbkdf2: "2a864886f70d01050c", // 1.2.840.113549.1.5.12
  hmacWithSHA1: "2a864886f70d0207", // 1.2.840.113549.2.7, PBKDF2's default prf
  hmacWithSHA256: "2a864886f70d0209", // 1.2.840.113549.2.9
  aes256Cbc: "60864801650304012a", // 2.16.840.1.101.3.4.1.42
} as const;

const derLength = (n: number): Buffer => {
  if (n < 0x80) return Buffer.from([n]);
  if (n < 0x100) return Buffer.from([0x81, n]);
  if (n < 0x10000) return Buffer.from([0x82, n >> 8, n & 0xff]);
  throw new Error("DER value too long");
};
const tlv = (tag: number, body: Buffer): Buffer =>
  Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
const seq = (...parts: Buffer[]) => tlv(0x30, Buffer.concat(parts));
const octets = (b: Buffer) => tlv(0x04, b);
const oid = (hex: string) => tlv(0x06, Buffer.from(hex, "hex"));
const NULL = Buffer.from([0x05, 0x00]);
const integer = (n: number): Buffer => {
  const bytes: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v % 256);
  if (bytes.length === 0 || (bytes[0] as number) >= 0x80) bytes.unshift(0);
  return tlv(0x02, Buffer.from(bytes));
};

const pem = (der: Uint8Array): string => {
  const lines =
    Buffer.from(der)
      .toString("base64")
      .match(/.{1,64}/g) ?? [];
  return `-----BEGIN ENCRYPTED PRIVATE KEY-----\n${lines.join("\n")}\n-----END ENCRYPTED PRIVATE KEY-----\n`;
};

/** `key` as an encrypted PKCS#8 PEM: PBES2, PBKDF2-HMAC-SHA256 at `ROOT_KDF_ITERATIONS`, AES-256-CBC. */
export function encryptPkcs8(key: KeyObject, passphrase: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(16);
  const kek = pbkdf2Sync(passphrase, salt, ROOT_KDF_ITERATIONS, 32, "sha256");
  const cipher = createCipheriv("aes-256-cbc", kek, iv);
  const plain = key.export({ format: "der", type: "pkcs8" });
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  kek.fill(0);
  const kdf = seq(
    oid(OID.pbkdf2),
    seq(octets(salt), integer(ROOT_KDF_ITERATIONS), seq(oid(OID.hmacWithSHA256), NULL)),
  );
  const scheme = seq(oid(OID.aes256Cbc), octets(iv));
  return pem(seq(seq(oid(OID.pbes2), seq(kdf, scheme)), octets(encrypted)));
}

/** One DER element at `at`: its tag, its body, and where the next element starts. */
function element(der: Uint8Array, at: number): Der & { end: number } {
  const tag = der[at];
  let len = der[at + 1];
  if (tag === undefined || len === undefined) throw new Error("truncated DER");
  let start = at + 2;
  if (len >= 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 3) throw new Error("unsupported DER length");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + (der[start + i] ?? 0);
    start += n;
  }
  if (start + len > der.length) throw new Error("truncated DER");
  return { tag, body: der.subarray(start, start + len), end: start + len };
}

/** The children of a constructed DER element. */
function children(body: Uint8Array): Der[] {
  const out: Der[] = [];
  for (let at = 0; at < body.length; ) {
    const e = element(body, at);
    out.push(e);
    at = e.end;
  }
  return out;
}

type Der = { tag: number; body: Uint8Array };
const hex = (b: Uint8Array | undefined) => (b ? Buffer.from(b).toString("hex") : undefined);
const NONE = new Uint8Array(0);

const PRF: Record<string, string> = {
  [OID.hmacWithSHA1]: "hmacWithSHA1",
  [OID.hmacWithSHA256]: "hmacWithSHA256",
};

export interface Pbes2Params {
  readonly iterations: number;
  readonly saltBytes: number;
  /** `hmacWithSHA1` when the file leaves PBKDF2's default prf implied. */
  readonly prf: string;
  readonly cipher: string;
}

/** The PBES2/PBKDF2 parameters of an `ENCRYPTED PRIVATE KEY` PEM (any writer). */
export function readPbes2(encryptedPem: string): Pbes2Params {
  const b64 = encryptedPem
    .split("\n")
    .filter((l) => l !== "" && !l.startsWith("-----"))
    .join("");
  const [algorithm] = children(element(Buffer.from(b64, "base64"), 0).body);
  const [algOid, params] = children(algorithm?.body ?? NONE);
  if (hex(algOid?.body) !== OID.pbes2 || !params) throw new Error("not PBES2");
  const [kdf, scheme] = children(params.body);
  const [kdfOid, kdfParams] = children(kdf?.body ?? NONE);
  if (hex(kdfOid?.body) !== OID.pbkdf2 || !kdfParams) throw new Error("not PBKDF2");
  const fields = children(kdfParams.body);
  const salt = fields[0];
  const iterations = fields[1];
  if (salt?.tag !== 0x04 || iterations?.tag !== 0x02 || iterations.body.length > 6)
    throw new Error("bad PBKDF2 parameters");
  const prfAlg = fields.find((f, i) => i >= 2 && f.tag === 0x30);
  const prfOid = prfAlg ? hex(children(prfAlg.body)[0]?.body) : OID.hmacWithSHA1;
  const cipherOid = hex(children(scheme?.body ?? NONE)[0]?.body);
  return {
    iterations: iterations.body.reduce((n, byte) => n * 256 + byte, 0),
    saltBytes: salt.body.length,
    prf: PRF[prfOid ?? ""] ?? `oid:${prfOid}`,
    cipher: cipherOid === OID.aes256Cbc ? "aes-256-cbc" : `oid:${cipherOid}`,
  };
}
