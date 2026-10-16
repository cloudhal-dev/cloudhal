/**
 * A theme's design settings on the page (RFC-0017 §1): `Site.theme.config` read against the
 * theme's schema (`src/settings.ts`). Colors and numbers become CSS custom properties on `:root`
 * (`--ch-brand: #2563eb`), enums and switches become `data-ch-*` attributes on `<html>` for the
 * theme's CSS to select on (`[data-ch-font="serif"]`). Only typed values pass: a `#rrggbb` color,
 * an enum member, a finite number inside its bounds, a boolean. A value that no longer fits (the
 * theme changed) falls back to its default, so nothing in a value ever reaches CSS as free text.
 */
import type { Site } from "@cloudhal/core-contracts";
import type { PropsSchema } from "@cloudhal/core-ts/blocks";
import {
  colorRolesCss,
  siteColorTokens,
  TYPE_SCALES,
  type TypeScale,
  typeScaleCss,
} from "@cloudhal/core-ts/tokens";

const COLOR = /^#[0-9a-fA-F]{6}$/;
const kebab = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const SAFE_KEY = /^[A-Za-z][A-Za-z0-9]{0,40}$/;

export interface ThemeVariables {
  /** `:root{--ch-…}` for a `<style>` element (empty when nothing applies). */
  style: string;
  /** `data-ch-*` attributes for `<html>`. */
  attributes: Record<string, string>;
}

/** The site's design settings as CSS variables and attributes (defaults where unset). */
export function themeVariables(
  site: Pick<Site, "theme">,
  schema: PropsSchema | undefined,
): ThemeVariables {
  const vars: string[] = [];
  const attributes: Record<string, string> = {};
  if (!schema) return { style: "", attributes };
  const config = site.theme.config ?? {};
  for (const [key, s] of Object.entries(schema.properties)) {
    if (!SAFE_KEY.test(key)) continue;
    const name = kebab(key);
    const pick = (ok: (v: unknown) => boolean) => {
      const v = config[key];
      if (ok(v)) return v;
      return ok(s.default) ? s.default : undefined;
    };
    if (s.type === "string" && s.format === "color") {
      const v = pick((x) => typeof x === "string" && COLOR.test(x));
      if (v !== undefined) vars.push(`--ch-${name}:${(v as string).toLowerCase()}`);
    } else if (s.type === "string" && s.enum) {
      const allowed = s.enum;
      const v = pick((x) => typeof x === "string" && allowed.includes(x));
      if (typeof v === "string" && /^[a-z0-9-]{1,40}$/.test(v)) attributes[`data-ch-${name}`] = v;
    } else if (s.type === "number" || s.type === "integer") {
      const v = pick(
        (x) =>
          typeof x === "number" &&
          Number.isFinite(x) &&
          (s.minimum === undefined || x >= s.minimum) &&
          (s.maximum === undefined || x <= s.maximum),
      );
      if (typeof v === "number") vars.push(`--ch-${name}:${v}`);
    } else if (s.type === "boolean") {
      const v = pick((x) => typeof x === "boolean");
      if (typeof v === "boolean") attributes[`data-ch-${name}`] = v ? "on" : "off";
    }
  }
  // RFC-0023 §1: the color roles every theme can use (`--ch-color-<role>`).
  const roles = colorRoleCss(config, schema);
  if (roles) vars.push(roles);
  // RFC-0023 §2: the fluid type steps (`--ch-step-<n>`), once the site chose a scale; until then
  // the theme's fixed sizes stay, so a site that never opts in looks the same.
  const scale = config.typeScale;
  if ("typeScale" in schema.properties && TYPE_SCALES.includes(scale as TypeScale))
    vars.push(typeScaleCss(scale as TypeScale));
  return { style: vars.length ? `:root{${vars.join(";")}}` : "", attributes };
}

/**
 * The color roles for a site: expanded from its seed (RFC-0023) when the theme declares `seed`
 * and the site set one or chose a dark or automatic mode; otherwise its old colors with the blog
 * theme's former greys, so a site that never opts in looks the same.
 */
export function colorRoleCss(
  config: Readonly<Record<string, unknown>>,
  schema: PropsSchema,
): string {
  return colorRolesCss(siteColorTokens(config, schema.properties));
}
