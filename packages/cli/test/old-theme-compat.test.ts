/**
 * Old theme copies keep rendering. `cloudhal init` copies the starter's `src/` into the project,
 * so a site's theme keeps calling `@cloudhal/astro-renderer` and `@cloudhal/core-ts` as they
 * were when it was created. Each frozen copy in `fixtures/theme-v*` (never updated, see its
 * README) is built with today's packages: in 0.3.12 `entryPath(entry)` changed shape and every
 * pre-0.3.11 theme served empty pages. The site also has a collection with typed fields
 * (RFC-0041): themes from before fields render its entries and simply do not show the values.
 * Its collection has RFC-0042's settings too (list fields, an `unlist` expiry, an `Event` preset)
 * and a page lists it by field: old themes keep the generic `BlogPosting`, and get the expiry, the
 * field listing (both live in the renderer's sources and `ContentList.astro`) and the collection's
 * feed (the renderer's middleware) on upgrade. RFC-0045: the collection also has a reference and a
 * repeater (enabled on the test's own store, as the shared suites do): themes that draw fields
 * get the target's link and the items from the renderer's `EntryFields.astro`, with no change of
 * their own; older ones show neither.
 */
import { spawn } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GATES_ENFORCED, SiteGraphStore } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { afterAll, describe, expect, it } from "vitest";
import { init, readProjectConfig, snapshot } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const BIN = path.resolve(here, "../bin/cloudhal.ts");
const FROZEN = ["v0.3.10", "v0.4.0", "v0.5.0", "v0.8.0"];
/** Themes from before RFC-0041 show no field values. */
const SHOWS_FIELDS = new Set(["v0.5.0", "v0.8.0"]);
/** Themes from RFC-0042 on draw the collection's JSON-LD preset (`withStructuredData`). */
const PRESETS = new Set(["v0.8.0"]);
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

/**
 * RFC-0041: an `events` collection with typed fields and one published entry with values; RFC-0042:
 * list fields, an `unlist` expiry and an `Event` preset, a past event and an `/events` page that
 * lists upcoming events by field.
 */
