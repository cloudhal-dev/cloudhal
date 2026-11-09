/**
 * RFC-0044 §4 and §6 ("Client impersonation"): what the consent screen and "Connected agents" may
 * say about a client. A client's name is self-asserted (a metadata document's or a registration's
 * `client_name`), so it is shown only as plain, short text, and next to the identity the server
 * can vouch for:
 *
 * - `document`: a Client ID Metadata Document client; the document URL's host is its identity.
 * - `self-registered`: dynamic registration; nothing is verified, and a name that looks like a
 *   well-known client's is flagged (`lookalike`).
 * - `server`: a client the server itself stores (none are made today).
 *
 * Linear only (AGENTS.md rule 13): one pass over the code points, no regular expression.
 */

/** The longest name shown (as DCR's own limit). */
export const CLIENT_NAME_MAX = 100;

export type ClientKind = "document" | "self-registered" | "server";

interface ClientRowIdentity {
  readonly clientId: string;
  readonly name?: string | null;
  readonly clientDiscoveryId?: string | null;
  readonly userId?: string | null;
  readonly referenceId?: string | null;
}

/** Clients that identify themselves with a metadata document (or, for Cursor, register). */
const WELL_KNOWN = [
  "Claude Code",
  "Claude",
  "ChatGPT",
  "Codex",
  "VS Code",
  "Visual Studio Code",
  "Cursor",
];

/** Code points never shown: controls, bidi controls and marks, zero-width and other format characters. */
function hidden(cp: number): boolean {
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return true; // C0, DEL, C1
  if (cp === 0xad || cp === 0x061c || cp === 0x180e) return true; // soft hyphen, ALM, MVS
  if (cp >= 0x200b && cp <= 0x200f) return true; // zero-width, LRM, RLM
  if (cp >= 0x202a && cp <= 0x202e) return true; // bidi embeddings and overrides
  if (cp >= 0x2060 && cp <= 0x206f) return true; // word joiner, invisible operators, isolates
  if (cp === 0xfeff || (cp >= 0xfff9 && cp <= 0xfffb)) return true; // BOM, annotations
  if (cp >= 0xe0000 && cp <= 0xe007f) return true; // tag characters
  return false;
}

/** Space characters, collapsed to one ASCII space (U+2003 and friends included). */
function space(cp: number): boolean {
  return (
    cp === 0x20 ||
    cp === 0xa0 ||
    cp === 0x1680 ||
    (cp >= 0x2000 && cp <= 0x200a) ||
    cp === 0x2028 ||
    cp === 0x2029 ||
    cp === 0x202f ||
    cp === 0x205f ||
    cp === 0x3000
  );
}

/**
 * A client name as it may be shown: hidden characters removed, runs of spaces collapsed, trimmed,
 * at most `CLIENT_NAME_MAX` code points; `fallback` when nothing is left.
 */
export function displayName(raw: string | null | undefined, fallback: string): string {
  let out = "";
  let length = 0;
  let pendingSpace = false;
  for (const ch of raw ?? "") {
    const cp = ch.codePointAt(0) ?? 0;
    if (hidden(cp)) continue;
    if (space(cp)) {
      pendingSpace = out.length > 0;
      continue;
    }
    if (pendingSpace) {
      if (length + 1 >= CLIENT_NAME_MAX) break;
      out += " ";
      length += 1;
      pendingSpace = false;
    }
    if (length >= CLIENT_NAME_MAX) break;
    out += ch;
    length += 1;
  }
  return out || fallback.slice(0, CLIENT_NAME_MAX);
}

export function clientKind(row: ClientRowIdentity): ClientKind {
  if (row.clientDiscoveryId === "cimd") return "document";
  if (!row.clientDiscoveryId && !row.userId && !row.referenceId) return "self-registered";
  return "server";
}

/** Lower-case letters and digits only, for comparing names (`V S-Code` = `vscode`). */
function folded(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase())
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) out += ch;
  return out;
}

/** The well-known client a self-chosen name contains (`Claude · from claude.ai` → `Claude`). */
export function lookalikeOf(name: string): string | undefined {
  const f = folded(name);
  return WELL_KNOWN.find((known) => f.includes(folded(known)));
}

/** The document host of a `document` client (`claude.ai`), else undefined. */
export function documentHost(row: ClientRowIdentity): string | undefined {
  if (clientKind(row) !== "document") return undefined;
  try {
    return new URL(row.clientId).host;
  } catch {
    return undefined;
  }
}
