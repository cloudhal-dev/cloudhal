/**
 * Site chrome (RFC-0025): the header, footer and bars as data. `resolveChrome` gives a theme the
 * effective chrome of a page, with defaults that reproduce the blog theme's former header and
 * footer, so a site that never set `chrome` looks the same. `chromeSchemas` describe the same
 * fields as form schemas (Studio's generated form, agents' allowed values), and `checkChrome`
 * names what the contract cannot say (a button without its link, a menu that does not exist).
 * Worker-safe.
 */
import type { Asset, Page, Site, SurfaceSection } from "@cloudhal/core-contracts";
import type { PropsSchema } from "./blocks.ts";
import { assetUrl } from "./media/types.ts";

export type SiteChrome = NonNullable<Site["chrome"]>;
export type ChromeHeader = NonNullable<SiteChrome["header"]>;
export type ChromeFooter = NonNullable<SiteChrome["footer"]>;
export type HeaderAction = NonNullable<ChromeHeader["actions"]>[number];
export type SiteBrand = NonNullable<Site["brand"]>;

export const HEADER_LAYOUTS = [
  "logo-left",
  "logo-left-nav-center",
  "centered",
  "split",
  "minimal",
] as const;
export const HEADER_BEHAVIORS = ["static", "sticky", "hide-on-scroll", "fixed"] as const;
export const HEADER_WIDTHS = ["content", "wide", "full"] as const;
export const CHROME_SURFACES = ["plain", "muted", "raised", "inverse", "brand"] as const;
export const MOBILE_STYLES = ["dropdown", "drawer-start", "drawer-end", "fullscreen"] as const;
export const COLLAPSE_AT = ["sm", "md", "lg", "always"] as const;
export const HEADER_ACTIONS = [
  "button",
  "search",
  "locale",
  "theme-toggle",
  "motion-toggle",
] as const;
export const FOOTER_LAYOUTS = ["simple", "columns", "cta-band", "minimal"] as const;
export const SOCIAL_NETWORKS = [
  "x",
  "bluesky",
  "mastodon",
  "github",
  "linkedin",
  "instagram",
  "facebook",
  "youtube",
  "tiktok",
  "threads",
  "rss",
  "email",
] as const;

/** The header a page shows: every field filled, `hidden` when the page turned it off. */
export interface ResolvedHeader {
  layout: (typeof HEADER_LAYOUTS)[number];
  behavior: (typeof HEADER_BEHAVIORS)[number];
  shrink: boolean;
  /** Transparent over the page's first band (only over a loud one: `over`). */
  transparent: boolean;
  /** The loud surface of the page's first band the transparent header stands on. */
  over?: HeroSurface | undefined;
  width: (typeof HEADER_WIDTHS)[number];
  surface: (typeof CHROME_SURFACES)[number];
  mobileStyle: (typeof MOBILE_STYLES)[number];
  collapseAt: (typeof COLLAPSE_AT)[number];
  nav: string;
  utility?: string | undefined;
  actions: HeaderAction[];
  hidden: boolean;
}

/** The footer a page shows. `fallbackRss` keeps the former footer's RSS link when no menu exists. */
export interface ResolvedFooter {
  layout: (typeof FOOTER_LAYOUTS)[number];
  surface: "plain" | "muted" | "inverse";
  tagline?: string | undefined;
  columns: { heading: string; menu: string }[];
  cta?: { heading: string; label: string; href: string } | undefined;
  social: boolean;
  copyright?: string | undefined;
  legal?: string | undefined;
  credit: boolean;
  fallbackRss: boolean;
  hidden: boolean;
  /** RFC-0025 §2: the surface above the columns (not on a minimal footer). */
  region?: SurfaceSection | undefined;
}

/** RFC-0025 25d: the bar above the header; a dismissed one stays hidden for that reader. */
export interface ResolvedAnnouncement {
  id: string;
  text: string;
  link?: { label: string; href: string } | undefined;
  tone: "info" | "brand" | "warning";
  dismissible: boolean;
}

