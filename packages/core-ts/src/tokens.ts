/**
 * Design tokens v2, color (RFC-0023 §1): one seed color, a scheme, a contrast level and a mode
 * expand into color roles for light and dark, every text and UI pair checked against WCAG 2.2
 * and repaired step by step until it passes. Palettes are built in OKLCH so lightness steps look
 * even across hues. Pure and deterministic; Worker-safe.
 */

export const COLOR_ROLES = [
  "surface",
  "surface-muted",
  "surface-raised",
  "surface-inverse",
  "text",
  "text-muted",
  "text-subtle",
  "text-inverse",
  "border",
  "border-strong",
  "brand",
  "on-brand",
  "accent",
  "on-accent",
  "link",
  "focus",
] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];
export type ColorRoles = Record<ColorRole, string>;

export const COLOR_SCHEMES = ["tonal", "vibrant", "neutral", "mono"] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];
export const CONTRAST_LEVELS = ["standard", "high"] as const;
export type ContrastLevel = (typeof CONTRAST_LEVELS)[number];
export const COLOR_MODES = ["light", "dark", "auto"] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

export interface ColorTokenSettings {
  seed: string;
  scheme?: ColorScheme | undefined;
  contrast?: ContrastLevel | undefined;
  mode?: ColorMode | undefined;
}

export interface ColorTokens {
  light: ColorRoles;
  dark: ColorRoles;
  mode: ColorMode;
  /** What the contrast repair changed, for people and agents. */
  notes: string[];
  /** The same, as data (Studio words it in the person's language). */
  repairs: ColorRepair[];
}

/**
 * One repair: `role` moved `steps` lightness steps so it reads against `against` at `ratio`.
 * `kind: "pair"` moved a foreground; `kind: "fill"` moved a fill so its text (`against`) reads.
 */
export interface ColorRepair {
  scheme: "light" | "dark";
  kind: "pair" | "fill";
  role: ColorRole;
  against: ColorRole;
  direction: "lightened" | "darkened";
  steps: number;
  ratio: number;
}

/** A repair in words, for agents: "light: brand on surface darkened 3 step(s) to reach 3:1". */
export function repairNote(r: ColorRepair): string {
  return r.kind === "pair"
    ? `${r.scheme}: ${r.role} on ${r.against} ${r.direction} ${r.steps} step(s) to reach ${r.ratio}:1`
    : `${r.scheme}: ${r.role} ${r.direction} ${r.steps} step(s) so ${r.against} text reaches ${r.ratio}:1`;
}

// ── color math (sRGB ↔ OKLab ↔ OKLCH) ──────────────────────────────────────────────────────

type Rgb = [number, number, number];
type Oklch = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToRgb(hex: string): Rgb | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const n = Number.parseInt(m[1] as string, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const h = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbToOklch(rgb: Rgb): Oklch {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  const H = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return [L, C, H];
}

function oklchToLinear([L, C, H]: Oklch): Rgb {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** An OKLCH color as hex, chroma reduced until it fits sRGB (hue and lightness kept). */
function oklchToHex(c: Oklch): string {
  let [L, C] = c;
  const H = c[2];
  L = Math.min(1, Math.max(0, L));
  for (let i = 0; i < 40; i++) {
    const lin = oklchToLinear([L, C, H]);
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005)) return rgbToHex(lin.map(toGamma) as Rgb);
    C *= 0.92;
  }
  return rgbToHex(oklchToLinear([L, 0, H]).map(toGamma) as Rgb);
}

/** WCAG 2.2 relative luminance and contrast ratio. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = (hexToRgb(hex) ?? [0, 0, 0]).map(toLinear) as Rgb;
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

// ── expansion ──────────────────────────────────────────────────────────────────────────────

/** Chroma of the brand palette and of the neutral (grey) palette per scheme. */
const CHROMA: Record<ColorScheme, { primary: number; neutral: number }> = {
  tonal: { primary: 0.09, neutral: 0.012 },
  vibrant: { primary: 0.17, neutral: 0.02 },
  neutral: { primary: 0.05, neutral: 0.006 },
  mono: { primary: 0, neutral: 0 },
};

/** Text and UI pairs that must meet a ratio: [foreground, background, AA ratio, AAA ratio]. */
const PAIRS: readonly [ColorRole, ColorRole, number, number][] = [
  ["text", "surface", 4.5, 7],
  ["text", "surface-muted", 4.5, 7],
  ["text", "surface-raised", 4.5, 7],
  ["text-muted", "surface", 4.5, 7],
  ["text-muted", "surface-muted", 4.5, 7],
  ["text-subtle", "surface", 4.5, 4.5],
  ["text-inverse", "surface-inverse", 4.5, 7],
  ["link", "surface", 4.5, 7],
  ["brand", "surface", 3, 3],
  ["focus", "surface", 3, 3],
  ["border-strong", "surface", 3, 3],
];

