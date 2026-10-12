/**
 * The newsroom's "editor agent": a small, deterministic MCP client that publishes the articles in
 * `content/posts/*.md` through Cloudhal's own MCP tools — the same path any AI agent takes.
 *
 *   node scripts/editor-agent.ts --project ../my-newsroom        # local: `cloudhal mcp` in that project
 *   node scripts/editor-agent.ts --url https://<admin>/mcp       # deployed; CLOUDHAL_API_KEY or --key-file
 *   node scripts/editor-agent.ts ... --no-publish                # write + preview only
 *   node scripts/editor-agent.ts ... --yes                       # a person already approved this
 *                                                                # publish elsewhere; answer "yes"
 *   node scripts/editor-agent.ts ... --at 2026-11-02T09:00       # schedule instead of publishing now:
 *                                                                # a release at that wall-clock time
 *                                                                # in the site's zone (RFC-0008)
 *
 * Publishing stops for a person: the server asks for approval and this script relays the question
 * to your terminal. Without a terminal (CI) the answer is "decline".
 *
 * `--at` schedules what this run changed as one release (`schedule_release`): a local time
 * (`2026-11-02T09:00`, in the site's time zone), an instant (`2026-11-02T06:00:00Z`) or
 * `on-approval`. The release pins exactly the versions written now; a person approves them once in
 * Studio and Cloudhal publishes them at that time. The script does not wait or poll for it.
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

/** `--at`: a wall-clock time in the site's zone, an instant, or `on-approval` (RFC-0008 §12). */
export type ScheduleWhen = "on-approval" | { localTime: string } | { at: string };

export function parseWhen(value: string): ScheduleWhen {
  const v = value.trim();
  if (v === "on-approval") return "on-approval";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return { localTime: v };
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v))
    return { at: v };
  throw new Error(
    `--at takes a local time (2026-11-02T09:00, in the site's time zone), an instant (2026-11-02T06:00:00Z) or on-approval; got "${value}"`,
  );
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

type Call = <T>(name: string, args: Record<string, unknown>) => Promise<T>;

interface TermView {
  id: string;
  slug: string;
  status: string;
}

/**
 * The site's vocabulary, read before writing (RFC-0002): agents reuse terms, propose the tags
 * they need (a person approves them before they go public) and file articles under an existing
 * category — categories are people-only. Sites without taxonomies keep plain `tags`.
 */
interface Vocabulary {
  legacy: boolean;
  /** tag slug → term id (active and proposed). */
  tags: Map<string, string>;
  slugOf: Map<string, string>;
  /** Category to file articles under when they have none yet. */
  categoryId?: string;
}

