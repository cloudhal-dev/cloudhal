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
  "gradient",
] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];
/** The roles taken from palette steps; `gradient` is derived from two of them afterwards. */
type PaletteRole = Exclude<ColorRole, "gradient">;
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
const PAIRS: readonly [PaletteRole, PaletteRole, number, number][] = [
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
  roles: Record<PaletteRole, Oklch>,
  fg: PaletteRole,
  bg: PaletteRole,
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
  // The accent sits 60° on (a close, harmonious hue), or 150° on when that lands among the
  // yellows and olives, which turn to mustard once darkened for white text (RFC-0023 Q3).
  const near = (H + 60) % 360;
  const accentH = near >= 50 && near <= 115 ? (H + 150) % 360 : near;
  const n = (L: number): Oklch => [L, neutral, H];
  const p = (L: number, c = primary): Oklch => [L, c, H];
  const repairs: ColorRepair[] = [];

  const build = (dark: boolean): ColorRoles => {
    const roles: Record<PaletteRole, Oklch> = dark
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
    // The gradient's end is worked out from the settled brand and its text, not as a palette step.
    const hex = Object.fromEntries(
      COLOR_ROLES.filter((r) => r !== "gradient").map((r) => [r, oklchToHex(roles[r])]),
    ) as ColorRoles;
    hex.gradient = gradientEnd(hex.brand, hex["on-brand"], onRatio);
    return hex;
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
  const onBrand =
    contrastRatio("#ffffff", brand) >= contrastRatio("#18181b", brand) ? "#ffffff" : "#18181b";
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
    "on-brand": onBrand,
    accent: colors.link ?? "#0369a1",
    "on-accent": "#ffffff",
    link: colors.link ?? "#0369a1",
    focus: brand,
    gradient: gradientEnd(brand, onBrand, 4.5),
  };
}

/**
 * The far end of the brand gradient (RFC-0023 §4): the brand turned 40° (back the other way if
 * that lands on the yellows and olives) and a step further from its text, then moved until text
 * on brand still reads on it — so the whole gradient keeps the contrast of the brand fill.
 */