/**
 * Moves a foreground's lightness away from its background until the pair passes. Backgrounds
 * never move; a foreground that reaches white or black first turns and goes the other way (a
 * white brand on a white page becomes a dark one).
 */
function repair(
  roles: Record<ColorRole, Oklch>,
  fg: ColorRole,
  bg: ColorRole,
  ratio: number,
  repairs: ColorRepair[],
  scheme: "light" | "dark",
): void {
  const pass = () => contrastRatio(oklchToHex(roles[fg]), oklchToHex(roles[bg])) >= ratio;
  if (pass()) return;
  let up = roles[fg][0] >= roles[bg][0];
  let steps = 0;
  let turned = false;
  for (let i = 0; i < 200 && !pass(); i++) {
    const f = roles[fg];
    if ((up && f[0] >= 1) || (!up && f[0] <= 0)) {
      if (turned) break;
      up = !up;
      turned = true;
    }
    roles[fg] = [Math.min(1, Math.max(0, f[0] + (up ? 0.01 : -0.01))), f[1], f[2]];
    steps++;
  }
  repairs.push({
    scheme,
    kind: "pair",
    role: fg,
    against: bg,
    direction: up ? "lightened" : "darkened",
    steps,
    ratio,
  });
}

/** The color roles for one seed, scheme, contrast level and mode (RFC-0023 §1). */
export function expandColorTokens(settings: ColorTokenSettings): ColorTokens {
  const scheme = settings.scheme ?? "tonal";
  const contrast = settings.contrast ?? "standard";
  const mode = settings.mode ?? "light";
  const seedRgb = hexToRgb(settings.seed) ?? [0.094, 0.094, 0.106];
  const [seedL, seedC, H] = rgbToOklch(seedRgb);
  const { primary, neutral } = CHROMA[scheme];
  // The brand is the seed itself in light (a brand color stays exact); the scheme shapes the
  // greys, the accent and the link. In dark it is the seed lightened, its chroma kept.
  const brandC = seedC;
  const accentH = (H + 150) % 360;
  const n = (L: number): Oklch => [L, neutral, H];
  const p = (L: number, c = primary): Oklch => [L, c, H];
  const repairs: ColorRepair[] = [];

  const build = (dark: boolean): ColorRoles => {
    const roles: Record<ColorRole, Oklch> = dark
      ? {
          surface: n(0.17),
          "surface-muted": n(0.21),
          "surface-raised": n(0.3),
          "surface-inverse": n(0.95),
          text: n(0.95),
          "text-muted": n(0.8),
          "text-subtle": n(0.7),
          "text-inverse": n(0.2),
          border: n(0.3),
          "border-strong": n(0.5),
          brand: [Math.max(0.7, seedL), brandC, H],
          "on-brand": n(0.16),
          accent: [0.74, Math.max(primary, 0.06), accentH],
          "on-accent": n(0.16),
          link: p(0.8, Math.max(primary, 0.06)),
          focus: p(0.75, Math.max(primary, 0.08)),
        }
      : {
          surface: n(0.995),
          "surface-muted": n(0.965),
          "surface-raised": [1, 0, H],
          "surface-inverse": n(0.21),
          text: n(0.21),
          "text-muted": n(0.44),
          "text-subtle": n(0.55),
          "text-inverse": n(0.98),
          border: n(0.92),
          "border-strong": n(0.65),
          brand: [seedL, brandC, H],
          "on-brand": [1, 0, H],
          accent: [0.55, Math.max(primary, 0.06), accentH],
          "on-accent": [1, 0, H],
          link: p(0.45, Math.max(primary, 0.06)),
          focus: p(0.55, Math.max(primary, 0.08)),
        };
    // Two passes: a role that moved for one pair is checked again for the others.
    for (let pass = 0; pass < 2; pass++)
      for (const [fg, bg, aa, aaa] of PAIRS)
        repair(roles, fg, bg, contrast === "high" ? aaa : aa, repairs, dark ? "dark" : "light");
    // Text on the fills, once the fills have settled: white or near-black, whichever reads; if
    // neither does, white on a fill darkened (light) or near-black on a fill lightened (dark),
    // which also keeps the fill apart from the page.
    const onRatio = contrast === "high" ? 7 : 4.5;
    const white: Oklch = [1, 0, H];
    const ink = n(0.16);
    for (const [on, fill] of [
      ["on-brand", "brand"],
      ["on-accent", "accent"],
    ] as const) {
      const ratioWith = (c: Oklch) => contrastRatio(oklchToHex(c), oklchToHex(roles[fill]));
      roles[on] = ratioWith(white) >= ratioWith(ink) ? white : ink;
      if (ratioWith(roles[on]) >= onRatio) continue;
      roles[on] = dark ? ink : white;
      let steps = 0;
      while (ratioWith(roles[on]) < onRatio && steps < 100) {
        const f = roles[fill];
        roles[fill] = [Math.min(1, Math.max(0, f[0] + (dark ? 0.01 : -0.01))), f[1], f[2]];
        steps++;
      }
      repairs.push({
        scheme: dark ? "dark" : "light",
        kind: "fill",
        role: fill,
        against: on,
        direction: dark ? "lightened" : "darkened",
        steps,
        ratio: onRatio,
      });
    }
    return Object.fromEntries(COLOR_ROLES.map((r) => [r, oklchToHex(roles[r])])) as ColorRoles;
  };
  const light = build(false);
  const dark = build(true);
  return { light, dark, mode, notes: repairs.map(repairNote), repairs };
}