export interface ResolvedChrome {
  header: ResolvedHeader;
  footer: ResolvedFooter;
  announcement?: ResolvedAnnouncement | undefined;
  /** The consent bar's mode (`none`: no bar) and the privacy page it links to. */
  consent: { mode: "none" | "notice" | "choices"; policy?: string | undefined };
  /** Every menu key the header and footer name, for the route to load. */
  menus: string[];
}

/**
 * The chrome a page shows: the site's settings over the defaults (the former header: the site
 * name, the primary menu and search, in the reading column; the former footer: the credit and
 * the footer menu, or RSS), then the page's own `chrome` (a hidden header, a minimal footer).
 */
export function resolveChrome(
  site: Pick<Site, "chrome">,
  page?: (Pick<Page, "chrome"> & Partial<Pick<Page, "sections">>) | undefined,
): ResolvedChrome {
  // A transparent header needs a loud first band to stand on (RFC-0025 §2): its text takes that
  // surface's text role, so contrast holds; anywhere else it stays solid.
  const over = page ? heroSurface(page) : undefined;
  const wantsTransparent =
    page?.chrome?.header === "transparent" || site.chrome?.header?.overHero === "transparent";
  const h = site.chrome?.header ?? {};
  const f = site.chrome?.footer;
  const header: ResolvedHeader = {
    layout: h.layout ?? "logo-left",
    behavior: h.behavior ?? "static",
    shrink: h.shrink === true,
    transparent: wantsTransparent && over !== undefined,
    over: wantsTransparent ? over : undefined,
    width: h.width ?? "content",
    surface: h.surface ?? "plain",
    mobileStyle: h.mobileStyle ?? "dropdown",
    collapseAt: h.collapseAt ?? "md",
    nav: h.nav ?? "primary",
    utility: h.utility,
    actions: h.actions ?? [{ kind: "search" }],
    hidden: page?.chrome?.header === "hidden",
  };
  const minimal = page?.chrome?.footer === "minimal";
  const layout = minimal ? "minimal" : (f?.layout ?? "simple");
  const footer: ResolvedFooter = {
    layout,
    surface: f?.surface ?? "plain",
    tagline: f?.tagline,
    columns: layout === "columns" || layout === "cta-band" ? (f?.columns ?? []) : [],
    cta:
      layout === "cta-band" && f?.ctaHeading && f.ctaLabel && f.ctaHref
        ? { heading: f.ctaHeading, label: f.ctaLabel, href: f.ctaHref }
        : undefined,
    social: f?.social === true,
    copyright: f?.copyright,
    // The former footer showed the `footer` menu in its row.
    legal: f ? f.legal : "footer",
    credit: f?.credit !== false,
    fallbackRss: !f,
    hidden: page?.chrome?.footer === "hidden",
    region: !minimal && f?.region?.kind === "surface" ? f.region : undefined,
  };
  const menus = [
    header.nav,
    ...(header.utility ? [header.utility] : []),
    ...footer.columns.map((c) => c.menu),
    ...(footer.legal ? [footer.legal] : []),
  ];
  const a = site.chrome?.announcement;
  const announcement: ResolvedAnnouncement | undefined = a
    ? {
        id: a.id,
        text: a.text,
        link: a.label && a.href ? { label: a.label, href: a.href } : undefined,
        tone: a.tone ?? "info",
        dismissible: a.dismissible !== false,
      }
    : undefined;
  const c = site.chrome?.consent;
  return {
    header,
    footer,
    announcement,
    consent: { mode: c?.mode ?? "none", policy: c?.policy },
    menus: [...new Set(menus)],
  };
}

/** The surfaces loud enough for a transparent header to stand on (their text role is light or dark enough). */
export const HERO_SURFACES = ["inverse", "brand", "accent", "gradient"] as const;
export type HeroSurface = (typeof HERO_SURFACES)[number];
const TONE_HERO: Record<string, HeroSurface> = { inverse: "inverse", brand: "brand" };

