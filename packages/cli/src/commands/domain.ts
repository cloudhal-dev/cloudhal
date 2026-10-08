/**
 * `cloudhal domain` — the custom domains `cloudhal deploy` routes to this project's Workers
 * (Cloudflare Custom Domains: the zone must be in the same Cloudflare account; wrangler creates
 * the DNS record and certificate). Kept in cloudhal.json so the setting travels with the project.
 */
import { isHostname, normalizeHostname } from "@cloudhal/core-ts";
import { type ProjectConfig, readProjectConfig, writeProjectConfig } from "../config.ts";

export type DomainTarget = "site" | "studio";

export interface DomainOptions {
  readonly projectDir: string;
  /** Hostnames to set (others stay as they are). */
  readonly set?: { readonly site?: string; readonly studio?: string };
  /** Domains to forget. */
  readonly remove?: readonly DomainTarget[];
}

/** A hostname as typed → normalised, or an error that says why it cannot be used. */
export function checkHostname(input: string): string {
  const host = normalizeHostname(input);
  if (!isHostname(host)) throw new Error(`"${input}" is not a hostname (e.g. news.example.com)`);
  if (host.endsWith(".workers.dev"))
    throw new Error("workers.dev addresses are assigned by Cloudflare; set your own domain here");
  return host;
}

export async function domain(options: DomainOptions): Promise<ProjectConfig["domains"]> {
  const cfg = await readProjectConfig(options.projectDir);
  const next: { site?: string; studio?: string } = { ...cfg.domains };
  for (const target of options.remove ?? []) delete next[target];
  if (options.set?.site) next.site = checkHostname(options.set.site);
  if (options.set?.studio) next.studio = checkHostname(options.set.studio);
  if (next.site && next.site === next.studio)
    throw new Error("the site and Studio need different hostnames");
  if (options.set || options.remove) {
    const { domains: _old, ...rest } = cfg;
    await writeProjectConfig(options.projectDir, {
      ...rest,
      ...(next.site || next.studio ? { domains: next } : {}),
    });
  }
  return next.site || next.studio ? next : undefined;
}
