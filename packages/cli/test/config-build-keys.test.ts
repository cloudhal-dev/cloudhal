/**
 * The `cloudhal.json` key classes of `deploy --release` (RFC-0046 §11b, "Config build keys") and
 * their drift guards: every key and mixed sub-key is classed (`tsc`, through the mapped table type,
 * and the integration's option types below), every key `config.ts` owns and every `project.<key>`
 * the starter's `astro.config.mjs` reads is in the table, and the admin build bakes in nothing
 * from the config.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CloudhalRendererConfig } from "@cloudhal/astro-renderer/integration";
import { describe, expect, it } from "vitest";
import { prepareAdminWorker } from "../src/cloudflare/admin.ts";
import { OWN_KEYS } from "../src/config.ts";
import { buildKeyProblems, CONFIG_KEY_CLASSES } from "../src/config-build-keys.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const NO_FEATURES = { mediaTransformVar: false };

// Every sub-key the integration's options declare for media, analytics and comments is classed
// (a missing one is a type error here).
type Sub<T> = keyof Required<NonNullable<T>>;
const _media: Record<Sub<CloudhalRendererConfig["media"]>, unknown> = CONFIG_KEY_CLASSES.media;
const _analytics: Record<
  Sub<CloudhalRendererConfig["analytics"]>,
  unknown
> = CONFIG_KEY_CLASSES.analytics;
const _comments: Record<
  Sub<CloudhalRendererConfig["comments"]>,
  unknown
> = CONFIG_KEY_CLASSES.comments;
void [_media, _analytics, _comments];

describe("the config build keys", () => {
  it("passes what `cloudhal init` writes, and deploy and runtime keys", () => {
    const init = {
      siteId: "site_abc123",
      dataDir: ".cloudhal",
      analytics: { enabled: true },
      comments: { available: true },
    };
    expect(buildKeyProblems(init, NO_FEATURES)).toEqual([]);
    const more = {
      ...init,
      search: { provider: "ai-search" },
      comments: { available: true, rateLimit: true },
      analytics: {
        enabled: false,
        uniqueVisitors: true,
        queryBudget: 10,
        rateLimit: { limit: 5 },
        dev: true,
      },
      domains: { site: "example.com" },
      mail: { from: "a@example.com" },
      ai: {},
      render: false,
      observability: { logs: 0.5 },
      placement: "smart",
      schedules: { plan: "paid" },
      media: { transform: "none" },
    };
    expect(buildKeyProblems(more, NO_FEATURES)).toEqual([]);
  });

  it("refuses comments.available false, and media.transform unless the bundle reads it as a var", () => {
    expect(buildKeyProblems({ siteId: "s", comments: { available: false } }, NO_FEATURES)).toEqual([
      { key: "comments.available", problem: "build", value: false },
    ]);
    const cdn = { siteId: "s", media: { transform: "cdn-cgi" } };
    expect(buildKeyProblems(cdn, NO_FEATURES)).toEqual([
      { key: "media.transform", problem: "build", value: "cdn-cgi" },
    ]);
    expect(buildKeyProblems(cdn, { mediaTransformVar: true })).toEqual([]);
  });

  it("refuses keys and mixed sub-keys this CLI does not know", () => {
    expect(
      buildKeyProblems({ siteId: "s", theme: "x", comments: { moderation: true } }, NO_FEATURES),
    ).toEqual([
      { key: "theme", problem: "unknown" },
      { key: "comments.moderation", problem: "unknown" },
    ]);
  });

  it("classes every key config.ts owns", () => {
    for (const key of OWN_KEYS) expect(Object.keys(CONFIG_KEY_CLASSES)).toContain(key);
  });

  it("classes every project.<key> the starter's astro.config.mjs reads", async () => {
    const text = await readFile(
      path.resolve(here, "../../../starters/blog/astro.config.mjs"),
      "utf8",
    );
    const keys = new Set<string>();
    // The repository's own file, not external input; `project.` followed by a JS identifier.
    for (const m of text.matchAll(/\bproject\.([A-Za-z_$][\w$]*)/g)) keys.add(m[1] as string);
    expect([...keys].sort()).toEqual(["analytics", "comments", "dataDir", "media", "siteId"]);
    for (const key of keys) expect(Object.keys(CONFIG_KEY_CLASSES)).toContain(key);
  });

  it("the admin build bakes in nothing from the config: only its wrangler config differs", async () => {
    const project = path.resolve(here, "../../../starters/blog");
    const out: Record<string, string>[] = [];
    for (const variant of [
      {},
      {
        mail: { from: "a@example.com" },
        ai: true,
        browser: true,
        observability: { logs: 0.5, traces: 0.1 },
        placement: "smart" as const,
        domain: "studio.example.com",
        siteId: "site_other1",
      },
    ]) {
      const dataDir = await mkdtemp(path.join(os.tmpdir(), "admin-determinism-"));
      const a = await prepareAdminWorker({
        projectDir: project,
        dataDir: path.relative(project, dataDir),
        names: { name: "x" },
        studioDir: path.join(dataDir, "studio"),
        themeDesign: "# Design\n",
        ...variant,
      });
      const read = (f: string) => readFile(path.join(a.dir, f), "utf8");
      out.push({
        worker: await read("worker.ts"),
        skills: await read("skills.ts"),
        design: await read("theme-design.ts"),
        config: await read("wrangler.jsonc"),
      });
      await rm(dataDir, { recursive: true, force: true });
    }
    const [plain, varied] = out as [Record<string, string>, Record<string, string>];
    expect(varied.worker).toBe(plain.worker);
    expect(varied.skills).toBe(plain.skills);
    expect(varied.design).toBe(plain.design);
    expect(varied.config).not.toBe(plain.config);
  });
});
