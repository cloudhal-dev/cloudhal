/**
 * The newsroom's "editor agent": a small, deterministic MCP client that publishes the articles in
 * `content/posts/*.md` through Cloudhal's own MCP tools — the same path any AI agent takes.
 *
 *   node scripts/editor-agent.ts --project ../my-newsroom        # local: `cloudhal mcp` in that project
 *   node scripts/editor-agent.ts --url https://<admin>/mcp       # deployed; needs CLOUDHAL_API_KEY
 *   node scripts/editor-agent.ts ... --no-publish                # write + preview only
 *
 * Publishing stops for a person: the server asks for approval and this script relays the question
 * to your terminal. Without a terminal (CI) the answer is "decline".
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..");
const CLI = path.resolve(APP, "../../packages/cli/bin/cloudhal.ts");

interface Post {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  body: string;
}

export function parsePost(markdown: string): Post {
  const m = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error("post must start with frontmatter");
  const fm: Record<string, string> = {};
  for (const line of (m[1] as string).split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1] as string] = (kv[2] as string).replace(/^"(.*)"$/, "$1");
  }
  for (const key of ["slug", "title", "summary"])
    if (!fm[key]) throw new Error(`post frontmatter needs ${key}`);
  return {
    slug: fm.slug as string,
    title: fm.title as string,
    summary: fm.summary as string,
    tags: (fm.tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    body: (m[2] as string).trim(),
  };
}

function parseFrontmatterOnly(markdown: string): Record<string, string> {
  const block = markdown.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) out[kv[1] as string] = (kv[2] as string).replace(/^"(.*)"$/, "$1");
  }
  return out;
}

async function loadPosts(dir: string): Promise<Post[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  return Promise.all(files.map(async (f) => parsePost(await readFile(path.join(dir, f), "utf8"))));
}

async function ask(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.log(`  approval needed: ${question}\n  (no terminal attached — declining)`);
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\n  ${question}\n  Approve? [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

type ToolResult = {
  isError?: boolean;
  content: { type: string; text?: string }[];
  structuredContent?: unknown;
};

export async function runEditorAgent(options: {
  client: Client;
  postsDir: string;
  /** `content/site.md`: frontmatter `name` + `tagline` go on the home page hero. */
  siteFile?: string;
  publish: boolean;
  log?: (line: string) => void;
}): Promise<{
  created: string[];
  updated: string[];
  archived: string[];
  homeUpdated: boolean;
  published: boolean;
}> {
  const log = options.log ?? console.log;
  const call = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const r = (await options.client.callTool({ name, arguments: args })) as ToolResult;
    if (r.isError) throw new Error(`${name}: ${r.content.map((c) => c.text ?? "").join(" ")}`);
    return r.structuredContent as T;
  };

  const { sites } = await call<{ sites: { id: string; name: string }[] }>("list_sites", {});
  const site = sites[0];
  if (!site) throw new Error("no site found");
  const siteId = site.id;
  log(`site ${site.name} (${siteId})`);

  let homeUpdated = false;
  if (options.siteFile) {
    const fm = parseFrontmatterOnly(await readFile(options.siteFile, "utf8"));
    const { pages } = await call<{
      pages: {
        id: string;
        path: string;
        title: string;
        rev: number;
        sections: Record<string, unknown>[];
        seo?: Record<string, unknown>;
      }[];
    }>("list_pages", { siteId });
    const home = pages.find((p) => p.path === "/");
    const hero = home?.sections.find((sec) => sec.kind === "hero") as
      | { heading?: string; subheading?: string }
      | undefined;
    const alreadySet =
      home?.title === fm.name &&
      hero?.heading === fm.name &&
      (!fm.tagline || hero?.subheading === fm.tagline);
    if (home && fm.name && !alreadySet) {
      homeUpdated = true;
      const sections = home.sections.map((s) =>
        s.kind === "hero"
          ? { ...s, heading: fm.name, ...(fm.tagline ? { subheading: fm.tagline } : {}) }
          : s,
      );
      await call("update_page", {
        siteId,
        pageId: home.id,
        rev: home.rev,
        title: fm.name,
        sections,
        seo: {
          ...(home.seo ?? {}),
          title: fm.name,
          ...(fm.tagline ? { description: fm.tagline } : {}),
        },
      });
      log(`  home page set to "${fm.name}"`);
    }
  }

  const { entries } = await call<{
    entries: {
      id: string;
      slug: string;
      rev: number;
      status: string;
      title: string;
      summary?: string;
      body: { value: string };
      tags?: string[];
    }[];
  }>("list_entries", { siteId, collection: "posts" });
  const posts = await loadPosts(options.postsDir);
  const wanted = new Set(posts.map((p) => p.slug));
  const created: string[] = [];
  const updated: string[] = [];
  const archived: string[] = [];

  for (const post of posts) {
    const existing = entries.find((e) => e.slug === post.slug);
    let entry: { id: string; rev: number };
    const unchanged =
      existing &&
      existing.title === post.title &&
      (existing.summary ?? "") === post.summary &&
      existing.body.value === post.body &&
      (existing.tags ?? []).join(",") === post.tags.join(",");
    if (existing && unchanged) {
      entry = existing;
      if (existing.status === "published") {
        log(`  unchanged ${post.slug}`);
        continue;
      }
    } else if (existing) {
      entry = (
        await call<{ entry: { id: string; rev: number } }>("update_entry", {
          siteId,
          entryId: existing.id,
          rev: existing.rev,
          title: post.title,
          summary: post.summary,
          body: post.body,
          tags: post.tags,
        })
      ).entry;
      updated.push(post.slug);
    } else {
      entry = (
        await call<{ entry: { id: string; rev: number } }>("create_entry", {
          siteId,
          collection: "posts",
          slug: post.slug,
          title: post.title,
          summary: post.summary,
          body: post.body,
          tags: post.tags,
        })
      ).entry;
      created.push(post.slug);
    }
    const current = (
      await call<{ entry: { status: string; rev: number } }>("get_entry", {
        siteId,
        entryId: entry.id,
      })
    ).entry;
    if (current.status !== "published")
      await call("update_entry", {
        siteId,
        entryId: entry.id,
        rev: current.rev,
        status: "published",
      });
    const preview = await call<{ url: string | null }>("preview_page", {
      siteId,
      entryId: entry.id,
    });
    log(
      `  ${existing ? "updated" : "created"} ${post.slug}${preview.url ? `  preview: ${preview.url}` : ""}`,
    );
  }

  // Starter content that isn't part of the newsroom is archived, not deleted (deletion needs approval).
  for (const e of entries.filter((x) => !wanted.has(x.slug) && x.status !== "archived")) {
    await call("update_entry", { siteId, entryId: e.id, rev: e.rev, status: "archived" });
    archived.push(e.slug);
    log(`  archived ${e.slug}`);
  }

  const summary = { created, updated, archived, homeUpdated };
  if (!options.publish) return { ...summary, published: false };
  if (!created.length && !updated.length && !archived.length && !homeUpdated) {
    log("  nothing changed; not asking to publish");
    return { ...summary, published: false };
  }
  const r = (await options.client.callTool({
    name: "publish",
    arguments: { siteId, label: `Newsroom: ${posts.length} articles` },
  })) as ToolResult;
  if (r.isError) {
    log(`  not published: ${r.content.map((c) => c.text ?? "").join(" ")}`);
    return { ...summary, published: false };
  }
  const { snapshot } = r.structuredContent as { snapshot: { id: string } };
  log(`  published snapshot ${snapshot.id}`);
  return { ...summary, published: true };
}

