/**
 * The built-in status document (RFC-0043 §1.3): one self-contained HTML page under 8 KB with
 * inline CSS, the system font stack, no scripts and no requests except the site's own logo.
 * Light and dark through `prefers-color-scheme`, logical properties only (ADR-0033), and the
 * published site's tokens (§1.3) as four custom properties when the state allows them.
 */
import type { StatusMessages } from "./status-strings/en.ts";

export type StatusDir = "ltr" | "rtl";

/** The published site's look, read from `Site.theme.config` (§1.3); every field optional. */
export interface StatusTheme {
  /** `#rrggbb`: a decorative accent (never text), so it needs no contrast check. */
  readonly brand?: string | undefined;
  /** `#rrggbb`: the page background; used only together with `text` and when they contrast. */
  readonly surface?: string | undefined;
  /** `#rrggbb`: the text color; used only together with `surface` and when they contrast. */
  readonly text?: string | undefined;
  readonly font?: "sans" | "serif" | "mono" | undefined;
}

/** What the template draws; every piece already chosen and, where it is text, still unescaped. */
export interface StatusDocument {
  readonly state: string;
  readonly locale: string;
  readonly dir: StatusDir;
  readonly noindex: boolean;
  readonly words: Pick<StatusMessages, "builtWith"> & { title: string; body: string };
  readonly siteName?: string | undefined;
  /** A same-origin `/media/…` URL only (the page's CSP allows `img-src 'self'`). */
  readonly logo?: string | undefined;
  readonly message?: { readonly text: string; readonly locale: string; readonly dir: StatusDir };
  /** "Back by …", already formatted. */
  readonly until?: string | undefined;
  /** "Reference: …", already formatted. */
  readonly reference?: string | undefined;
  readonly theme?: StatusTheme | undefined;
  /** Extra CSS from a theme hook's `defaultHtml({ css })`, appended after the built-in rules. */
  readonly css?: string | undefined;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/** The owner's message: escaped, line breaks as `<br>`; never markup or links (§2.10). */
export function messageHtml(text: string): string {
  return escapeHtml(text.replace(/\r\n?/g, "\n"))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("<br>");
}

const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG 2.x contrast ratio of two `#rrggbb` colors. */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Only typed values reach the stylesheet: hex colors (a readable pair) and a font keyword. */
function themeCss(theme: StatusTheme | undefined): string {
  if (!theme) return "";
  const decl: string[] = [];
  if (theme.brand && HEX.test(theme.brand)) decl.push(`--ch-status-brand:${theme.brand}`);
  if (
    theme.surface &&
    theme.text &&
    HEX.test(theme.surface) &&
    HEX.test(theme.text) &&
    contrastRatio(theme.surface, theme.text) >= 4.5
  )
    decl.push(`--ch-status-surface:${theme.surface}`, `--ch-status-text:${theme.text}`);
  const stacks = {
    sans: "system-ui, sans-serif",
    serif: "ui-serif, Georgia, serif",
    mono: "ui-monospace, Menlo, monospace",
  };
  if (theme.font && theme.font in stacks) decl.push(`--ch-status-font:${stacks[theme.font]}`);
  return decl.length ? `:root{${decl.join(";")}}` : "";
}

/** The built-in rules: about 1.2 KB, logical properties only. */
const CSS = [
  ":root{--ch-status-brand:#2563eb;--ch-status-surface:#f6f7f9;--ch-status-text:#1a1d21;",
  "--ch-status-muted:#5b6470;--ch-status-card:#ffffff;--ch-status-font:system-ui,sans-serif;",
  "color-scheme:light dark}",
  "@media(prefers-color-scheme:dark){:root{--ch-status-surface:#111418;--ch-status-text:#e8eaed;",
  "--ch-status-muted:#a3abb5;--ch-status-card:#1b1f25}}",
  "*{box-sizing:border-box}",
  "html{background:var(--ch-status-surface);color:var(--ch-status-text);",
  "font:16px/1.5 var(--ch-status-font)}",
  "body{margin:0;min-height:100vh;display:grid;grid-template-rows:1fr auto;",
  "padding-block:1rem;padding-inline:1rem}",
  ".ch-status{align-self:center;justify-self:center;inline-size:100%;max-inline-size:32rem;",
  "background:var(--ch-status-card);border-block-start:4px solid var(--ch-status-brand);",
  "border-radius:.75rem;padding-block:2rem;padding-inline:1.75rem;",
  "box-shadow:0 1px 2px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.08)}",
  ".ch-status__logo{max-block-size:3rem;max-inline-size:12rem;margin-block-end:1rem}",
  ".ch-status__site{margin:0 0 .5rem;font-size:.875rem;letter-spacing:.04em;",
  "text-transform:uppercase;color:var(--ch-status-muted)}",
  "h1{margin:0 0 .75rem;font-size:1.625rem;line-height:1.25}",
  "p{margin:0 0 .75rem}",
  ".ch-status__message{padding-block:.75rem;padding-inline:1rem;",
  "border-inline-start:3px solid var(--ch-status-brand);",
  "background:color-mix(in srgb,var(--ch-status-brand) 8%,transparent);border-radius:.25rem}",
  ".ch-status__until,.ch-status__ref{color:var(--ch-status-muted);font-size:.9375rem}",
  "code{font-family:ui-monospace,Menlo,monospace;font-size:.9em}",
  "footer{justify-self:center;margin-block-start:1.5rem;font-size:.8125rem;",
  "color:var(--ch-status-muted)}",
].join("");

/** The document for `doc`, as a string. */
export function statusDocument(doc: StatusDocument): string {
  const e = escapeHtml;
  const title = doc.siteName ? `${doc.words.title} · ${doc.siteName}` : doc.words.title;
  const parts = [
    "<!doctype html>",
    `<html lang="${e(doc.locale)}" dir="${doc.dir}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    doc.noindex ? '<meta name="robots" content="noindex">' : "",
    `<title>${e(title)}</title>`,
    `<style>${CSS}${themeCss(doc.theme)}${doc.css ?? ""}</style>`,
    "</head>",
    "<body>",
    `<main class="ch-status" data-state="${e(doc.state)}">`,
    doc.logo ? `<img class="ch-status__logo" src="${e(doc.logo)}" alt="">` : "",
    doc.siteName ? `<p class="ch-status__site">${e(doc.siteName)}</p>` : "",
    `<h1>${e(doc.words.title)}</h1>`,
    `<p>${e(doc.words.body)}</p>`,
    doc.message
      ? `<p class="ch-status__message" lang="${e(doc.message.locale)}" dir="${doc.message.dir}">${messageHtml(doc.message.text)}</p>`
      : "",
    doc.until ? `<p class="ch-status__until">${e(doc.until)}</p>` : "",
    doc.reference ? `<p class="ch-status__ref"><code>${e(doc.reference)}</code></p>` : "",
    "</main>",
    `<footer>${e(doc.words.builtWith)}</footer>`,
    "</body>",
    "</html>",
  ];
  return `${parts.filter(Boolean).join("\n")}\n`;
}