/**
 * The roles a theme had before tokens (RFC-0023 §1, "old settings still work"): its four colors,
 * with the fixed greys the blog theme used (zinc), so a site that never sets a seed looks the same.
 */
export function legacyColorRoles(colors: {
  brand?: string | undefined;
  link?: string | undefined;
  surface?: string | undefined;
  text?: string | undefined;
}): ColorRoles {
  const brand = colors.brand ?? "#18181b";
  return {
    surface: colors.surface ?? "#ffffff",
    "surface-muted": "#f4f4f5",
    "surface-raised": "#ffffff",
    "surface-inverse": "#18181b",
    text: colors.text ?? "#18181b",
    "text-muted": "#52525b",
    "text-subtle": "#71717a",
    "text-inverse": "#ffffff",
    border: "#e4e4e7",
    "border-strong": "#d4d4d8",
    brand,
    "on-brand":
      contrastRatio("#ffffff", brand) >= contrastRatio("#18181b", brand) ? "#ffffff" : "#18181b",
    accent: colors.link ?? "#0369a1",
    "on-accent": "#ffffff",
    link: colors.link ?? "#0369a1",
    focus: brand,
  };
}

/**
 * The roles as CSS declarations for `:root`: one value per role for light or dark, or
 * `light-dark(light, dark)` after a light fallback for `auto`.
 */
export function colorRolesCss(tokens: Pick<ColorTokens, "light" | "dark" | "mode">): string {
  const decl: string[] = [];
  if (tokens.mode === "auto") decl.push("color-scheme:light dark");
  else decl.push(`color-scheme:${tokens.mode}`);
  for (const role of COLOR_ROLES) {
    const light = tokens.light[role];
    const dark = tokens.dark[role];
    if (tokens.mode === "dark") decl.push(`--ch-color-${role}:${dark}`);
    else if (tokens.mode === "light") decl.push(`--ch-color-${role}:${light}`);
    else
      decl.push(`--ch-color-${role}:${light}`, `--ch-color-${role}:light-dark(${light},${dark})`);
  }
  return decl.join(";");
}

/** A checked pair: its ratio, and the ratio the contrast level needs. */
export interface ColorPairCheck {
  foreground: ColorRole;
  background: ColorRole;
  light: number;
  dark: number;
  needs: number;
}

