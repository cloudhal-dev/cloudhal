/**
 * Runs after `astro build` and completes cloudhal.dev's `dist/` (ADR-0037, ADR-0039):
 *
 * - `static/` (`_headers`, robots.txt) and `_redirects` from `src/lib/redirects.ts`;
 * - `/schemas/v1/<name>.schema.json` at the permanent `$id` URLs, plus `index.json`; the build
 *   fails when a schema's `$id` is not its URL here;
 * - every page as Markdown at `<path>.md` and `<path>/index.md`, links absolute;
 * - `/llms.txt`, `/llms-full.txt` and one pair per section (llmstxt.org).
 */
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allPages, type Page } from "../src/lib/pages.ts";
import { redirectLines } from "../src/lib/redirects.ts";
import { ORIGIN } from "../src/lib/repo-docs.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(APP, "../..");
const SCHEMAS = path.join(REPO, "packages/core-contracts/schemas");
const DIST = path.join(APP, "dist");

/** Sections with their own `llms.txt`, in index order. */
const SECTIONS = [
  { key: "start", prefix: "docs/start/", title: "Start" },
  { key: "agents", prefix: "docs/agents", title: "Agents and MCP" },
  { key: "reference", prefix: "docs/reference/", title: "Reference" },
  { key: "guides", prefix: "docs/guides/", title: "Guides" },
  { key: "contributing", prefix: "docs/", title: "Contributing and internals" },
  { key: "adr", prefix: "docs/adr", title: "Architecture decisions" },
  { key: "rfcs", prefix: "docs/rfcs", title: "Proposals" },
] as const;

interface SchemaEntry {
  readonly name: string;
  readonly url: string;
  readonly title: string;
}

async function copySchemas(): Promise<SchemaEntry[]> {
  const out = path.join(DIST, "schemas/v1");
  await mkdir(out, { recursive: true });
  const entries: SchemaEntry[] = [];
  for (const file of (await readdir(SCHEMAS)).filter((f) => f.endsWith(".schema.json")).sort()) {
    const text = await readFile(path.join(SCHEMAS, file), "utf8");
    const schema = JSON.parse(text) as { $id?: string; title?: string };
    const url = `${ORIGIN}/schemas/v1/${file}`;
    if (schema.$id !== url) throw new Error(`${file}: $id is ${schema.$id}, expected ${url}`);
    await writeFile(path.join(out, file), text);
    entries.push({ name: file, url, title: schema.title ?? file });
  }
  await writeFile(
    path.join(out, "index.json"),
    `${JSON.stringify({ version: 1, schemas: entries }, null, 2)}\n`,
  );
  return entries;
}

const urlOf = (page: Page) => (page.id === "index" ? `${ORIGIN}/` : `${ORIGIN}/${page.id}`);

function markdownOf(page: Page): string {
  const front = [
    "---",
    `title: ${JSON.stringify(page.title)}`,
    `description: ${JSON.stringify(page.description)}`,
    `url: ${urlOf(page)}`,
    ...(page.file
      ? [`source: https://github.com/cloudhal-dev/cloudhal/blob/main/${page.file}`]
      : []),
    "---",
    "",
  ];
  return `${front.join("\n")}# ${page.title}\n\n${page.body.trim()}\n`;
}

async function writeMarkdown(pages: readonly Page[]): Promise<void> {
  for (const page of pages) {
    const md = markdownOf(page);
    const base = page.id === "index" ? "index" : page.id;
    await mkdir(path.dirname(path.join(DIST, `${base}.md`)), { recursive: true });
    await writeFile(path.join(DIST, `${base}.md`), md);
    if (page.id !== "index") {
      await mkdir(path.join(DIST, page.id), { recursive: true });
      await writeFile(path.join(DIST, page.id, "index.md"), md);
    }
  }
}

function sectionOf(page: Page): (typeof SECTIONS)[number] | undefined {
  if (!page.id.startsWith("docs/")) return undefined;
  return SECTIONS.find((s) =>
    s.key === "contributing"
      ? !/^docs\/(start|agents|reference|guides|adr|rfcs)(\/|$)/.test(page.id)
      : page.id === s.prefix || page.id.startsWith(s.prefix),
  );
}

const linkLine = (page: Page) => `- [${page.title}](${urlOf(page)}.md): ${page.description}`;

function llmsIndex(pages: readonly Page[], schemas: readonly SchemaEntry[]): string {
  const lines = [
    "# Cloudhal",
    "",
    "> Agent-native site platform: sites are typed graphs, agents change them through an MCP server behind a policy engine, and every change is a snapshot you can diff, preview and roll back. Runs on Cloudflare or self-hosted. Open source, TypeScript.",
    "",
    "Every page below is Markdown. The full text is in /llms-full.txt; each section also has its own llms.txt and llms-full.txt.",
    "",
    "## Start",
    "",
    ...pages.filter((p) => !p.id.startsWith("docs/") || p.id === "docs").map(linkLine),
  ];
  for (const section of SECTIONS) {
    lines.push("", `## ${section.title}`, "");
    lines.push(...pages.filter((p) => p.id !== "docs" && sectionOf(p) === section).map(linkLine));
  }
  lines.push("", "## JSON Schemas (v1)", "", ...schemas.map((s) => `- [${s.title}](${s.url})`), "");
  return lines.join("\n");
}

const fullText = (pages: readonly Page[]) => pages.map(markdownOf).join("\n\n");

async function writeLlms(pages: readonly Page[], schemas: readonly SchemaEntry[]): Promise<void> {
  await writeFile(path.join(DIST, "llms.txt"), llmsIndex(pages, schemas));
  await writeFile(path.join(DIST, "llms-full.txt"), fullText(pages));
  for (const section of SECTIONS) {
    const own = pages.filter((p) => p.id !== "docs" && sectionOf(p) === section);
    const dir = path.join(DIST, "docs", section.key);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "llms.txt"),
      [`# Cloudhal: ${section.title}`, "", ...own.map(linkLine), ""].join("\n"),
    );
    await writeFile(path.join(dir, "llms-full.txt"), fullText(own));
  }
}

await cp(path.join(APP, "static"), DIST, { recursive: true });
await writeFile(path.join(DIST, "_redirects"), `${redirectLines().join("\n")}\n`);
const schemas = await copySchemas();
const pages = allPages(REPO, true);
await writeMarkdown(pages);
await writeLlms(pages, schemas);
console.log(`cloudhal.dev: ${pages.length} pages, ${schemas.length} schemas`);
