/**
 * The Ed25519 check of `release-statement.sig` against a pinned raw public key (RFC-0046 §2
 * step 2). Node built-ins only, so `scripts/publish-ci.ts` can check the signed bundle before it
 * uploads anything, without a package install; `verify.ts` uses it for the full consumer order.
 */
import { createPublicKey, verify as edVerify } from "node:crypto";
import { SIGNATURE_FILE } from "./statement.ts";

const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

/** Ed25519 over the exact statement bytes with the pinned raw public key of its key id. */
export function verifySignature(
  statementBytes: Uint8Array,
  signature: Uint8Array,
  keyId: string,
  publicKeys: Readonly<Record<string, string>>,
): void {
  const raw = Object.hasOwn(publicKeys, keyId) ? publicKeys[keyId] : undefined;
  if (!raw) throw new Error(`no pinned public key for ${keyId}`);
  const pub = Buffer.from(raw, "base64");
  if (pub.length !== 32) throw new Error(`the pinned key for ${keyId} is not 32 bytes`);
  if (signature.length !== 64) throw new Error(`${SIGNATURE_FILE} is not 64 bytes`);
  const key = createPublicKey({
    key: Buffer.concat([SPKI_ED25519, pub]),
    format: "der",
    type: "spki",
  });
  if (!edVerify(null, statementBytes, key, signature))
    throw new Error(`${SIGNATURE_FILE} does not verify with ${keyId}`);
}
