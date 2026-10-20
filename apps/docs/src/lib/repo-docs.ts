/**
 * The repo's `docs/` folder as cloudhal.dev pages (ADR-0039). Pure functions over file paths and
 * Markdown text, shared by the Starlight content loader and the post-build step (`.md` per page,
 * `llms.txt`), so both publish the same pages under the same URLs.
 *
 * Paths are repo-relative with forward slashes (`docs/adr/0012-workers.md`). A page's id is its
 * URL path without the leading slash: lower case, no `.md`, `README.md` standing for its folder.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const ORIGIN = "https://cloudhal.dev";
export const REPO_BLOB = "https://github.com/cloudhal-dev/cloudhal/blob/main";
export const REPO_TREE = "https://github.com/cloudhal-dev/cloudhal/tree/main";

export interface RepoDoc {
  /** `docs/adr/0012-workers` (also the URL path). */
  readonly id: string;
  /** `docs/adr/0012-workers.md`, repo-relative. */
  readonly file: string;
  readonly title: string;
  readonly description: string;
  /** Short label for the sidebar (ADRs and RFCs). */
  readonly label?: string;
  /** Sort key for the sidebar (ADR and RFC number). */
  readonly order?: number;
  /** The Markdown without its H1, links rewritten to site or GitHub URLs. */
  readonly body: string;
}

/** `docs/contributing/README.md` → `docs/contributing`; `docs/design/DESIGN.md` → `docs/design/design`. */
export function docId(file: string): string {
  return file
    .replace(/\.md$/, "")
    .replace(/\/README$/i, "")
    .toLowerCase();
}

/** Every Markdown file under `docs/`, repo-relative and sorted. */
export function listDocs(repoRoot: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(path.join(repoRoot, rel)).sort()) {
      const child = `${rel}/${name}`;
      if (statSync(path.join(repoRoot, child)).isDirectory()) walk(child);
      else if (name.endsWith(".md")) out.push(child);
    }
  };
  walk("docs");
  return out;
}

/** Splits off the first `# ` heading. Files without one use the file name as title. */
export function splitTitle(markdown: string, file: string): { title: string; rest: string } {
  const match = /^#[ \t]+(.+?)[ \t]*$/m.exec(markdown);
  if (!match || markdown.slice(0, match.index).trim() !== "") {
    return { title: path.basename(file, ".md"), rest: markdown };
  }
  return {
    title: match[1] ?? "",
    rest: markdown.slice(match.index + match[0].length).replace(/^\s*\n/, ""),
  };
}

