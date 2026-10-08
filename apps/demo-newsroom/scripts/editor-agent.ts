/**
 * The newsroom's "editor agent": a small, deterministic MCP client that publishes the articles in
 * `content/posts/*.md` through Cloudhal's own MCP tools — the same path any AI agent takes.
 *
 *   node scripts/editor-agent.ts --project ../my-newsroom        # local: `cloudhal mcp` in that project
 *   node scripts/editor-agent.ts --url https://<admin>/mcp       # deployed; CLOUDHAL_API_KEY or --key-file
 *   node scripts/editor-agent.ts ... --no-publish                # write + preview only
 *   node scripts/editor-agent.ts ... --yes                       # a person already approved this
 *                                                                # publish elsewhere; answer "yes"
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

/** `--yes` stands for a person who already approved this publish; the question is still logged. */
async function approve(question: string, preApproved: boolean): Promise<boolean> {
  if (!preApproved) return ask(question);
  console.log(`  approval: ${question}\n  → yes (--yes: approved by the person running this)`);
  return true;
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

/**
 * Interim (RFC-0002): on a site with a `tag` taxonomy the store turns `tags` into term ids and
 * stores `tags: []`, so the slugs can't be compared until this agent reads terms over MCP. Until
 * then, the same number of tag terms counts as unchanged; sites without taxonomies (the deployed
 * newsroom) still compare slugs.
 */
function sameTags(
  existing: { tags?: string[]; terms?: { tag?: { ids: string[] } } },
  wanted: string[],
): boolean {
  if ((existing.tags ?? []).length > 0 || !existing.terms?.tag)
    return (existing.tags ?? []).join(",") === wanted.join(",");
  return existing.terms.tag.ids.length === wanted.length;
}

export async function runEditorAgent(options: {
  client: Client;
  postsDir: string;
  /** `content/site.md`: frontmatter `name` + `tagline` go on the home page hero. */
  siteFile?: string;
  publish: boolean;
  log?: (line: string) => void;
  /**
   * When the server asks a person in Studio (agent keys), poll this long for the decision.
   * Default 15 minutes; 0 = ask once and stop.
   */
  approvalWaitMs?: number;
  approvalPollMs?: number;
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
      terms?: { tag?: { ids: string[] } };
      author: { kind: string; id: string };
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
      sameTags(existing, post.tags);
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

  // Only the starter's own sample content (written by the system seed) is archived — never what a
  // person or another agent wrote. Archived, not deleted (deletion needs approval).
  const isStarterSample = (x: (typeof entries)[number]) => x.author?.kind === "system";
  for (const e of entries.filter(
    (x) => !wanted.has(x.slug) && x.status !== "archived" && isStarterSample(x),
  )) {
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
  const publishArgs = { siteId, label: `Newsroom: ${posts.length} articles` };
  let r = (await options.client.callTool({
    name: "publish",
    arguments: publishArgs,
  })) as ToolResult;
  const text = (x: ToolResult) => x.content.map((c) => c.text ?? "").join(" ");
  const approvalId = r.isError ? text(r).match(/approvalId: (appr_\w+)/)?.[1] : undefined;
  if (approvalId) {
    // Agent keys never approve themselves: a person decides in Studio, then the same call is
    // repeated with the approvalId.
    log(`  waiting for a person to approve ${approvalId} in Studio (site → Activity → Approvals)`);
    const deadline = Date.now() + (options.approvalWaitMs ?? 15 * 60_000);
    for (;;) {
      r = (await options.client.callTool({
        name: "publish",
        arguments: { ...publishArgs, approvalId },
      })) as ToolResult;
      if (!r.isError || !/still waiting/.test(text(r)) || Date.now() > deadline) break;
      await new Promise((res) => setTimeout(res, options.approvalPollMs ?? 5000));
    }
  }
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
      yes: { type: "boolean" },
      "key-file": { type: "string" },
    },
  });
  const client = new Client(
    { name: "cloudhal-newsroom-editor", version: "0.0.1" },
    { capabilities: { elicitation: { form: {} } }, versionNegotiation: { mode: "auto" } },
  );
  client.setRequestHandler("elicitation/create", async (req) =>
    (await approve(req.params.message, values.yes ?? false))
      ? { action: "accept", content: { confirm: true } }
      : { action: "decline" },
  );
  if (values.url) {
    // Key from the environment, or a file kept out of git (e.g. <project>/.cloudhal/deploy/agent-key).
    const key =
      process.env.CLOUDHAL_API_KEY ??
      (values["key-file"] ? (await readFile(values["key-file"], "utf8")).trim() : undefined);
    if (!key)
      throw new Error(
        "set CLOUDHAL_API_KEY or pass --key-file: an agent key with content:write (and site:publish to publish)",
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
