/**
 * Old theme copies keep rendering. `cloudhal init` copies the starter's `src/` into the project,
 * so a site's theme keeps calling `@cloudhal/astro-renderer` and `@cloudhal/core-ts` as they
 * were when it was created. Each frozen copy in `fixtures/theme-v*` (never updated, see its
 * README) is built with today's packages: in 0.3.12 `entryPath(entry)` changed shape and every
 * pre-0.3.11 theme served empty pages. The site also has a collection with typed fields
 * (RFC-0041): themes from before fields render its entries and simply do not show the values.
 */
import { spawn } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { afterAll, describe, expect, it } from "vitest";
import { init, readProjectConfig, snapshot } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const BIN = path.resolve(here, "../bin/cloudhal.ts");
const FROZEN = ["v0.3.10", "v0.4.0"];
const TITLE = "Old Theme Site";

/** Runs `cloudhal build` in its own process and returns its exit code and output. */
async function runBuild(projectDir: string): Promise<{ code: number | null; output: string }> {
  const { VITEST: _v, NODE_ENV: _n, ...env } = process.env;
  const child = spawn(process.execPath, [BIN, "build"], {
    cwd: projectDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (c: Buffer) => (output += c.toString()));
  child.stderr?.on("data", (c: Buffer) => (output += c.toString()));
  const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
  return { code, output };
}

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => path.join(e.parentPath, e.name));
}

/** RFC-0041: an `events` collection with typed fields and one published entry with values. */
async function addTypedFields(projectDir: string): Promise<void> {
  const cfg = await readProjectConfig(projectDir);
  const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
  try {
    const site = await local.store.getSite(cfg.siteId);
    if (!site) throw new Error("no site");
    // the seed's required category applies to every collection: reuse the seeded post's terms
    const [hello] = await local.store.listContentEntries(cfg.siteId, "posts");
    await local.store.updateSite({
      ...site,
      collections: {
        ...site.collections,
        events: {
          fields: [
            { key: "venue", type: "text", labels: { en: { label: "Venue" } }, localized: true },
            {
              key: "agenda",
              type: "richText",
              labels: { en: { label: "Agenda" } },
              localized: true,
            },
          ],
        },
      },
    });
    await local.store.createContentEntry({
      siteId: cfg.siteId,
      collection: "events",
      slug: "launch",
      locale: site.defaultLocale,
      status: "published",
      title: "Launch party",
      body: {
        format: "markdown",
        value: "Join us for the launch of the new site, everyone is welcome.",
      },
      fields: { venue: "Kadıköy Hall", agenda: "- Talks\n- Lunch" },
      tags: [],
      ...(hello?.terms ? { terms: hello.terms } : {}),
      author: { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" },
    } as never);
  } finally {
    await local.close();
  }
  await snapshot({ projectDir, label: "typed fields", publish: true });
}

/** The visible text of a page's <main> ("" without one). */
const mainText = (html: string) =>
  (html.match(/<main[^>]*>([\s\S]*)<\/main>/)?.[1] ?? "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe.each(FROZEN)("a theme copied at %s still builds with today's packages", (version) => {
  let tmp: string;
  afterAll(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it("renders the home page, an article and an archive, none of them empty", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-old-theme-"));
    const projectDir = path.join(tmp, "site");
    await init({ dir: projectDir, name: TITLE });
    await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
    await addTypedFields(projectDir);
    await rm(path.join(projectDir, "src"), { recursive: true });
    await cp(path.join(here, "fixtures", `theme-${version}`, "src"), path.join(projectDir, "src"), {
      recursive: true,
    });

    const { code, output } = await runBuild(projectDir);
    expect(code, output.slice(-4000)).toBe(0);
    expect(output, "the build logged an error").not.toMatch(/\[ERROR\]|\bError:/);

    const dist = path.join(projectDir, "dist");
    const read = (...p: string[]) => readFile(path.join(dist, ...p), "utf8");
    const pages = {
      home: await read("index.html"),
      article: await read("posts", "hello-world", "index.html"),
      archive: await read("category", "news", "index.html"),
      event: await read("events", "launch", "index.html"),
    };
    for (const [name, html] of Object.entries(pages)) {
      expect(html, name).toContain(TITLE);
      expect(mainText(html).length, name).toBeGreaterThan(80);
    }
    expect(pages.home).toMatch(/<h1[^>]*>Old Theme Site<\/h1>/);
    expect(pages.home).toContain('href="/posts/hello-world"');
    expect(pages.archive).toContain('href="/posts/hello-world"');
    expect(pages.article).toContain("<title>Hello, world · ");
    expect(pages.event).toContain("<title>Launch party · ");
    expect(pages.event).not.toContain("Kadıköy Hall"); // old themes do not show field values

    // No page of the build is empty (a theme that throws mid-stream leaves a bare document).
    const files = await htmlFiles(dist);
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      const html = await readFile(file, "utf8");
      if (html.includes('http-equiv="refresh"')) continue; // a redirect page
      expect(html, path.relative(dist, file)).toContain("</html>");
      expect(mainText(html).length, path.relative(dist, file)).toBeGreaterThan(10);
    }
  });
});
