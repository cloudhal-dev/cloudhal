import path from "node:path";
import type { Page, SurfaceComponent, SurfaceSection } from "@cloudhal/core-contracts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { readProjectConfig } from "../config.ts";

/** What one page asks to move (RFC-0024), counted from its surfaces without a browser. */
export interface PageMotion {
  path: string;
  /** The page's own level, else the site's. */
  level: string;
  reveals: number;
  hovers: number;
  scroll: number;
  splits: number;
  loops: number;
  ambient: number;
  stories: number;
  morphs: string[];
  warnings: string[];
}

export interface MotionAudit {
  level: string;
  pageTransition: string;
  pages: PageMotion[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The budgets of RFC-0024 §2, as `render_page`'s motion-budget check counts them. */
export function auditPage(
  page: Pick<Page, "path" | "sections" | "motion">,
  site: string,
): PageMotion {
  const all: SurfaceComponent[] = page.sections
    .filter((s): s is SurfaceSection => s.kind === "surface")
    .flatMap((s) => s.components);
  const m = (c: SurfaceComponent) => (isObj(c.motion) ? c.motion : {});
  const count = (f: (c: SurfaceComponent) => boolean) => all.filter(f).length;
  const out: PageMotion = {
    path: page.path,
    level: page.motion ?? site,
    reveals: count((c) => typeof m(c).reveal === "string"),
    hovers: count((c) => typeof m(c).hover === "string"),
    scroll: count((c) => typeof m(c).scroll === "string"),
    splits: count((c) => String(m(c).reveal ?? "").startsWith("split-")),
    loops: count(
      (c) =>
        typeof m(c).loop === "string" ||
        c.component === "Marquee" ||
        (c.component === "Heading" && isObj(c.props) && c.props.effect === "rotate-words"),
    ),
    ambient: count((c) => isObj(c.props) && isObj(c.props.ambient)),
    stories: count((c) => c.component === "Scrolly"),
    morphs: all.map((c) => m(c).morph).filter((k): k is string => typeof k === "string"),
    warnings: [],
  };
  if (out.scroll > 6) out.warnings.push(`${out.scroll} scroll effects (keep to 6)`);
  if (out.stories > 1) out.warnings.push(`${out.stories} scroll stories (keep to 1)`);
  if (out.splits > 2) out.warnings.push(`${out.splits} split texts (keep to 2)`);
  if (out.loops > 2) out.warnings.push(`${out.loops} things that loop (keep to 2)`);
  if (out.ambient > 2) out.warnings.push(`${out.ambient} ambient backgrounds (keep to 2)`);
  const dup = out.morphs.filter((k, i) => out.morphs.indexOf(k) !== i);
  if (dup.length) out.warnings.push(`morph keys used twice: ${[...new Set(dup)].join(", ")}`);
  if (out.level === "none" && out.reveals + out.scroll + out.loops + out.ambient > 0)
    out.warnings.push("motion presets on a page whose level is none: nothing will move");
  return out;
}

/** `cloudhal motion audit`: the motion every page of the local site asks for, and its budgets. */
export async function motionAudit(options: {
  projectDir: string;
  path?: string;
}): Promise<MotionAudit> {
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  try {
    const site = await local.store.getSite(cfg.siteId);
    if (!site) throw new Error(`site ${cfg.siteId} not found`);
    const config = site.theme.config ?? {};
    const level = typeof config.motion === "string" ? config.motion : "none";
    const pages = (await local.store.listPages(cfg.siteId))
      .filter((p) => !options.path || p.path === options.path)
      .sort((a, b) => a.path.localeCompare(b.path));
    return {
      level,
      pageTransition: typeof config.pageTransition === "string" ? config.pageTransition : "none",
      pages: pages.map((p) => auditPage(p, level)),
    };
  } finally {
    await local.close();
  }
}

export function describeMotionAudit(a: MotionAudit): string {
  const lines = [`site motion: ${a.level}, page transition: ${a.pageTransition}`];
  for (const p of a.pages) {
    const parts = (
      [
        ["reveals", p.reveals],
        ["hovers", p.hovers],
        ["scroll", p.scroll],
        ["splits", p.splits],
        ["loops", p.loops],
        ["ambient", p.ambient],
        ["stories", p.stories],
      ] as const
    )
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k} ${n}`);
    lines.push(
      `${p.path}  (${p.level})  ${parts.length ? parts.join(", ") : "still"}${p.morphs.length ? `  morph: ${p.morphs.join(", ")}` : ""}`,
    );
    for (const w of p.warnings) lines.push(`  ! ${w}`);
  }
  return lines.join("\n");
}