/** What a site's color roles come from, and what they are (for `get_design` and Studio). */
export interface SiteColorTokens extends ColorTokens {
  /** `seed`: expanded from the seed (RFC-0023); `legacy`: the theme's old free colors. */
  source: "seed" | "legacy";
  settings: Required<ColorTokenSettings> | null;
  /** Whether the theme offers `seed` (a legacy site can opt in). */
  seedAvailable: boolean;
  pairs: ColorPairCheck[];
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * The color roles a site gets: expanded from its seed when the theme declares `seed` and the site
 * set one or chose a dark or automatic mode (the seed then defaults to the brand); otherwise its
 * old colors with the blog theme's former greys, so a site that never opts in looks the same.
 */
export function siteColorTokens(
  config: Readonly<Record<string, unknown>>,
  properties: Readonly<Record<string, { default?: unknown }>>,
): SiteColorTokens {
  const color = (key: string): string | undefined => {
    const v = config[key];
    if (typeof v === "string" && HEX.test(v)) return v.toLowerCase();
    const d = properties[key]?.default;
    return typeof d === "string" && HEX.test(d) ? d.toLowerCase() : undefined;
  };
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const v = config[key];
    return typeof v === "string" && (allowed as readonly string[]).includes(v)
      ? (v as T)
      : fallback;
  };
  const mode = pick<ColorMode>("mode", COLOR_MODES, "light");
  const contrast = pick<ContrastLevel>("contrast", CONTRAST_LEVELS, "standard");
  const seed =
    typeof config.seed === "string" && HEX.test(config.seed)
      ? config.seed.toLowerCase()
      : undefined;
  if ("seed" in properties && (seed || mode !== "light")) {
    const settings = {
      seed: seed ?? color("brand") ?? "#18181b",
      scheme: pick<ColorScheme>("scheme", COLOR_SCHEMES, "tonal"),
      contrast,
      mode,
    };
    const tokens = expandColorTokens(settings);
    return {
      ...tokens,
      source: "seed",
      settings,
      seedAvailable: true,
      pairs: colorPairs(tokens, contrast),
    };
  }
  const legacy = legacyColorRoles({
    brand: color("brand"),
    link: color("link"),
    surface: color("surface"),
    text: color("text"),
  });
  const tokens = { light: legacy, dark: legacy, mode: "light" as const, notes: [], repairs: [] };
  return {
    ...tokens,
    source: "legacy",
    settings: null,
    seedAvailable: "seed" in properties,
    pairs: colorPairs(tokens, "standard"),
  };
}

/** The contrast of every checked pair, in light and dark, rounded to two decimals. */
export function colorPairs(
  tokens: Pick<ColorTokens, "light" | "dark">,
  contrast: ContrastLevel = "standard",
): ColorPairCheck[] {
  const round = (n: number) => Math.round(n * 100) / 100;
  const onRatio = contrast === "high" ? 7 : 4.5;
  return [
    ...PAIRS.map(([foreground, background, aa, aaa]) => ({
      foreground,
      background,
      needs: contrast === "high" ? aaa : aa,
    })),
    { foreground: "on-brand" as const, background: "brand" as const, needs: onRatio },
    { foreground: "on-accent" as const, background: "accent" as const, needs: onRatio },
  ].map((p) => ({
    ...p,
    light: round(contrastRatio(tokens.light[p.foreground], tokens.light[p.background])),
    dark: round(contrastRatio(tokens.dark[p.foreground], tokens.dark[p.background])),
  }));
}

// ── type (RFC-0023 §2) ─────────────────────────────────────────────────────────────────────

/** Curated pairings; the theme maps each to font families it ships (`system` loads nothing). */
export const TYPE_PAIRINGS = [
  "system",
  "editorial",
  "modern",
  "humanist",
  "technical",
  "classic",
] as const;
export type TypePairing = (typeof TYPE_PAIRINGS)[number];
export const TYPE_SCALES = ["compact", "balanced", "dramatic"] as const;
export type TypeScale = (typeof TYPE_SCALES)[number];

/** The fluid steps, `--ch-step--1` (small print) to `--ch-step-6` (the largest display size). */
export const TYPE_STEPS = [-1, 0, 1, 2, 3, 4, 5, 6] as const;

/**
 * Utopia's method: each step grows from its phone size at 390 px to its desktop size at 1440 px.
 * The body is 16 px on phones and 17 px on desktops; the ratio is gentler on phones so headings
 * shrink more than body text, without breakpoints.
 */
const SCALE: Record<TypeScale, { min: number; max: number }> = {
  compact: { min: 1.125, max: 1.2 },
  balanced: { min: 1.15, max: 1.25 },
  dramatic: { min: 1.2, max: 1.333 },
};
const VIEW = { min: 390, max: 1440 };
const BODY = { min: 16, max: 17 };

/** One step as `clamp(min, preferred, max)`, in rem and vw (the reader's font size still applies). */
export function typeStep(scale: TypeScale, step: number): string {
  const r = SCALE[scale];
  const min = BODY.min * r.min ** step;
  const max = BODY.max * r.max ** step;
  const slope = (max - min) / (VIEW.max - VIEW.min);
  const intercept = min - slope * VIEW.min;
  const n = (v: number) => Number(v.toFixed(4)).toString();
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const vw = slope * 100;
  return `clamp(${n(lo / 16)}rem,${n(intercept / 16)}rem ${vw < 0 ? "-" : "+"} ${n(Math.abs(vw))}vw,${n(hi / 16)}rem)`;
}

/** The steps as CSS declarations for `:root`. */
export function typeScaleCss(scale: TypeScale): string {
  return TYPE_STEPS.map((s) => `--ch-step-${s}:${typeStep(scale, s)}`).join(";");
}