export function gradientEnd(brand: string, onBrand: string, ratio: number): string {
  const [L, C, H] = rgbToOklch(hexToRgb(brand) ?? [0, 0, 0]);
  const darker = contrastRatio(onBrand, "#000000") > contrastRatio(onBrand, "#ffffff");
  const step = darker ? -0.01 : 0.01;
  // Away from the yellows and olives, as the accent is: an orange brand warms towards red.
  const turned = (H + 40) % 360;
  const hue = turned >= 50 && turned <= 115 ? (H + 320) % 360 : turned;
  let end: Oklch = [Math.min(1, Math.max(0, L + step * 8)), C, hue];
  for (let i = 0; i < 100 && contrastRatio(onBrand, oklchToHex(end)) < ratio; i++)
    end = [Math.min(1, Math.max(0, end[0] + step)), end[1], end[2]];
  return oklchToHex(end);
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
    { foreground: "on-brand" as const, background: "gradient" as const, needs: onRatio },
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

// ── shape and density (RFC-0023 §3) ────────────────────────────────────────────────────────

export const RADII = ["none", "small", "medium", "large", "full"] as const;
export type Radius = (typeof RADII)[number];
export const DENSITIES = ["compact", "cozy", "airy"] as const;
export type Density = (typeof DENSITIES)[number];

/**
 * Corner radii in rem: `control` for buttons and fields (a pill at `full`), `s`, `m` and `l` for
 * small parts, cards and large surfaces. `small` is the blog theme's former look.
 */
const RADIUS: Record<Radius, { control: string; s: string; m: string; l: string }> = {
  none: { control: "0", s: "0", m: "0", l: "0" },
  small: { control: "0.25rem", s: "0.25rem", m: "0.375rem", l: "0.5rem" },
  medium: { control: "0.375rem", s: "0.375rem", m: "0.5rem", l: "0.75rem" },
  large: { control: "0.75rem", s: "0.5rem", m: "0.75rem", l: "1rem" },
  full: { control: "9999px", s: "0.5rem", m: "0.75rem", l: "1.25rem" },
};

/** How much room things get: a factor on the spacing unit (Tailwind's 0.25rem at `cozy`). */
const DENSITY: Record<Density, number> = { compact: 0.875, cozy: 1, airy: 1.2 };

/** The named spaces, in units of 0.25rem at `cozy`: xs 0.5rem … xl 2.5rem. */
const SPACES = { xs: 2, s: 3, m: 4, l: 6, xl: 10 } as const;

/**
 * The shape and density as CSS declarations for `:root`: `--ch-radius-{control,s,m,l}`,
 * `--ch-space-unit` and `--ch-space-{xs,s,m,l,xl}`. Unknown values fall back to the defaults.
 */
export function shapeCss(settings: { radius?: unknown; density?: unknown } = {}): string {
  const radius = (RADII as readonly unknown[]).includes(settings.radius)
    ? (settings.radius as Radius)
    : "small";
  const density = (DENSITIES as readonly unknown[]).includes(settings.density)
    ? (settings.density as Density)
    : "cozy";
  const r = RADIUS[radius];
  const unit = 0.25 * DENSITY[density];
  const rem = (v: number) => `${Number(v.toFixed(4))}rem`;
  return [
    `--ch-radius-control:${r.control}`,
    `--ch-radius-s:${r.s}`,
    `--ch-radius-m:${r.m}`,
    `--ch-radius-l:${r.l}`,
    `--ch-space-unit:${rem(unit)}`,
    ...Object.entries(SPACES).map(([name, n]) => `--ch-space-${name}:${rem(unit * n)}`),
  ].join(";");
}

// ── export (RFC-0023 §5): W3C Design Tokens Community Group format 2025.10 ──────────────────

export const DTCG_SCHEMA = "https://www.designtokens.org/schemas/2025.10/format.json";

type DtcgToken = { $type?: string; $value: unknown; $description?: string; $extensions?: unknown };
type DtcgGroup = { [key: string]: DtcgGroup | DtcgToken | string | unknown };

const dtcgColor = (hex: string): DtcgToken => {
  const [r, g, b] = hexToRgb(hex) ?? [0, 0, 0];
  const c = (v: number) => Number(v.toFixed(4));
  return { $value: { colorSpace: "srgb", components: [c(r), c(g), c(b)], hex } };
};
const dtcgDimension = (css: string): DtcgToken => {
  const m = /^(-?[\d.]+)(rem|px)?$/.exec(css);
  return { $value: { value: m ? Number(m[1]) : 0, unit: m?.[2] ?? "px" } };
};

/**
 * A site's tokens as a DTCG 2025.10 file, for Figma (Tokens Studio) and Style Dictionary: the
 * color roles for light and dark, the radii and spaces, and the fluid type steps once a scale
 * is chosen (desktop size as the value, the clamp in `$extensions`). The settings they came from
 * and the contrast repairs travel in `$extensions["dev.cloudhal"]`.
 */
export function designTokensDtcg(
  config: Readonly<Record<string, unknown>>,
  properties: Readonly<Record<string, { default?: unknown }>>,
  meta: { name?: string } = {},
): DtcgGroup {
  const colors = siteColorTokens(config, properties);
  const roles = (r: ColorRoles) =>
    Object.fromEntries(COLOR_ROLES.map((role) => [role, dtcgColor(r[role])]));
  const shape = Object.fromEntries(
    shapeCss({
      radius: config.radius ?? properties.radius?.default,
      density: config.density ?? properties.density?.default,
    })
      .split(";")
      .map((d) => d.split(":") as [string, string]),
  );
  const pick = (prefix: string) =>
    Object.fromEntries(
      Object.entries(shape)
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, v]) => [k.slice(prefix.length), dtcgDimension(v)]),
    );
  const scale = (TYPE_SCALES as readonly unknown[]).includes(config.typeScale)
    ? (config.typeScale as TypeScale)
    : undefined;
  const steps = scale
    ? Object.fromEntries(
        TYPE_STEPS.map((step) => {
          const clamp = typeStep(scale, step);
          const [lo, , hi] = clamp.slice(6, -1).split(",") as [string, string, string];
          return [
            String(step),
            {
              ...dtcgDimension(hi),
              $extensions: {
                "dev.cloudhal": {
                  min: dtcgDimension(lo).$value,
                  css: clamp,
                  viewport: [390, 1440],
                },
              },
            },
          ];
        }),
      )
    : undefined;
  const settings = Object.fromEntries(
    [
      "seed",
      "scheme",
      "contrast",
      "mode",
      "typePairing",
      "typeScale",
      "radius",
      "density",
      "motion",
      "pageTransition",
    ]
      .filter((k) => k in properties && config[k] !== undefined)
      .map((k) => [k, config[k]]),
  );
  return {
    $schema: DTCG_SCHEMA,
    $description: `Design tokens${meta.name ? ` of ${meta.name}` : ""}, expanded by Cloudhal (RFC-0023).`,
    color: {
      $type: "color",
      $description:
        colors.source === "seed"
          ? "Color roles from the seed; every text and UI pair meets WCAG 2.2."
          : "The theme's colors (no seed set).",
      light: roles(colors.light),
      dark: roles(colors.dark),
    },
    radius: { $type: "dimension", ...pick("--ch-radius-") },
    space: { $type: "dimension", ...pick("--ch-space-") },
    ...(steps ? { "type-step": { $type: "dimension", ...steps } } : {}),
    // RFC-0024 §6: the site's motion level as durations and easing curves.
    ...("motion" in properties
      ? { motion: motionTokens(config.motion ?? properties.motion?.default) }
      : {}),
    $extensions: {
      "dev.cloudhal": {
        settings,
        mode: colors.mode,
        source: colors.source,
        repairs: colors.notes,
      },
    },
  };
}