const PROSE_SKIP = /^(?:[-*+>|#]|\d+\.|```|<|!\[)/;

function firstParagraph(text: string): string {
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.trim().split("\n");
    if (!lines[0] || PROSE_SKIP.test(lines[0].trim())) continue;
    return lines.join(" ").trim();
  }
  return "";
}

/** Plain text of a Markdown snippet: links, emphasis and code marks removed. */
function plain(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** At most `max` characters, cut at a sentence or word boundary. */
function clip(text: string, max = 220): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = cut.lastIndexOf(". ");
  if (sentence > max / 2) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/** The first paragraph of a section, else its first list item (summaries written as lists). */
function firstText(section: string): string {
  const paragraph = firstParagraph(section);
  if (paragraph) return paragraph;
  return /^[-*+][ \t]+(.+)$/m.exec(section)?.[1] ?? "";
}

/** The first text under `## Summary` or `## Context`, else the first paragraph. */
export function describe(body: string): string {
  for (const heading of ["Summary", "Context"]) {
    const at = new RegExp(`^##[ \\t]+${heading}\\b.*$`, "m").exec(body);
    if (at) {
      const rest = body.slice(at.index + at[0].length);
      const next = /^##[ \t]/m.exec(rest);
      const text = firstText(next ? rest.slice(0, next.index) : rest);
      if (text) return clip(plain(text));
    }
  }
  return clip(plain(firstParagraph(body)));
}

/** `ADR-0039: cloudhal.dev: Starlight …` → label `0039 · cloudhal.dev`, order 39. */
export function numbered(title: string): { label: string; order: number } | undefined {
  const match = /^(?:ADR|RFC)-(\d{4}):?\s*(.*)$/.exec(title);
  if (!match) return undefined;
  const subject = (match[2] ?? "").split(/:\s|\s\(|,\s/)[0] ?? "";
  const short = subject.length > 44 ? `${subject.slice(0, 43).trimEnd()}…` : subject;
  return { label: `${match[1]} · ${short}`, order: Number(match[1]) };
}

/** Where a link from `file` to `target` points on the site, or on GitHub for non-docs files. */
export function resolveLink(file: string, target: string, repoRoot: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) return target;
  const hashAt = target.indexOf("#");
  const pathPart = hashAt === -1 ? target : target.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : target.slice(hashAt);
  if (pathPart === "") return target;
  const rel = path.posix.normalize(path.posix.join(path.posix.dirname(file), pathPart));
  if (rel.startsWith("../")) return target;
  if (rel.startsWith("docs/") && rel.endsWith(".md")) return `/${docId(rel)}${hash.toLowerCase()}`;
  const full = path.join(repoRoot, rel);
  const isDir = existsSync(full) && statSync(full).isDirectory();
  return `${isDir ? REPO_TREE : REPO_BLOB}/${rel.replace(/\/$/, "")}${hash}`;
}

/**
 * Rewrites inline links and reference definitions outside fenced code. `absolute` makes site
 * links absolute (`https://cloudhal.dev/…`), for Markdown read outside the site.
 */
export function rewriteLinks(
  markdown: string,
  file: string,
  repoRoot: string,
  absolute = false,
): string {
  const fix = (target: string) => {
    const url = resolveLink(file, target, repoRoot);
    return absolute && url.startsWith("/") ? `${ORIGIN}${url}` : url;
  };
  return markdown
    .split(/(^```[\s\S]*?^```[ \t]*$)/m)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/(\]\()(<[^>]+>|[^)\s]+)/g, (_, open: string, target: string) => {
              const bare = target.replace(/^<|>$/g, "");
              return `${open}${fix(bare)}`;
            })
            .replace(/^(\[[^\]]+\]:[ \t]+)(\S+)/gm, (_, def: string, target: string) => {
              return `${def}${fix(target)}`;
            }),
    )
    .join("");
}

/** The first word after `- Status:` (`Accepted`, `Draft`, …), if the doc has one. */
export function status(markdown: string): string | undefined {
  return /^[-*][ \t]+Status:[ \t]*\**([A-Za-z]+)/m.exec(markdown)?.[1];
}

/** A generated index for a folder without a README (`docs/rfcs`): one table row per doc. */
export function folderIndex(
  repoRoot: string,
  dir: string,
  title: string,
): { id: string; title: string; description: string; body: string } {
  const rows = listDocs(repoRoot)
    .filter((f) => path.posix.dirname(f) === dir)
    .map((file) => {
      const source = readFileSync(path.join(repoRoot, file), "utf8");
      const doc = readDoc(repoRoot, file);
      return `| [${doc.title}](/${doc.id}) | ${status(source) ?? ""} |`;
    });
  return {
    id: dir,
    title,
    description: `Every ${title.toLowerCase()} in Cloudhal's repository, with its status.`,
    body: ["| Document | Status |", "|---|---|", ...rows, ""].join("\n"),
  };
}

/** Reads one doc. `absolute` as in `rewriteLinks`. */
export function readDoc(repoRoot: string, file: string, absolute = false): RepoDoc {
  const source = readFileSync(path.join(repoRoot, file), "utf8");
  const { title, rest } = splitTitle(source, file);
  const body = rewriteLinks(rest, file, repoRoot, absolute);
  const num =
    file.startsWith("docs/adr/") || file.startsWith("docs/rfcs/") ? numbered(title) : undefined;
  return {
    id: docId(file),
    file,
    title: plain(title),
    description: describe(rest),
    ...(num ? { label: num.label, order: num.order } : {}),
    body,
  };
}
