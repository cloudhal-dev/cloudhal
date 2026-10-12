type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Deterministic JSON: object keys sorted recursively, no whitespace. Undefined values are dropped. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value as Json));
}

function sortValue(v: Json): Json {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v !== null && typeof v === "object") {
    const out: { [k: string]: Json } = {};
    for (const k of Object.keys(v).sort()) {
      const val = (v as { [k: string]: Json | undefined })[k];
      if (val !== undefined) out[k] = sortValue(val);
    }
    return out;
  }
  return v;
}

/** Lower-case hex SHA-256 (WebCrypto; works in Node and on Workers). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Content hash of a node: SHA-256 over its canonical JSON. */
export async function nodeHash(node: unknown): Promise<string> {
  return sha256Hex(canonicalJson(node));
}
