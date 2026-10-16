import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  RENDER_MOTIONS,
  RENDER_SCHEMES,
  RENDER_WIDTHS,
  type RenderCheck,
  type RenderMotion,
  type RenderScheme,
  type RenderWidth,
  renderPage,
} from "@cloudhal/mcp-server/render";
import { chromeRenderer, findChrome } from "../render-chrome.ts";

export interface RenderOptions {
  readonly projectDir: string;
  /** A path on the site (`/pricing`) or a full URL. */
  readonly target: string;
  /** Where a path is served; `cloudhal dev` by default. */
  readonly base?: string;
  readonly widths?: readonly number[];
  readonly scheme?: string;
  readonly motion?: string;
  readonly frames?: number;
  /** The folder for the screenshots, relative to the project. */
  readonly out?: string;
}

export interface RenderReport {
  url: string;
  files: string[];
  checks: RenderCheck[];
}

/**
 * `cloudhal render` (RFC-0024 §8): `render_page`'s browser and checks from the command line, for a
 * page of the running site (`cloudhal dev`) or any URL. Screenshots go to `.cloudhal/renders/`.
 */
export async function render(options: RenderOptions): Promise<RenderReport> {
  const chrome = findChrome();
  if (!chrome) throw new Error("no Chrome found (set CHROME_PATH)");
  const url = /^https?:\/\//.test(options.target)
    ? options.target
    : new URL(options.target, options.base ?? "http://localhost:4321").href;
  const widths = (options.widths?.length ? options.widths : [1440, 390]).filter(
    (w): w is RenderWidth => (RENDER_WIDTHS as readonly number[]).includes(w),
  );
  if (!widths.length) throw new Error(`--width: one or more of ${RENDER_WIDTHS.join(", ")}`);
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[], name: string) => {
    if (v === undefined) return undefined;
    if (!(allowed as readonly string[]).includes(v))
      throw new Error(`--${name}: one of ${allowed.join(", ")}`);
    return v as T;
  };
  const scheme = pick<RenderScheme>(options.scheme, RENDER_SCHEMES, "scheme");
  const frames = options.frames ? Math.min(6, Math.max(1, Math.round(options.frames))) : 0;
  const motion =
    pick<RenderMotion>(options.motion, RENDER_MOTIONS, "motion") ?? (frames ? "full" : "static");
  const result = await renderPage(chromeRenderer(chrome), url, {
    widths,
    fullPage: true,
    ...(scheme ? { scheme } : {}),
    motion,
    ...(frames ? { frames } : {}),
    timeoutMs: 60_000,
  });
  const dir = path.resolve(options.projectDir, options.out ?? ".cloudhal/renders");
  await mkdir(dir, { recursive: true });
  const slug = new URL(url).pathname.replace(/^\/|\/$/g, "").replace(/[^a-z0-9]+/gi, "-") || "home";
  const files: string[] = [];
  for (const shot of result.shots)
    for (const [i, jpeg] of shot.images.entries()) {
      const file = path.join(dir, `${slug}-${shot.width}-${i + 1}.jpg`);
      await writeFile(file, jpeg);
      files.push(path.relative(options.projectDir, file));
    }
  return { url, files, checks: result.checks };
}

/** The report as text: the screenshots, then each failed check with its examples. */
export function describeRender(r: RenderReport): string {
  const failed = r.checks.filter((c) => !c.ok);
  return [
    `rendered ${r.url}`,
    ...r.files.map((f) => `  ${f}`),
    failed.length
      ? `${failed.length} of ${r.checks.length} checks found problems:`
      : `all ${r.checks.length} checks passed`,
    ...failed.flatMap((c) => [
      `✗ ${c.id}: ${c.count} at ${c.widths.join(", ")} px`,
      ...c.examples.map((e) => `    ${e}`),
    ]),
  ].join("\n");
}
