/**
 * DESIGN.md (RFC-0021 §1–§3): design rules people and agents read before they build. Two layers:
 * the theme's DESIGN.md (shipped with the theme) and the site's own (`Site.design.markdown`).
 * Guidance only: nothing here changes rendering or permissions.
 *
 * Worker-safe: pure functions and constants.
 */

/** The site's DESIGN.md may be at most this long (the contract's `maxLength`). */
export const DESIGN_MAX_LENGTH = 24_000;
/** Longer rules still save, with a warning: agents read them on every build. */
export const DESIGN_SOFT_LENGTH = 8_000;

/** The headings agents look for (others are kept). */
export const DESIGN_HEADINGS = [
  "Brand",
  "Colors",
  "Typography",
  "Layout",
  "Components",
  "Imagery",
  "Motion",
  "Pages",
  "Do",
  "Don't",
] as const;

/** What `design_lint` checks a DESIGN.md against. */
export interface DesignLintContext {
  /** Component names agents may use (primitives and block types). */
  readonly components: readonly string[];
  /** The theme's design setting keys (`{color.brand}` refers to `brand`). */
  readonly settings: readonly string[];
}

/**
 * Warnings for a DESIGN.md, never errors (RFC-0021 §1): components in backticks the catalog does
 * not have, `{…}` references to design settings the theme does not declare, no `## Brand`, and
 * length past `DESIGN_SOFT_LENGTH`.
 */
export function designLint(markdown: string, ctx: DesignLintContext): string[] {
  const warnings: string[] = [];
  const components = new Set(ctx.components);
  const lower = new Map(ctx.components.map((c) => [c.toLowerCase(), c]));
  const unknown = new Set<string>();
  for (const m of markdown.matchAll(/`([A-Za-z][A-Za-z0-9-]{1,40})`/g)) {
    const name = m[1] as string;
    // Only names that look like components: PascalCase primitives or known block names.
    if (components.has(name) || !/^[A-Z]/.test(name)) continue;
    const near = lower.get(name.toLowerCase());
    unknown.add(near ? `${name} (did you mean ${near}?)` : name);
  }
  if (unknown.size) warnings.push(`Not in this site's catalog: ${[...unknown].join(", ")}`);
  const settings = new Set(ctx.settings);
  const refs = new Set<string>();
  for (const m of markdown.matchAll(/\{([a-z][a-z0-9-]*)\.([a-z][a-zA-Z0-9-]*)\}/g)) {
    const key = m[2] as string;
    if (!settings.has(key)) refs.add(`{${m[1]}.${key}}`);
  }
  if (refs.size)
    warnings.push(
      `These refer to design settings the theme does not have: ${[...refs].join(", ")}${
        ctx.settings.length ? ` (it has ${ctx.settings.join(", ")})` : ""
      }`,
    );
  if (!/^##\s+Brand\b/im.test(markdown))
    warnings.push("No “## Brand” section: say what the site is for, who reads it and its voice.");
  if (markdown.length > DESIGN_SOFT_LENGTH)
    warnings.push(
      `Over ${DESIGN_SOFT_LENGTH.toLocaleString("en")} characters: agents read this on every build, so keep it short.`,
    );
  return warnings;
}

/** The rules an agent reads: the theme's, then the site's (the site's win where they differ). */
export function effectiveDesign(theme: string | undefined, site: string | undefined): string {
  const parts: string[] = [];
  if (theme?.trim()) parts.push(`# The theme's design rules\n\n${theme.trim()}`);
  if (site?.trim())
    parts.push(
      `# This site's design rules (they win where they differ from the theme's)\n\n${site.trim()}`,
    );
  return parts.join("\n\n");
}

/**
 * Cloudhal's design guidance (RFC-0021 §3): the same for every site, in Cloudhal's vocabulary.
 * Agents get it from `get_design`, the `site-design` skill and Build chat.
 */
export const DESIGN_GUIDANCE = `Cloudhal design guidance (follow the site's design rules first; they win where they differ):
1. Commit to a direction. Read the brand, pick one display treatment and one accent, and keep to them. When the theme offers color tokens (get_design shows them), choose a seed, a scheme and a mode that fit the brand with set_theme_settings, never colors per role. Generic is the failure mode: no filler copy, no "Lorem", no placeholder links ("#"), no repeated stock image.
2. Rhythm. Alternate section tones (surface, muted, brand or inverse Bands) and widths (narrow text, wide grids, full-bleed bands). Never three identical sections in a row; vary layouts (Columns 2-1, Grid, Stack).
3. Hierarchy. One level-1 heading per page, then level 2 per section. Big contrast between headings and body text; short headings in sentence case; one primary Button per section, secondary ones for the rest.
4. Real content. Use the site's own entries and media library images with descriptive alt text. Counts follow the content: two plans if there are two, five FAQs if there are five, not three of everything.
5. Lead with the strongest thing: the clearest promise, the best image, the newest story. Put proof (Stat, Quote, testimonial) near the claim it supports and end with one clear call to action.
6. Interactivity only where it helps someone decide or find: Tabs for alternatives, Toggle or Slider for pricing, Accordion or faq for questions, a calculator (NumberField, RadioGroup, Checkbox) when the reader has numbers of their own. Every input has a label, and its result sits right next to it, computed with functions, never promised in text. A Chart only when the numbers are the point, never as decoration, with a title that says what it shows. A Table to compare a few things across the same fields (plans, specs), at most 8 columns, the recommended row highlighted. Bind it to data; never fake it.
7. Small screens first. Grids of 2–4 items, short lines, no wide tables; everything must work at 390 px.
8. Check before you hand over: render the page (render_page when available, otherwise preview_page) at desktop and mobile widths, and in the dark scheme too when the site's mode is dark or auto; fix what is cramped, empty, broken or hard to read, then snapshot and ask a person to publish.`;
