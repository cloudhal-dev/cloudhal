const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32, matches /[A-Za-z0-9]/

/** Generates a prefixed id such as `page_01J9X7Q2K4M8N3P6R1S5`. */
export function newId(prefix: string, length = 20): string {
  if (!/^[a-z]+$/.test(prefix)) throw new Error(`invalid id prefix "${prefix}"`);
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % 32];
  return `${prefix}_${out}`;
}

export const ID_PREFIX = {
  project: "proj",
  site: "site",
  page: "page",
  section: "sec",
  contentEntry: "entry",
  snapshot: "snap",
  user: "user",
  agent: "agent",
  system: "sys",
} as const;