async function main() {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      project: { type: "string" },
      content: { type: "string" },
      "no-publish": { type: "boolean" },
    },
  });
  const client = new Client(
    { name: "cloudhal-newsroom-editor", version: "0.0.1" },
    { capabilities: { elicitation: { form: {} } }, versionNegotiation: { mode: "auto" } },
  );
  client.setRequestHandler("elicitation/create", async (req) =>
    (await ask(req.params.message))
      ? { action: "accept", content: { confirm: true } }
      : { action: "decline" },
  );
  if (values.url) {
    const key = process.env.CLOUDHAL_API_KEY;
    if (!key)
      throw new Error(
        "set CLOUDHAL_API_KEY to an agent key with content:write (and site:publish to publish)",
      );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(values.url), {
        requestInit: { headers: { "x-api-key": key } },
      }),
    );
  } else {
    if (!values.project)
      throw new Error("pass --project <dir> (a `cloudhal init` project) or --url <admin>/mcp");
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [CLI, "mcp"],
        cwd: path.resolve(values.project),
        stderr: "inherit",
      }),
    );
  }
  try {
    await runEditorAgent({
      client,
      postsDir: path.join(values.content ?? path.join(APP, "content"), "posts"),
      siteFile: path.join(values.content ?? path.join(APP, "content"), "site.md"),
      publish: !values["no-publish"],
    });
  } finally {
    await client.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