/**
 * The loud surface a page opens with: its first section a generated surface whose root is (or
 * starts with, three levels deep at most) a `Band` painted `inverse`, `brand`, `accent` or
 * `gradient` (an old `tone` counts). Undefined otherwise.
 */
export function heroSurface(page: Partial<Pick<Page, "sections">>): HeroSurface | undefined {
  const first = page.sections?.[0];
  if (!first || first.kind !== "surface") return undefined;
  const byId = new Map(first.components.map((c) => [c.id, c]));
  let c = byId.get("root");
  for (let depth = 0; c && depth < 3; depth++) {
    if (c.component === "Band") {
      const p = (c.props ?? {}) as Record<string, unknown>;
      if ((HERO_SURFACES as readonly unknown[]).includes(p.surface))
        return p.surface as HeroSurface;
      return p.surface === undefined && typeof p.tone === "string" ? TONE_HERO[p.tone] : undefined;
    }
    const kids = c.children;
    const firstChild = Array.isArray(kids) ? kids[0] : undefined;
    c = typeof firstChild === "string" ? byId.get(firstChild) : undefined;
  }
  return undefined;
}

/** The legal line with its only placeholders filled: `{year}` and `{site}`. */
export function copyrightText(template: string, siteName: string, year: number): string {
  return template.replaceAll("{year}", String(year)).replaceAll("{site}", siteName);
}

/** A problem with the chrome the contract cannot see, as a JSON Pointer and a message. */
export interface ChromeIssue {
  path: string;
  message: string;
}

/**
 * What the contract cannot check: a button needs its label and link, an action kind appears once,
 * menu keys name menus the site has (when `menus` is given), a call-to-action band has its parts.
 */
export function checkChrome(
  chrome: SiteChrome | undefined,
  menus?: readonly string[],
): ChromeIssue[] {
  const out: ChromeIssue[] = [];
  if (!chrome) return out;
  const known = (key: string | undefined, at: string) => {
    if (key && menus && !menus.includes(key))
      out.push({ path: at, message: `no menu "${key}" (menus: ${menus.join(", ") || "none"})` });
  };
  const h = chrome.header;
  if (h) {
    known(h.nav, "/header/nav");
    known(h.utility, "/header/utility");
    const seen = new Set<string>();
    (h.actions ?? []).forEach((a, i) => {
      if (a.kind === "button" && (!a.label || !a.href))
        out.push({ path: `/header/actions/${i}`, message: "a button needs label and href" });
      if (a.kind !== "button" && seen.has(a.kind))
        out.push({ path: `/header/actions/${i}`, message: `${a.kind} appears once` });
      seen.add(a.kind);
    });
  }
  const f = chrome.footer;
  if (f) {
    for (const [i, c] of (f.columns ?? []).entries()) known(c.menu, `/footer/columns/${i}/menu`);
    known(f.legal, "/footer/legal");
    if (f.layout === "cta-band" && !(f.ctaHeading && f.ctaLabel && f.ctaHref))
      out.push({ path: "/footer", message: "cta-band needs ctaHeading, ctaLabel and ctaHref" });
    if (f.copyright && /\{(?!year\}|site\})[^}]*\}/.test(f.copyright))
      out.push({
        path: "/footer/copyright",
        message: "the only placeholders are {year} and {site}",
      });
  }
  return out;
}

const labels = (pairs: Record<string, [string, string]>) =>
  Object.fromEntries(Object.entries(pairs).map(([k, [en, tr]]) => [k, { en, tr }]));
const menuKey = (en: string, tr: string) => ({
  type: "string" as const,
  pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
  maxLength: 64,
  title: { en, tr },
});

/**
 * The chrome as form schemas (RFC-0017's subset): Studio generates its form from them and agents
 * read the allowed values. They mirror `Site.brand` and `Site.chrome`, except the logo, which the
 * form takes as an asset (`asset:<id>`) and the server turns into an `ImageRef`.
 */