async function allTerms(call: Call, siteId: string, taxonomy: string): Promise<TermView[]> {
  const out: TermView[] = [];
  let cursor: string | undefined;
  do {
    const page = await call<{ terms: TermView[]; nextCursor?: string }>("list_terms", {
      siteId,
      taxonomy,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    out.push(...page.terms);
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

const humanize = (slug: string) => slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

async function prepareVocabulary(
  call: Call,
  siteId: string,
  posts: Post[],
  log: (line: string) => void,
): Promise<Vocabulary> {
  const { taxonomies } = await call<{ taxonomies: { key: string }[] }>("list_taxonomies", {
    siteId,
  });
  const keys = new Set(taxonomies.map((t) => t.key));
  const vocab: Vocabulary = { legacy: !keys.has("tag"), tags: new Map(), slugOf: new Map() };
  if (keys.has("tag")) {
    for (const t of await allTerms(call, siteId, "tag")) {
      vocab.tags.set(t.slug, t.id);
      vocab.slugOf.set(t.id, t.slug);
    }
    for (const slug of [...new Set(posts.flatMap((p) => p.tags))]) {
      if (vocab.tags.has(slug)) continue;
      const users = posts.filter((p) => p.tags.includes(slug)).map((p) => p.slug);
      const { term, existing } = await call<{ term: TermView; existing: boolean }>("propose_term", {
        siteId,
        taxonomy: "tag",
        name: humanize(slug),
        slug,
        reason: `Used by the newsroom article${users.length > 1 ? "s" : ""} ${users.join(", ")}`,
      });
      vocab.tags.set(slug, term.id);
      vocab.slugOf.set(term.id, term.slug);
      if (!existing) log(`  proposed tag ${slug} (a person approves it before it is public)`);
    }
  }
  if (keys.has("category")) {
    const categories = (await allTerms(call, siteId, "category")).filter(
      (t) => t.status === "active",
    );
    const category = categories.find((t) => t.slug === "news") ?? categories[0];
    if (category) vocab.categoryId = category.id;
  }
  return vocab;
}

export async function runEditorAgent(options: {
  client: Client;
  postsDir: string;
  /** `content/site.md`: frontmatter `name` + `tagline` go on the home page hero. */
  siteFile?: string;
  publish: boolean;
  /**
   * Schedule what this run changed as one release instead of publishing now (`--at`). Needs a
   * server with schedules and a key with `schedules:write`.
   */
  scheduleAt?: ScheduleWhen;
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
  /** With `scheduleAt`: the release and whether it is scheduled or waits for a person. */
  scheduled?: { releaseId: string; status: string; approvalId?: string };
}> {
  const log = options.log ?? console.log;
  const call: Call = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
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
  /** Every node this run changed: what a scheduled release pins. */
  const changedIds: string[] = [];
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
      changedIds.push(home.id);
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
      terms?: { tag?: { ids: string[] }; category?: { ids: string[]; primary?: string } };
      author: { kind: string; id: string };
    }[];
  }>("list_entries", { siteId, collection: "posts" });
  const posts = await loadPosts(options.postsDir);
  const vocab = await prepareVocabulary(call, siteId, posts, log);
  const wanted = new Set(posts.map((p) => p.slug));
  /** What to send for an article's terms; a category a person already chose is kept. */
  const termsFor = (post: Post, existing?: (typeof entries)[number]) => {
    if (vocab.legacy) return { tags: post.tags };
    const terms: Record<string, unknown> = {
      tag: { set: post.tags.map((t) => vocab.tags.get(t)) },
    };
    if (vocab.categoryId && !existing?.terms?.category?.primary)
      terms.category = { set: [vocab.categoryId], primary: vocab.categoryId };
    return { terms };
  };
  const sameTerms = (existing: (typeof entries)[number], post: Post) => {
    if (vocab.legacy) return (existing.tags ?? []).join(",") === post.tags.join(",");
    const slugs = (existing.terms?.tag?.ids ?? []).map((id) => vocab.slugOf.get(id) ?? id);
    const filed = !vocab.categoryId || Boolean(existing.terms?.category?.primary);
    return filed && slugs.join(",") === post.tags.join(",");
  };
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
      sameTerms(existing, post);
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
          ...termsFor(post, existing),
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
          ...termsFor(post),
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
    changedIds.push(entry.id);
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
    changedIds.push(e.id);
    archived.push(e.slug);
    log(`  archived ${e.slug}`);
  }

  const summary = { created, updated, archived, homeUpdated };
  if (!options.publish) return { ...summary, published: false };
  if (!created.length && !updated.length && !archived.length && !homeUpdated) {
    log("  nothing changed; not asking to publish");
    return { ...summary, published: false };
  }
  if (options.scheduleAt) {
    // RFC-0008: one release pinning exactly these versions. A person approves it once in Studio
    // (agent keys never approve their own); Cloudhal publishes it at its time. Nothing to poll.
    const r = (await options.client.callTool({
      name: "schedule_release",
      arguments: {
        siteId,
        nodeIds: [...new Set(changedIds)],
        title: `Newsroom: ${posts.length} articles`,
        when: options.scheduleAt,
      },
    })) as ToolResult;
    if (r.isError) {
      log(`  not scheduled: ${r.content.map((c) => c.text ?? "").join(" ")}`);
      return { ...summary, published: false };
    }
    const out = r.structuredContent as {
      release: {
        id: string;
        when?: { kind: string; at?: string; localTime?: string; timeZone?: string };
      };
      status: string;
      approvalId?: string;
    };
    const w = out.release.when;
    const at =
      w?.kind === "at"
        ? `at ${w.localTime ? `${w.localTime} (${w.timeZone})` : w.at}`
        : "as soon as it is approved";
    log(
      out.status === "scheduled"
        ? `  scheduled release ${out.release.id}: publishes ${at}`
        : `  release ${out.release.id} (publishes ${at}) waits for a person: approve request ${out.approvalId} in Studio (site → Activity → Approvals); Cloudhal publishes it then — no need to keep this running`,
    );
    return {
      ...summary,
      published: false,
      scheduled: {
        releaseId: out.release.id,
        status: out.status,
        ...(out.approvalId ? { approvalId: out.approvalId } : {}),
      },
    };
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
      at: { type: "string" },
      yes: { type: "boolean" },
      "key-file": { type: "string" },
    },
  });
  if (values.at !== undefined && values["no-publish"])
    throw new Error("--at schedules a publish; it cannot be combined with --no-publish");
  const scheduleAt = values.at !== undefined ? parseWhen(values.at) : undefined;
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
        "set CLOUDHAL_API_KEY or pass --key-file: an agent key with content:write (and site:publish to publish, or schedules:write for --at)",
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
      ...(scheduleAt ? { scheduleAt } : {}),
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
