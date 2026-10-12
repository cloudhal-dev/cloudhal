import { ChartPalette } from "@cloudflare/kumo";
import { useMemo, useSyncExternalStore } from "react";

/**
 * Chart colours from Kumo's semantic tokens (RFC-0006 §10.4). ECharts and Kumo's
 * `TimeseriesData.color` need concrete hex strings, and DESIGN.md §4 forbids raw colours, so
 * the hook reads the tokens the page is themed with (`--color-kumo-brand`, …), resolves them to
 * hex through the browser, and resolves again whenever `data-mode` (or the OS scheme) flips.
 * Where the browser cannot resolve a token (tests, no canvas) it falls back to Kumo's own chart
 * palette (`ChartPalette`), which is the same family.
 */
export interface ChartColors {
  isDarkMode: boolean;
  /** Series colours in order: brand, purple, teal, orange (Kumo badge tokens). */
  series: string[];
  /** Sequential ramp, low → high, for the country map: the brand colour over the card surface. */
  ramp: string[];
  /** Fill for regions without data (`--color-kumo-fill`), distinct from the card in both modes. */
  noData: string;
}

const SERIES_TOKENS = [
  "--color-kumo-brand",
  "--color-kumo-badge-purple",
  "--color-kumo-badge-teal",
  "--color-kumo-badge-orange",
] as const;

function readMode(): "dark" | "light" {
  if (typeof document === "undefined") return "light";
  const mode = document.documentElement.getAttribute("data-mode");
  if (mode === "dark" || mode === "light") return mode;
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function subscribeMode(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer =
    typeof MutationObserver === "undefined" ? undefined : new MutationObserver(onChange);
  observer?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener?.("change", onChange);
  return () => {
    observer?.disconnect();
    media?.removeEventListener?.("change", onChange);
  };
}

/** `light` or `dark`, following `data-mode` on `<html>` and then the OS scheme. */
export function useColorMode(): "dark" | "light" {
  return useSyncExternalStore(subscribeMode, readMode, () => "light");
}

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/** Resolves CSS custom properties to `#rrggbb` through one probe element and a 1×1 canvas. */
function makeResolver(): ((token: string) => string | undefined) & { done: () => void } {
  let probe: HTMLElement | undefined;
  let ctx: CanvasRenderingContext2D | null | undefined;
  const resolve = (token: string): string | undefined => {
    if (typeof document === "undefined" || !document.body) return undefined;
    try {
      if (!probe) {
        probe = document.createElement("span");
        probe.style.display = "none";
        document.body.appendChild(probe);
      }
      probe.style.color = "";
      probe.style.color = `var(${token})`;
      const computed = getComputedStyle(probe).color;
      if (!computed) return undefined;
      if (ctx === undefined) {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        ctx = canvas.getContext?.("2d", { willReadFrequently: true }) ?? null;
      }
      if (!ctx?.getImageData) return undefined;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000000";
      ctx.fillStyle = computed;
      ctx.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
      if (a === 0) return undefined;
      return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
    } catch {
      return undefined;
    }
  };
  return Object.assign(resolve, {
    done: () => {
      probe?.remove();
      probe = undefined;
    },
  });
}

function parseHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `a` mixed into `b` by `t` (0 → a, 1 → b), in sRGB. */
export function mixHex(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return `#${x.map((v, i) => hex2(v + ((y[i] as number) - v) * t)).join("")}`;
}

/** Resolves the chart colours for a mode now (exported for tests and non-React callers). */
export function resolveChartColors(isDarkMode: boolean): ChartColors {
  const resolve = makeResolver();
  const fallbackMap = ChartPalette.mapColors(isDarkMode);
  const series = SERIES_TOKENS.map(
    (token, i) => resolve(token) ?? ChartPalette.categorical(i, isDarkMode),
  );
  const brand = series[0] as string;
  const surface = resolve("--color-kumo-base");
  const contrast = resolve("--color-kumo-contrast");
  const noData = resolve("--color-kumo-fill") ?? fallbackMap.area;
  resolve.done();
  // Low → high: the brand faded into the card, the brand, then the brand pushed towards the
  // contrast colour (darker in light mode, lighter in dark mode), like Kumo's own map ramps. The
  // low end starts further from the card in dark mode, where faint blues vanish.
  const start = isDarkMode ? 0.35 : 0.2;
  const ramp =
    surface && contrast
      ? [
          mixHex(surface, brand, start),
          mixHex(surface, brand, (start + 1) / 2),
          brand,
          mixHex(brand, contrast, isDarkMode ? 0.45 : 0.35),
        ]
      : fallbackMap.scale;
  return { isDarkMode, series, ramp, noData };
}

/** Chart colours for the current colour mode; re-resolved when the mode changes. */
export function useChartPalette(): ChartColors {
  const mode = useColorMode();
  return useMemo(() => resolveChartColors(mode === "dark"), [mode]);
}

/** `true` when the person asked the system to reduce motion. */
function readReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  media?.addEventListener?.("change", onChange);
  return () => media?.removeEventListener?.("change", onChange);
}

/** Follows `prefers-reduced-motion`; charts turn their animations off when it is set. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
}
