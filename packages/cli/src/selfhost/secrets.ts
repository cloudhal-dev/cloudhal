/**
 * `cloudhal selfhost secrets`: a fresh `.env` block with every value the image requires that is
 * not a choice (RFC-0047 §4): the manifest's secrets, the cluster key, the site's id and the
 * credentials of the compose file's own store (replace them with an external store's). Printed,
 * never written; run it once per installation and keep the output with the installation.
 */
import { randomBytes } from "node:crypto";
import { REQUIRED_SECRETS } from "./settings.ts";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** `site_` and 20 Crockford base32 characters, as `newId("site")` makes. */
export function newSiteId(random: (n: number) => Uint8Array = randomBytes): string {
  let out = "";
  for (const b of random(20)) out += ALPHABET[b % 32];
  return `site_${out}`;
}

export function secretsEnv(random: (n: number) => Uint8Array = randomBytes): string {
  const hex = () => Buffer.from(random(32)).toString("hex");
  const lines = [
    "# Cloudhal self-host (RFC-0047): generated once by `cloudhal selfhost secrets`. Keep it secret;",
    "# every instance of this installation needs the same values.",
    `CLOUDHAL_SITE_ID=${newSiteId(random)}`,
    `CLOUDHAL_CLUSTER_KEY=${hex()}`,
    ...REQUIRED_SECRETS.map((name) => `${name}=${hex()}`),
    "# The S3 store's credentials: the compose file's SeaweedFS takes these; for another store",
    "# (AWS S3, GCS, R2, RustFS) put its own here and set CLOUDHAL_S3_ENDPOINT.",
    `AWS_ACCESS_KEY_ID=cloudhal${Buffer.from(random(8)).toString("hex")}`,
    `AWS_SECRET_ACCESS_KEY=${hex()}`,
  ];
  return `${lines.join("\n")}\n`;
}