export const chromeSchemas: {
  brand: PropsSchema;
  header: PropsSchema;
  footer: PropsSchema;
  announcement: PropsSchema;
  consent: PropsSchema;
} = {
  brand: {
    type: "object",
    additionalProperties: false,
    properties: {
      logo: {
        type: "string",
        format: "asset",
        "x-widget": "asset-picker",
        title: { en: "Logo", tr: "Logo" },
        description: {
          en: "Without one, the site's name shows as text.",
          tr: "Yoksa sitenin adı yazı olarak görünür.",
        },
      },
      logoDark: {
        type: "string",
        format: "asset",
        "x-widget": "asset-picker",
        title: { en: "Logo for dark mode", tr: "Koyu mod logosu" },
      },
      logoHeight: {
        type: "string",
        enum: ["s", "m", "l"],
        "x-labels": labels({ s: ["Small", "Küçük"], m: ["Medium", "Orta"], l: ["Large", "Büyük"] }),
        "x-widget": "radio",
        title: { en: "Logo size", tr: "Logo boyutu" },
      },
      social: {
        type: "array",
        maxItems: 8,
        title: { en: "Social links", tr: "Sosyal bağlantılar" },
        items: {
          type: "object",
          additionalProperties: false,
          required: ["network", "href"],
          properties: {
            network: { type: "string", enum: SOCIAL_NETWORKS, title: { en: "Network", tr: "Ağ" } },
            href: {
              type: "string",
              format: "url",
              maxLength: 2048,
              title: { en: "Link", tr: "Bağlantı" },
            },
          },
        },
      },
    },
  },
  header: {
    type: "object",
    additionalProperties: false,
    properties: {
      layout: {
        type: "string",
        enum: HEADER_LAYOUTS,
        "x-labels": labels({
          "logo-left": ["Logo left, menu right", "Logo solda, menü sağda"],
          "logo-left-nav-center": ["Logo left, menu centered", "Logo solda, menü ortada"],
          centered: ["Centered", "Ortalı"],
          split: ["Menu, logo, actions", "Menü, logo, eylemler"],
          minimal: ["Minimal (menu behind a button)", "Sade (menü bir düğmenin arkasında)"],
        }),
        title: { en: "Layout", tr: "Düzen" },
      },
      behavior: {
        type: "string",
        enum: HEADER_BEHAVIORS,
        "x-labels": labels({
          static: ["Scrolls away", "Kayıp gider"],
          sticky: ["Stays on top", "Üstte kalır"],
          "hide-on-scroll": ["Hides while scrolling down", "Aşağı kayarken gizlenir"],
          fixed: ["Fixed", "Sabit"],
        }),
        title: { en: "Behavior", tr: "Davranış" },
      },
      width: {
        type: "string",
        enum: HEADER_WIDTHS,
        "x-labels": labels({
          content: ["Reading column", "Okuma sütunu"],
          wide: ["Wide", "Geniş"],
          full: ["Full width", "Tam genişlik"],
        }),
        "x-widget": "radio",
        title: { en: "Width", tr: "Genişlik" },
      },
      surface: {
        type: "string",
        enum: CHROME_SURFACES,
        "x-labels": labels({
          plain: ["Page", "Sayfa"],
          muted: ["Muted", "Soluk"],
          raised: ["Raised", "Yükseltilmiş"],
          inverse: ["Inverse", "Ters"],
          brand: ["Brand", "Marka"],
        }),
        title: { en: "Surface", tr: "Yüzey" },
      },
      overHero: {
        type: "string",
        enum: ["solid", "transparent"],
        "x-labels": labels({
          solid: ["Solid", "Dolu"],
          transparent: ["Transparent over a loud hero", "Canlı bir hero üstünde saydam"],
        }),
        "x-widget": "radio",
        title: { en: "Over the hero", tr: "Hero üstünde" },
      },
      mobileStyle: {
        type: "string",
        enum: MOBILE_STYLES,
        "x-labels": labels({
          dropdown: ["Dropdown", "Açılır"],
          "drawer-start": ["Drawer from the left", "Soldan çekmece"],
          "drawer-end": ["Drawer from the right", "Sağdan çekmece"],
          fullscreen: ["Full screen", "Tam ekran"],
        }),
        title: { en: "Phone menu", tr: "Telefon menüsü" },
      },
      collapseAt: {
        type: "string",
        enum: COLLAPSE_AT,
        "x-labels": labels({
          sm: ["Phones", "Telefonlarda"],
          md: ["Phones and small tablets", "Telefon ve küçük tabletlerde"],
          lg: ["Below laptops", "Dizüstünden küçük ekranlarda"],
          always: ["Always", "Her zaman"],
        }),
        title: { en: "Menu behind a button", tr: "Menü bir düğmenin arkasında" },
      },
      shrink: {
        type: "boolean",
        title: { en: "Shrink while scrolling", tr: "Kaydırırken küçült" },
      },
      nav: menuKey("Menu", "Menü"),
      utility: menuKey("Second menu (small)", "İkinci menü (küçük)"),
      actions: {
        type: "array",
        maxItems: 3,
        title: { en: "Actions", tr: "Eylemler" },
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind"],
          properties: {
            kind: {
              type: "string",
              enum: HEADER_ACTIONS,
              "x-labels": labels({
                button: ["Button", "Düğme"],
                search: ["Search", "Arama"],
                locale: ["Language", "Dil"],
                "theme-toggle": ["Light or dark", "Açık veya koyu"],
                "motion-toggle": ["Pause motion", "Hareketi duraklat"],
              }),
              title: { en: "Kind", tr: "Tür" },
            },
            label: { type: "string", maxLength: 40, title: { en: "Label", tr: "Etiket" } },
            href: {
              type: "string",
              format: "url",
              maxLength: 2048,
              title: { en: "Link", tr: "Bağlantı" },
            },
            variant: {
              type: "string",
              enum: ["primary", "secondary"],
              "x-labels": labels({
                primary: ["Primary", "Birincil"],
                secondary: ["Secondary", "İkincil"],
              }),
              title: { en: "Style", tr: "Stil" },
            },
          },
        },
      },
    },
  },
  footer: {
    type: "object",
    additionalProperties: false,
    properties: {
      layout: {
        type: "string",
        enum: FOOTER_LAYOUTS,
        "x-labels": labels({
          simple: ["Simple", "Basit"],
          columns: ["Link columns", "Bağlantı sütunları"],
          "cta-band": ["Call to action and columns", "Çağrı ve sütunlar"],
          minimal: ["Minimal", "Sade"],
        }),
        title: { en: "Layout", tr: "Düzen" },
      },
      surface: {
        type: "string",
        enum: ["plain", "muted", "inverse"],
        "x-labels": labels({
          plain: ["Page", "Sayfa"],
          muted: ["Muted", "Soluk"],
          inverse: ["Inverse", "Ters"],
        }),
        "x-widget": "radio",
        title: { en: "Surface", tr: "Yüzey" },
      },
      tagline: { type: "string", maxLength: 200, title: { en: "Tagline", tr: "Slogan" } },
      columns: {
        type: "array",
        maxItems: 5,
        title: { en: "Columns", tr: "Sütunlar" },
        items: {
          type: "object",
          additionalProperties: false,
          required: ["heading", "menu"],
          properties: {
            heading: {
              type: "string",
              minLength: 1,
              maxLength: 60,
              title: { en: "Heading", tr: "Başlık" },
            },
            menu: menuKey("Menu", "Menü"),
          },
        },
      },
      ctaHeading: { type: "string", maxLength: 120, title: { en: "Call to action", tr: "Çağrı" } },
      ctaLabel: {
        type: "string",
        maxLength: 40,
        title: { en: "Button label", tr: "Düğme etiketi" },
      },
      ctaHref: {
        type: "string",
        format: "url",
        maxLength: 2048,
        title: { en: "Button link", tr: "Düğme bağlantısı" },
      },
      social: {
        type: "boolean",
        title: { en: "Show social links", tr: "Sosyal bağlantıları göster" },
      },
      copyright: {
        type: "string",
        maxLength: 200,
        title: { en: "Copyright", tr: "Telif" },
        description: { en: "{year} and {site} are filled in.", tr: "{year} ve {site} doldurulur." },
      },
      legal: menuKey("Legal menu", "Yasal menü"),
      credit: {
        type: "boolean",
        title: { en: "Show “Built with Cloudhal”", tr: "“Cloudhal ile yapıldı” göster" },
      },
    },
  },
  announcement: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: {
        type: "string",
        pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
        maxLength: 40,
        title: {
          en: "Name (change it to show a new bar)",
          tr: "Ad (yeni bir bar göstermek için değiştirin)",
        },
      },
      text: {
        type: "string",
        maxLength: 160,
        title: { en: "Text", tr: "Metin" },
      },
      label: { type: "string", maxLength: 40, title: { en: "Link text", tr: "Bağlantı metni" } },
      href: {
        type: "string",
        format: "url",
        maxLength: 2048,
        title: { en: "Link", tr: "Bağlantı" },
      },
      tone: {
        type: "string",
        enum: ["info", "brand", "warning"],
        "x-labels": labels({
          info: ["Info", "Bilgi"],
          brand: ["Brand", "Marka"],
          warning: ["Warning", "Uyarı"],
        }),
        "x-widget": "radio",
        title: { en: "Tone", tr: "Ton" },
      },
      dismissible: {
        type: "boolean",
        title: { en: "Readers can close it", tr: "Okurlar kapatabilir" },
      },
    },
  },
  consent: {
    type: "object",
    additionalProperties: false,
    properties: {
      mode: {
        type: "string",
        enum: ["none", "notice", "choices"],
        "x-labels": labels({
          none: ["No bar", "Bar yok"],
          notice: ["A notice with OK", "Tamam düğmeli bir bildirim"],
          choices: ["Allow all or only essential", "Tümüne izin ver ya da yalnız gerekli"],
        }),
        title: { en: "Privacy bar", tr: "Gizlilik barı" },
      },
      policy: {
        type: "string",
        format: "url",
        maxLength: 2048,
        title: { en: "Privacy page", tr: "Gizlilik sayfası" },
      },
    },
  },
};

