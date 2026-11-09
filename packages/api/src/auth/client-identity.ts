/**
 * RFC-0044 §4 and §6 ("Client impersonation"): what the consent screen and "Connected agents" may
 * say about a client. A client's name is self-asserted (a metadata document's or a registration's
 * `client_name`), so it is shown only as plain, short text, and next to the identity the server
 * can vouch for:
 *
 * - `document`: a Client ID Metadata Document client; the document URL's host is its identity.
 * - `self-registered`: dynamic registration; nothing is verified.
 * - `server`: a client the server itself stores (none are made today).
 *
 * A name that looks like one of the well-known document clients' (`lookalike`: Claude, Claude
 * Code, ChatGPT, Codex, VS Code) is flagged unless the client is that client's document on its
 * real host. Names are compared after NFKC and a small confusable map (Cyrillic and Greek
 * look-alikes of Latin letters, `0`/`O`, `1`/`l`/`I`); a full UTS #39 skeleton is a follow-up.
 *
 * Linear only (AGENTS.md rule 13): one pass over the code points; the only pattern tests one
 * character at a time.
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

/**
 * The well-known clients that identify themselves with a metadata document (RFC-0044 §11), and
 * the hosts their documents live on. Cursor is not one: it always registers itself, so its own
 * name is no sign of impersonation.
 */
const WELL_KNOWN: readonly { readonly name: string; readonly hosts: readonly string[] }[] = [
  { name: "Claude Code", hosts: ["claude.ai", "claude.com"] },
  { name: "Claude", hosts: ["claude.ai", "claude.com"] },
  { name: "ChatGPT", hosts: ["chatgpt.com", "openai.com"] },
  { name: "Codex", hosts: ["chatgpt.com", "openai.com"] },
  { name: "VS Code", hosts: ["vscode.dev", "github.com"] },
  { name: "Visual Studio Code", hosts: ["vscode.dev", "github.com"] },
];

/** At most this many combining marks are kept on one base character. */
const MAX_MARKS = 2;
const MARK = /^\p{M}$/u;

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
  let marks = 0;
  for (const ch of raw ?? "") {
    const cp = ch.codePointAt(0) ?? 0;
    if (hidden(cp)) continue;
    if (space(cp)) {
      pendingSpace = out.length > 0;
      marks = 0;
      continue;
    }
    if (MARK.test(ch)) {
      // Stacked marks render tall over the lines around the name: a few per character only.
      if (out.length === 0 || pendingSpace || marks >= MAX_MARKS) continue;
      marks += 1;
    } else marks = 0;
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

/** Look-alikes of Latin letters and digits, after NFKC (which already folds fullwidth forms). */
const CONFUSABLE: Readonly<Record<string, string>> = {
  // Cyrillic
  а: "a",
  в: "b",
  с: "c",
  е: "e",
  һ: "h",
  і: "i",
  ј: "j",
  к: "k",
  ӏ: "l",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  ԛ: "q",
  ѕ: "s",
  т: "t",
  и: "u",
  ѵ: "v",
  ԝ: "w",
  х: "x",
  у: "y",
  А: "a",
  В: "b",
  С: "c",
  Е: "e",
  Н: "h",
  І: "i",
  Ј: "j",
  К: "k",
  М: "m",
  О: "o",
  Р: "p",
  Ѕ: "s",
  Т: "t",
  Х: "x",
  У: "y",
  Ү: "y",
  // Greek
  α: "a",
  β: "b",
  ε: "e",
  η: "n",
  ι: "i",
  κ: "k",
  ν: "v",
  ο: "o",
  ρ: "p",
  τ: "t",
  υ: "u",
  χ: "x",
  γ: "y",
  Α: "a",
  Β: "b",
  Ε: "e",
  Ζ: "z",
  Η: "h",
  Ι: "i",
  Κ: "k",
  Μ: "m",
  Ν: "n",
  Ο: "o",
  Ρ: "p",
  Τ: "t",
  Υ: "y",
  Χ: "x",
  // Digits and letters that pass for one another
  "0": "o",
  "1": "l",
  I: "l",
  "|": "l",
};

/** NFKC, confusables mapped, then lower-case letters and digits only (`V S-Code` = `vscode`). */
function folded(text: string): string {
  let out = "";
  for (const raw of text.normalize("NFKC")) {
    const ch = (CONFUSABLE[raw] ?? raw).toLowerCase();
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) out += ch;
  }
  return out;
}

const onHost = (host: string, hosts: readonly string[]) =>
  hosts.some((h) => host === h || host.endsWith(`.${h}`));

/**
 * The well-known document client a name looks like (`Сlaude · from claude.ai` → `Claude`), unless
 * the client is a metadata document on that client's own host; undefined for a server client.
 */
export function lookalikeOf(name: string, row: ClientRowIdentity): string | undefined {
  const kind = clientKind(row);
  if (kind === "server") return undefined;
  const f = folded(name);
  const known = WELL_KNOWN.find((k) => f.includes(folded(k.name)));
  if (!known) return undefined;
  const host = kind === "document" ? (documentHost(row) ?? "").toLowerCase() : "";
  return kind === "document" && onHost(host.split(":")[0] ?? "", known.hosts)
    ? undefined
    : known.name;
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
