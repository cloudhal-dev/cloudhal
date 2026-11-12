/**
 * RFC-0045 §4 through the real pipeline: the starter's `EntryFields.astro` draws a reference's
 * card by its graph path, and the locale middleware (`localizeLinks`) gives it the page's locale
 * exactly once. Built with `cloudhal build` under `prefix-except-default` and `prefix-all`: a
 * Turkish referrer links its venue's Turkish member at `/tr/places/…` (never `/tr/tr/…`), and a
 * fallback card (`default-with-notice`) links the default locale's member. The types stay refused
 * in production; the test enables them on its own store, as the shared suites do.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { GATES_ENFORCED, nodeHash, SiteGraphStore } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { afterAll, describe, expect, it } from "vitest";
import { init, readProjectConfig, snapshot } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const STARTER_NODE_MODULES = path.resolve(here, "../../../starters/blog/node_modules");
const BIN = path.resolve(here, "../bin/cloudhal.ts");
const author = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };

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

/** Places with a Turkish member (`hall`/`salon`) and without (`pier`), and events naming them. */
async function addReferences(
  projectDir: string,
  routing: "prefix-except-default" | "prefix-all",
): Promise<void> {
  const cfg = await readProjectConfig(projectDir);
  const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
  const store = new SiteGraphStore({
    sql: local.sql,
    blobs: local.blobs,
    gates: GATES_ENFORCED,
    fieldTypes: { supported: () => true },
  });
  try {
    const site = (await store.getSite(cfg.siteId)) as Site;
    // the seed's required category applies to every collection: reuse the seeded post's terms
    const [hello] = await store.listContentEntries(cfg.siteId, "posts");
    await store.updateSite({
      ...site,
      locales: ["en", "tr"],
      localization: { ...site.localization, routing, fallback: "default-with-notice" },
      collections: {
        ...site.collections,
        places: {},
        events: {
          fields: [
            {
              key: "venue",
              type: "reference",
              labels: { en: { label: "Venue" }, tr: { label: "Mekan" } },
              localized: false,
              collections: ["places"],
            },
          ],
        },
      },
    });
    const make = (collection: string, slug: string, over: Partial<ContentEntry>) =>
      store.createContentEntry({
        siteId: cfg.siteId,
        collection,
        slug,
        locale: "en",
        status: "published",
        title: `The ${slug}`,
        body: { format: "markdown", value: `A page about the ${slug}, with enough words to read.` },
        fields: {},
        tags: [],
        ...(hello?.terms ? { terms: hello.terms } : {}),
        author,
        ...over,
      } as never) as Promise<ContentEntry>;
    const translate = async (of: ContentEntry, slug: string) =>
      make(of.collection, slug, {
        locale: "tr",
        title: `Türkçe ${slug}`,
        translation: {
          group: of.id,
          method: "human",
          source: { id: of.id, locale: of.locale, rev: of.rev, hash: await nodeHash(of) },
        },
      });
    const hall = await make("places", "hall", {});
    await translate(hall, "salon");
    const pier = await make("places", "pier", {});
    await translate(await make("events", "launch", { fields: { venue: hall.id } }), "lansman");
    await translate(await make("events", "gig", { fields: { venue: pier.id } }), "konser");
  } finally {
    await local.close();
  }
  await snapshot({ projectDir, label: "references", publish: true });
}

/** The hrefs inside a page's typed-fields list. */
const fieldLinks = (html: string) =>
  [
    ...(html.match(/<dl class="ch-fields"[\s\S]*?<\/dl>/)?.[0] ?? "").matchAll(/href="([^"]*)"/g),
  ].map((m) => m[1]);

describe.each(["prefix-except-default", "prefix-all"] as const)(
  "reference links in built pages (%s)",
  (routing) => {
    let tmp: string;
    afterAll(async () => {
      if (tmp) await rm(tmp, { recursive: true, force: true });
    });

    it("links each card once in the page's locale, the fallback in the default locale", async () => {
      tmp = await mkdtemp(path.join(os.tmpdir(), "cloudhal-ref-links-"));
      const projectDir = path.join(tmp, "site");
      await init({ dir: projectDir, name: "Reference Links" });
      await symlink(STARTER_NODE_MODULES, path.join(projectDir, "node_modules"), "dir");
      await addReferences(projectDir, routing);
      const { code, output } = await runBuild(projectDir);
      expect(code, output.slice(-4000)).toBe(0);
      const read = (...p: string[]) => readFile(path.join(projectDir, "dist", ...p), "utf8");
      const en = routing === "prefix-all" ? ["en"] : [];
      // a Turkish referrer: the venue's Turkish member, prefixed once
      expect(fieldLinks(await read("tr", "events", "lansman", "index.html"))).toEqual([
        "/tr/places/salon",
      ]);
      // no Turkish member: the default locale's, through `default-with-notice`
      expect(fieldLinks(await read("tr", "events", "konser", "index.html"))).toEqual([
        `${en.map((l) => `/${l}`).join("")}/places/pier`,
      ]);
      // the default locale's own page
      expect(fieldLinks(await read(...en, "events", "launch", "index.html"))).toEqual([
        `${en.map((l) => `/${l}`).join("")}/places/hall`,
      ]);
      const all = await read("tr", "events", "lansman", "index.html");
      expect(all).not.toMatch(/href="\/(en|tr)\/(en|tr)\//);
    });
  },
);