/** What a brand form needs to know about a logo asset: its media URL, size and default alt text. */
export interface LogoAsset {
  src: string;
  width?: number | undefined;
  height?: number | undefined;
  alt?: string | undefined;
}

/** What `brandFromForm` needs from an asset of the site, or undefined when it is not an image of it. */
export function logoAsset(
  asset: Asset | undefined,
  site: Pick<Site, "id" | "defaultLocale">,
): LogoAsset | undefined {
  if (!asset || asset.siteId !== site.id || asset.kind !== "image") return undefined;
  return {
    src: assetUrl(asset),
    width: asset.image?.width,
    height: asset.image?.height,
    alt: asset.decorative
      ? ""
      : (asset.alt?.[site.defaultLocale] ?? Object.values(asset.alt ?? {})[0]),
  };
}

const ASSET_VALUE = /^asset:([a-z]+_[A-Za-z0-9]{6,32})$/;

/**
 * The brand form's values (`chromeSchemas.brand`, logos as `asset:<id>`) as `Site.brand`: each logo
 * becomes an `ImageRef` with the asset's URL and size, so readers that do not resolve assets still
 * show it. A logo value that is not an asset, or an asset `resolve` does not know, is an issue.
 */
export async function brandFromForm(
  values: Readonly<Record<string, unknown>>,
  resolve: (assetId: string) => Promise<LogoAsset | undefined>,
): Promise<{ brand: SiteBrand | undefined; issues: ChromeIssue[] }> {
  const issues: ChromeIssue[] = [];
  const brand: Record<string, unknown> = {};
  for (const key of ["logo", "logoDark"] as const) {
    const v = values[key];
    if (v === undefined || v === null || v === "") continue;
    const m = typeof v === "string" ? ASSET_VALUE.exec(v) : null;
    const asset = m?.[1] ? await resolve(m[1]) : undefined;
    if (!m?.[1] || !asset) {
      issues.push({ path: `/${key}`, message: "an image asset of this site (asset:<id>)" });
      continue;
    }
    brand[key] = {
      assetId: m[1],
      src: asset.src,
      alt: asset.alt ?? "",
      ...(asset.width ? { width: asset.width } : {}),
      ...(asset.height ? { height: asset.height } : {}),
    };
  }
  if (values.logoHeight !== undefined && values.logoHeight !== null)
    brand.logoHeight = values.logoHeight;
  if (Array.isArray(values.social) && values.social.length > 0) brand.social = values.social;
  return {
    brand: Object.keys(brand).length > 0 ? (brand as SiteBrand) : undefined,
    issues,
  };
}