async function addTypedFields(projectDir: string): Promise<void> {
  const cfg = await readProjectConfig(projectDir);
  const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
  // RFC-0045: references and repeaters stay refused in production; the test enables them
  const store = new SiteGraphStore({
    sql: local.sql,
    blobs: local.blobs,
    gates: GATES_ENFORCED,
    fieldTypes: { supported: () => true },
  });
  try {
    const site = await store.getSite(cfg.siteId);
    if (!site) throw new Error("no site");
    // the seed's required category applies to every collection: reuse the seeded post's terms
    const [hello] = await store.listContentEntries(cfg.siteId, "posts");
    await store.updateSite({
      ...site,
      collections: {
        ...site.collections,
        places: {},
        events: {
          fields: [
            { key: "venue", type: "text", labels: { en: { label: "Venue" } }, localized: true },
            {
              key: "agenda",
              type: "richText",
              labels: { en: { label: "Agenda" } },
              localized: true,
            },
            {
              key: "startsAt",
              type: "datetime",
              labels: { en: { label: "Starts" } },
              localized: false,
            },
            {
              key: "endsAt",
              type: "datetime",
              labels: { en: { label: "Ends" } },
              localized: false,
            },
            { key: "city", type: "text", labels: { en: { label: "City" } }, localized: false },
            {
              key: "place",
              type: "reference",
              labels: { en: { label: "Place" } },
              localized: false,
              collections: ["places"],
            },
            {
              key: "lineup",
              type: "repeater",
              labels: { en: { label: "Lineup" } },
              localized: false,
              fields: [{ key: "act", type: "text", labels: { en: { label: "Act" } } }],
            },
          ],
          listFields: ["startsAt"],
          expiry: { field: "endsAt", action: "unlist" },
          structuredData: {
            type: "Event",
            properties: {
              startDate: { kind: "field", field: "startsAt" },
              "location.name": { kind: "field", field: "venue" },
              "location.address.addressLocality": { kind: "field", field: "city" },
            },
          },
        },
      },
    });
    const day = 86_400_000;
    const at = (ms: number) => ({ at: new Date(ms).toISOString(), timeZone: "Europe/Istanbul" });
    const now = Date.now();
    const pier = await store.createContentEntry({
      siteId: cfg.siteId,
      collection: "places",
      slug: "moda-pier",
      locale: site.defaultLocale,
      status: "published",
      title: "Moda Pier",
      body: { format: "markdown", value: "A pier on the Asian side, with a view of the old town." },
      fields: {},
      tags: [],
      ...(hello?.terms ? { terms: hello.terms } : {}),
      author: { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" },
    } as never);
    await store.createContentEntry({
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
      fields: {
        venue: "Kadıköy Hall",
        city: "Istanbul",
        agenda: "- Talks\n- Lunch",
        startsAt: at(now + 30 * day),
        endsAt: at(now + 30 * day + 1),
        place: pier.id,
        lineup: [{ act: "The Ferry Band" }, { act: "Night Owls" }],
      },
      tags: [],
      ...(hello?.terms ? { terms: hello.terms } : {}),
      author: { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" },
    } as never);
    await store.createContentEntry({
      siteId: cfg.siteId,
      collection: "events",
      slug: "retro",
      locale: site.defaultLocale,
      status: "published",
      title: "Retro night",
      body: { format: "markdown", value: "An evening that already happened, with music." },
      fields: { venue: "Moda Stage", startsAt: at(now - 3 * day), endsAt: at(now - 2 * day) },
      tags: [],
      ...(hello?.terms ? { terms: hello.terms } : {}),
      author: { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" },
    } as never);
    await store.createPage((await store.getSite(cfg.siteId)) ?? site, {
      siteId: cfg.siteId,
      path: "/events",
      title: "Events",
      locale: site.defaultLocale,
      status: "published",
      sections: [
        {
          id: "sec_upcomingevt1",
          kind: "contentList",
          collection: "events",
          limit: 10,
          sort: "newest",
          where: [{ field: "startsAt", op: "gte", value: "now" }],
          orderBy: { field: "startsAt", direction: "asc" },
        },
      ],
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
    // themes from before RFC-0041 do not show field values
    if (!SHOWS_FIELDS.has(version)) {
      expect(pages.event).not.toContain("Kadıköy Hall");
      expect(pages.event).not.toContain("The Ferry Band");
    } else {
      // RFC-0045: the renderer's EntryFields draws the reference as a link, the repeater's items
      expect(pages.event).toMatch(/<a href="\/places\/moda-pier"[^>]*>Moda Pier<\/a>/);
      expect(pages.event).toContain("The Ferry Band");
      expect(pages.event).toContain("Night Owls");
    }
    // RFC-0042: entryHead is unchanged, so themes from before it keep the generic BlogPosting;
    // later ones call withStructuredData and get the collection's Event preset
    const preset = PRESETS.has(version) ? "Event" : "BlogPosting";
    expect(pages.event).toContain(`"@type":"${preset}"`);
    expect(pages.event).not.toContain(`"@type":"${preset === "Event" ? "BlogPosting" : "Event"}"`);
    // the expiry and the field listing come with the renderer: a past event keeps its page but
    // leaves the listing, the sitemap and the feed
    expect(await read("events", "retro", "index.html")).toContain("Retro night");
    const listing = await read("events", "index.html");
    expect(listing).toContain('href="/events/launch"');
    expect(listing).not.toContain("/events/retro");
    expect(await read("sitemap.xml")).not.toContain("/events/retro");
    expect(await read("rss.xml")).not.toContain("Retro night");
    // RFC-0042 §5: the collection's own feed comes with the renderer too (the theme's feed route
    // answers 404 for it, the renderer's middleware answers with the feed)
    const feed = await read("events", "rss.xml");
    expect(feed).toContain("<title>Launch party</title>");
    expect(feed).not.toContain("Retro night");

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
