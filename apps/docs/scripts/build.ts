/**
 * Builds cloudhal.dev into `dist/` (ADR-0037):
 *
 * - `static/` as is (home page, /fetch, 404, `_headers`, `_redirects`, robots.txt);
 * - `/schemas/v1/<name>.schema.json` from `packages/core-contracts/schemas`, the permanent `$id`
 *   URLs, plus `/schemas/v1/index.json` listing them;
 * - `/llms.txt`, an index for agents (llmstxt.org);
 * - one `/docs/guides/<name>` redirect per guide, prepended to `_redirects` (static rules win over
 *   the `/docs/*` catch-all).
 *
 * Every schema's `$id` must already be its URL here; the build fails otherwise.
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMAS = path.resolve(APP, "../../packages/core-contracts/schemas");
const GUIDES = path.resolve(APP, "../../docs/guides");
const DIST = path.join(APP, "dist");
const ORIGIN = "https://cloudhal.dev";

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

function llmsTxt(schemas: readonly SchemaEntry[]): string {
  return [
    "# Cloudhal",
    "",
    "> Agent-native site platform: sites are typed graphs, agents change them through an MCP server behind a policy engine, and every change is a snapshot you can diff, preview and roll back. Runs on Cloudflare or self-hosted. Open source, TypeScript.",
    "",
    "## Docs",
    "",
    "- [README](https://raw.githubusercontent.com/cloudhal-dev/cloudhal/main/README.md): install, first site, connect an agent",
    "- [Guides](https://github.com/cloudhal-dev/cloudhal/tree/main/docs/guides): deploy button, search, schedules, comments, multi-site, translations",
    "- [Architecture decisions](https://github.com/cloudhal-dev/cloudhal/tree/main/docs/adr)",
    "- [AGENTS.md](https://raw.githubusercontent.com/cloudhal-dev/cloudhal/main/AGENTS.md): conventions for coding agents working on Cloudhal",
    "",
    "## JSON Schemas (v1)",
    "",
    ...schemas.map((s) => `- [${s.title}](${s.url})`),
    "",
    "## Optional",
    "",
    "- [Fetcher](https://cloudhal.dev/fetch): what the Cloudhal-Fetch/1 user agent requests",
    "- [Playground](https://try.cloudhal.com): a private Cloudhal site for one hour, no account",
    "",
  ].join("\n");
}

await rm(DIST, { recursive: true, force: true });
await cp(path.join(APP, "static"), DIST, { recursive: true });
const schemas = await copySchemas();
await writeFile(path.join(DIST, "llms.txt"), llmsTxt(schemas));
const guides = (await readdir(GUIDES)).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
const redirects = path.join(DIST, "_redirects");
await writeFile(
  redirects,
  guides
    .map(
      (g) =>
        `/docs/guides/${g} https://github.com/cloudhal-dev/cloudhal/blob/main/docs/guides/${g}.md 302`,
    )
    .join("\n")
    .concat("\n", await readFile(redirects, "utf8")),
);
console.log(`built cloudhal.dev: ${schemas.length} schemas`);
