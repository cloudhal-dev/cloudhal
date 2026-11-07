/**
 * `cloudhal import --replace` of another site's archive (RFC-0039 §2): `cloudhal.json`'s `siteId`
 * becomes the archive's, and the old id's place in `sites` with it. Only those values change in
 * the file's text, so its layout and every other key stay as written (`writeProjectConfig`
 * rewrites and normalises the whole file). The edit is verified by parsing it back: anything it
 * cannot place exactly (a nested `siteId` of the same value, an escaped id) is refused, with the
 * guidance to set `siteId` by hand. The file is written last, through a temporary file renamed
 * over it, and only when nobody changed it since it was read.
 */
import { randomUUID } from "node:crypto";
import { chmod, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { CONFIG_FILE, parseSites } from "./config.ts";

/** One switch of `siteId` (and of the old id in `sites`), planned on the file's text. */
export interface SiteIdSwitch {
  readonly from: string;
  readonly to: string;
  /** `sites` as `readProjectConfig` reads it, before and after; absent without a `sites` key. */
  readonly sites?:
    | { readonly before: readonly string[]; readonly after: readonly string[] }
    | undefined;
  /** The file as it was read. */
  readonly raw: string;
  /** The file as it will be written. */
  readonly text: string;
}

/** The import landed, `cloudhal.json` was not switched; the message says what to do. */
export class SiteSwitchError extends Error {
  override readonly name = "SiteSwitchError";
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `cloudhal.json` as text, for `planSiteIdSwitch` (read before the archive is). */
export function readConfigText(projectDir: string): Promise<string> {
  return readFile(path.join(projectDir, CONFIG_FILE), "utf8");
}

/** The edit that switches `siteId` to `to`, or why it cannot be made in place. */
export function planSiteIdSwitch(
  raw: string,
  to: string,
): SiteIdSwitch | { readonly refusal: string } {
  const byHand = `; set cloudhal.json siteId to ${to} by hand (push and deploy then use it), then import again`;
  let cfg: unknown;
  try {
    cfg = JSON.parse(raw);
  } catch {
    cfg = undefined;
  }
  if (!isObject(cfg) || typeof cfg.siteId !== "string")
    return { refusal: `cloudhal.json has no siteId to switch${byHand}` };
  const from = cfg.siteId;
  const quotedFrom = JSON.stringify(from);
  const quotedTo = JSON.stringify(to);
  const text = raw
    .replace(
      new RegExp(`("siteId"\\s*:\\s*)${escapeRegExp(quotedFrom)}`, "g"),
      (_m, key: string) => `${key}${quotedTo}`,
    )
    .replace(
      /("sites"\s*:\s*\[)([^\]]*)\]/g,
      (_m, head: string, items: string) => `${head}${items.replaceAll(quotedFrom, quotedTo)}]`,
    );
  const sites = Array.isArray(cfg.sites)
    ? cfg.sites.map((s: unknown) => (s === from ? to : s))
    : undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  if (!isDeepStrictEqual(parsed, { ...cfg, siteId: to, ...(sites ? { sites } : {}) }))
    return {
      refusal: `cloudhal.json cannot be switched in place: it names ${from} in more than its siteId and sites values, or writes it escaped${byHand}`,
    };
  return {
    from,
    to,
    ...(sites
      ? {
          sites: {
            before: parseSites(from, cfg.sites) ?? [from],
            after: parseSites(to, sites) ?? [to],
          },
        }
      : {}),
    raw,
    text,
  };
}

/**
 * Writes the switch: refused when the file changed since it was read; a temporary file next to it
 * (with its mode) is renamed over it, so a failure leaves the file as it was.
 */
export async function writeSiteIdSwitch(projectDir: string, change: SiteIdSwitch): Promise<void> {
  const file = path.join(projectDir, CONFIG_FILE);
  const tail = `; run the import again, which only switches siteId to ${change.to}, or set it by hand`;
  const now = await readFile(file, "utf8").catch(() => undefined);
  if (now !== change.raw)
    throw new SiteSwitchError(
      `cloudhal.json changed while importing, so it still names site ${change.from}${tail}`,
    );
  const temp = path.join(
    projectDir,
    `.${CONFIG_FILE}.partial-${process.pid}-${randomUUID().slice(0, 8)}`,
  );
  try {
    const { mode } = await stat(file);
    await writeFile(temp, change.text, { flag: "wx" });
    await chmod(temp, mode & 0o777);
    await rename(temp, file);
  } catch (e) {
    await rm(temp, { force: true });
    const reason = e instanceof Error ? e.message : String(e);
    throw new SiteSwitchError(
      `cloudhal.json could not be written (${reason}), so it still names site ${change.from}${tail}`,
      { cause: e },
    );
  }
}
