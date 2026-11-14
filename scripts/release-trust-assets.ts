/**
 * The key list and the yank list as release assets (RFC-0046 §1, §9): every release attaches the
 * copies current when it is made, verified first, as a snapshot next to the bundle. Consumers
 * prefer the canonical URLs; these copies serve `--from` and history.
 *
 * - Before the root ceremony there is no `security/keys.json`: nothing is attached.
 * - `keys.json` comes from `security/` and must verify with the pinned root; `yanked.json` comes
 *   from cloudhal.dev and must verify against it. Either failing refuses the release.
 * - A release already published is immutable: a resumed run takes the trust assets the release
 *   carries (they were verified when attached) instead of fetching newer copies.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LocalAsset, ReleaseView } from "./release-publish-plan.ts";

export const TRUST_ASSET_NAMES = ["keys.json", "keys.json.sig", "yanked.json", "yanked.json.sig"];

const asset = (name: string, file: string): LocalAsset => {
  const bytes = readFileSync(file);
  return {
    name,
    file,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
};

export interface TrustOptions {
  readonly root: string;
  /** The release as it exists now (a draft or none: fetch; published: reuse). */
  readonly release: ReleaseView | null;
  readonly fetchImpl?: (url: string) => Promise<Response>;
  readonly now?: Date;
  readonly log?: (line: string) => void;
  /** Tests only: roots other than the pinned ones. */
  readonly roots?: Readonly<Record<string, { readonly publicKey: string }>>;
}

export interface TrustAssets {
  readonly assets: LocalAsset[];
  /** The verified yank list, for the consumer check of the bundle (none for a published release). */
  readonly yanked?: unknown;
}

/** The trust assets to attach (see the file comment), and the yank list they verified. */
export async function trustAssets(o: TrustOptions): Promise<TrustAssets> {
  const log = o.log ?? ((l: string) => console.log(`publish-ci: ${l}`));
  if (o.release && !o.release.draft) {
    // Immutable: expect exactly what it carries (names + digests; never uploaded again).
    const assets = o.release.assets
      .filter((a) => TRUST_ASSET_NAMES.includes(a.name))
      .map((a) => ({
        name: a.name,
        file: "",
        bytes: a.size,
        sha256: (a.digest ?? "").replace(/^sha256:/, ""),
      }));
    return { assets };
  }
  const keysFile = path.join(o.root, "security/keys.json");
  const keysSig = path.join(o.root, "security/keys.json.sig");
  if (!existsSync(keysFile) || !existsSync(keysSig)) {
    log("no security/keys.json yet (before the root ceremony): no trust assets attached");
    return { assets: [] };
  }
  // Loaded here only: the `plan` job runs this script's caller without a pnpm install.
  const rv = await import("../packages/release-verify/src/index.ts");
  const now = o.now ?? new Date();
  const keys = await rv.verifyKeys({
    document: readFileSync(keysFile),
    signature: readFileSync(keysSig),
    now,
    ...(o.roots ? { roots: o.roots } : {}),
  });
  const get = o.fetchImpl ?? ((url: string) => fetch(url));
  const read = async (name: string) => {
    const res = await get(rv.TRUST_BASE_URL + name);
    if (!res.ok) throw new Error(`could not read ${name} from cloudhal.dev (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  };
  const yanked = await read("yanked.json");
  const yankedSig = await read("yanked.json.sig");
  const verified = await rv.verifyYanked({ document: yanked, signature: yankedSig, keys, now });
  const dir = mkdtempSync(path.join(os.tmpdir(), "cloudhal-trust-"));
  writeFileSync(path.join(dir, "yanked.json"), yanked);
  writeFileSync(path.join(dir, "yanked.json.sig"), yankedSig);
  log(`attaching keys.json and yanked.json (key list ${keys.sha256.slice(0, 12)})`);
  return {
    assets: [
      asset("keys.json", keysFile),
      asset("keys.json.sig", keysSig),
      asset("yanked.json", path.join(dir, "yanked.json")),
      asset("yanked.json.sig", path.join(dir, "yanked.json.sig")),
    ],
    yanked: verified,
  };
}
