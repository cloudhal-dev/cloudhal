/**
 * The opt-in daily visitor hash (RFC-0006 §6.2): the first 64 bits of
 * SHA-256(salt ‖ siteId ‖ ip ‖ userAgent) in hex. The salt is random per UTC day and deleted after
 * it, so the hash can neither be recomputed nor linked across days. The inputs are joined with a
 * newline so no two different inputs concatenate to the same bytes. WebCrypto: Node and Workers.
 */
const encoder = new TextEncoder();

export async function visitorHash(
  salt: string,
  siteId: string,
  ip: string,
  userAgent: string,
): Promise<string> {
  const data = encoder.encode([salt, siteId, ip, userAgent].join("\n"));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  let hex = "";
  for (let i = 0; i < 8; i++) hex += (digest[i] ?? 0).toString(16).padStart(2, "0");
  return hex;
}

/** 32 random bytes as 64 lower-case hex characters (a fresh daily salt). */
export function randomSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True when the request carries Global Privacy Control or Do Not Track. */
export function hasPrivacySignal(headers: Headers): boolean {
  return headers.get("sec-gpc")?.trim() === "1" || headers.get("dnt")?.trim() === "1";
}
