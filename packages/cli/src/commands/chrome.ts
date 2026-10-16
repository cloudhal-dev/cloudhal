import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyChromeForm,
  brandToForm,
  type ChromeFooter,
  type ChromeHeader,
  chromeMenuKeys,
  logoAsset,
} from "@cloudhal/core-ts/chrome";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { loadThemeSettings } from "../blocks.ts";
import { readProjectConfig } from "../config.ts";

export interface ChromeOptions {
  readonly projectDir: string;
  /** `get`: a file to write (stdout otherwise); `set`: the file to read. */
  readonly file?: string;
}

/** The chrome file: the site's header, footer and brand (logos as `asset:<id>`). */
export interface ChromeFile {
  header: ChromeHeader | Record<string, never>;
  footer: ChromeFooter | Record<string, never>;
  brand: Record<string, unknown>;
}

async function withSite<T>(
  projectDir: string,
  run: (local: Awaited<ReturnType<typeof openLocalStore>>, siteId: string) => Promise<T>,
): Promise<T> {
  const cfg = await readProjectConfig(projectDir);
  const themeSettings = await loadThemeSettings(projectDir);
  const local = await openLocalStore(path.join(projectDir, cfg.dataDir), { themeSettings });
  try {
    return await run(local, cfg.siteId);
  } finally {
    await local.close();
  }
}

/**
 * `cloudhal chrome get` (RFC-0025 §5): the site's header, footer and brand as JSON, the file
 * `cloudhal chrome set` reads. Returns the JSON written.
 */
export async function chromeGet(options: ChromeOptions): Promise<string> {
  return withSite(options.projectDir, async ({ store }, siteId) => {
    const site = await store.getSite(siteId);
    if (!site) throw new Error(`site ${siteId} not found`);
    const file: ChromeFile = {
      header: site.chrome?.header ?? {},
      footer: site.chrome?.footer ?? {},
      brand: brandToForm(site.brand),
    };
    const json = `${JSON.stringify(file, null, 2)}\n`;
    if (options.file) await writeFile(path.resolve(options.projectDir, options.file), json);
    return json;
  });
}

/**
 * `cloudhal chrome set --file <chrome.json>`: replaces the parts the file has (an empty part goes
 * back to the default), with the checks Studio and agents get, and snapshots the site.
 */
export async function chromeSet(options: ChromeOptions): Promise<ChromeFile> {
  if (!options.file) throw new Error("usage: cloudhal chrome set --file <chrome.json>");
  const input = JSON.parse(
    await readFile(path.resolve(options.projectDir, options.file), "utf8"),
  ) as Record<string, unknown>;
  return withSite(options.projectDir, async ({ store }, siteId) => {
    const site = await store.getSite(siteId);
    if (!site) throw new Error(`site ${siteId} not found`);
    const { site: next, issues } = await applyChromeForm(site, input, {
      menus: chromeMenuKeys(await store.listMenus(site.id)),
      resolve: async (assetId) => logoAsset(await store.getAsset(assetId), site),
    });
    if (issues.length > 0) throw new Error(issues.map((i) => `${i.path}: ${i.message}`).join("\n"));
    const saved = await store.updateSite(next);
    await store.createSnapshot(siteId, {
      actor: { kind: "human", id: "user_localcli0001", name: "cloudhal CLI" },
      reason: "manual",
      label: "cloudhal chrome set",
    });
    return {
      header: saved.chrome?.header ?? {},
      footer: saved.chrome?.footer ?? {},
      brand: brandToForm(saved.brand),
    };
  });
}