// ── motion (RFC-0024 §1, §6) ────────────────────────────────────────────────────────────────

export const MOTION_LEVELS = ["none", "subtle", "standard", "expressive"] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];

/** Durations (ms), distances (px) and the stagger step (ms) at each level. */
const MOTION: Record<
  MotionLevel,
  { dur: [number, number, number]; move: [number, number, number]; stagger: number }
> = {
  none: { dur: [0, 0, 0], move: [0, 0, 0], stagger: 0 },
  // Fades only: short, and nothing travels further than 8 px.
  subtle: { dur: [120, 200, 200], move: [4, 8, 8], stagger: 40 },
  standard: { dur: [150, 320, 600], move: [8, 24, 48], stagger: 70 },
  expressive: { dur: [200, 480, 850], move: [12, 40, 88], stagger: 90 },
};

/** DTCG `duration` and `cubicBezier` tokens for one motion level (RFC-0024 §6, 24e). */
function motionTokens(level: unknown): Record<string, unknown> {
  const l = (MOTION_LEVELS as readonly unknown[]).includes(level) ? (level as MotionLevel) : "none";
  const m = MOTION[l];
  const ms = (value: number) => ({ $value: { value, unit: "ms" } });
  return {
    $description: `Motion at the "${l}" level; readers who ask for reduced motion get none.`,
    duration: {
      $type: "duration",
      fast: ms(m.dur[0]),
      normal: ms(m.dur[1]),
      slow: ms(m.dur[2]),
      stagger: ms(m.stagger),
    },
    easing: {
      $type: "cubicBezier",
      standard: { $value: [0.2, 0, 0, 1] },
      emphasized: { $value: [0.3, 1.25, 0.55, 1] },
      exit: { $value: [0.4, 0, 1, 1] },
    },
    distance: {
      $type: "dimension",
      s: { $value: { value: m.move[0], unit: "px" } },
      m: { $value: { value: m.move[1], unit: "px" } },
      l: { $value: { value: m.move[2], unit: "px" } },
    },
  };
}

/**
 * The motion tokens for every level, each scoped to `:root[data-ch-motion="<level>"]` so a page's
 * own level (RFC-0024 §1) needs no other CSS: `--ch-dur-{fast,normal,slow}`,
 * `--ch-move-{s,m,l}`, `--ch-stagger` and the easing curves. The reader's reduced-motion setting
 * is handled by the theme's motion layer, which only animates under `no-preference`.
 */
export function motionCss(): string {
  const ease =
    "--ch-ease-standard:cubic-bezier(.2,0,0,1);--ch-ease-emphasized:cubic-bezier(.3,1.25,.55,1);--ch-ease-exit:cubic-bezier(.4,0,1,1)";
  return MOTION_LEVELS.map((level) => {
    const m = MOTION[level];
    return `:root[data-ch-motion="${level}"]{--ch-dur-fast:${m.dur[0]}ms;--ch-dur-normal:${m.dur[1]}ms;--ch-dur-slow:${m.dur[2]}ms;--ch-move-s:${m.move[0]}px;--ch-move-m:${m.move[1]}px;--ch-move-l:${m.move[2]}px;--ch-stagger:${m.stagger}ms;${ease}}`;
  }).join("");
}
