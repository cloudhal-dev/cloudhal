import { writeFile } from "node:fs/promises";
import path from "node:path";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { designTokensDtcg } from "@cloudhal/core-ts/tokens";
import { loadThemeSettings } from "../blocks.ts";
import { readProjectConfig } from "../config.ts";

export interface TokensExportOptions {
  readonly projectDir: string;
  readonly format?: string;
  /** A file to write; stdout otherwise. */
  readonly out?: string;
}

/**
 * `cloudhal tokens export` (RFC-0023 §5): the site's design tokens, as the renderer expands them,
 * in the W3C Design Tokens format (DTCG 2025.10), for Figma (Tokens Studio) and Style Dictionary.
 * Returns the JSON written.
 */
export async function tokensExport(options: TokensExportOptions): Promise<string> {
  const format = options.format ?? "dtcg";
  if (format !== "dtcg") throw new Error(`--format: only dtcg is supported (got ${format})`);
  const cfg = await readProjectConfig(options.projectDir);
  const settings = await loadThemeSettings(options.projectDir);
  if (!settings)
    throw new Error("this project's theme declares no design settings (src/settings.ts)");
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  try {
    const site = await local.store.getSite(cfg.siteId);
    if (!site) throw new Error(`site ${cfg.siteId} not found`);
    const json = `${JSON.stringify(
      designTokensDtcg(
        site.theme.config ?? {},
        settings.properties as Record<string, { default?: unknown }>,
        { name: site.name },
      ),
      null,
      2,
    )}\n`;
    if (options.out) await writeFile(path.resolve(options.projectDir, options.out), json);
    return json;
  } finally {
    await local.close();
  }
}