/** `Site.brand` as the brand form's values (logos as `asset:<id>`; a logo without an asset is dropped). */
export function brandToForm(brand: SiteBrand | undefined): Record<string, unknown> {
  if (!brand) return {};
  const { logo, logoDark, ...rest } = brand;
  return {
    ...rest,
    ...(logo?.assetId ? { logo: `asset:${logo.assetId}` } : {}),
    ...(logoDark?.assetId ? { logoDark: `asset:${logoDark.assetId}` } : {}),
  };
}

/** The menu keys a site can name: `primary` (derived from pages when the site has none) and its menus. */
export function chromeMenuKeys(menus: readonly { key: string }[]): string[] {
  return [...new Set(["primary", ...menus.map((m) => m.key)])];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A form part without its empty fields; undefined when nothing is left. */
function formPart(v: unknown): Record<string, unknown> | undefined {
  if (!isObject(v)) return undefined;
  const out = Object.fromEntries(
    Object.entries(v).filter(([, x]) => x !== undefined && x !== null && x !== ""),
  );
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The site with the parts of a chrome form replaced (Studio's form, `cloudhal chrome set`): each
 * part given replaces the site's (empty: back to the default), logos resolved through `resolve`.
 * Returns the issues `checkChrome` and the brand found instead when there are any; the contract
 * itself is checked by the store when the site is saved.
 */
export async function applyChromeForm<S extends Site>(
  site: S,
  input: {
    header?: unknown;
    footer?: unknown;
    brand?: unknown;
    announcement?: unknown;
    consent?: unknown;
  },
  options: {
    menus: readonly string[];
    resolve: (assetId: string) => Promise<LogoAsset | undefined>;
  },
): Promise<{ site: S; issues: ChromeIssue[] }> {
  const issues: ChromeIssue[] = [];
  for (const key of ["header", "footer", "brand", "announcement", "consent"] as const)
    if (input[key] !== undefined && !isObject(input[key]))
      issues.push({ path: `/${key}`, message: "an object" });
  if (issues.length > 0) return { site, issues };
  const chrome: SiteChrome = { ...(site.chrome ?? {}) };
  for (const key of ["header", "footer", "announcement", "consent"] as const) {
    if (input[key] === undefined) continue;
    const v = formPart(input[key]);
    // The footer's region is a surface no form edits: it stays unless the input removes it (null).
    const region = chrome.footer?.region;
    if (key === "footer" && region && v && !("region" in (input.footer as object)))
      v.region = region;
    if (v) (chrome as Record<string, unknown>)[key] = v;
    else delete chrome[key];
  }
  issues.push(...checkChrome(chrome, options.menus));
  let brand = site.brand;
  if (input.brand !== undefined) {
    const out = await brandFromForm(formPart(input.brand) ?? {}, options.resolve);
    issues.push(...out.issues.map((i) => ({ ...i, path: `/brand${i.path}` })));
    brand = out.brand;
  }
  const { chrome: _c, brand: _b, ...rest } = site;
  return {
    site: {
      ...rest,
      ...(Object.keys(chrome).length > 0 ? { chrome } : {}),
      ...(brand ? { brand } : {}),
    } as S,
    issues,
  };
}
