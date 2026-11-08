/**
 * Status pages (RFC-0043 §1): the one page a site answers with when it cannot show its pages —
 * not published yet, in maintenance, unavailable, failed, or behind an expired preview link —
 * with the right status code, `Retry-After`, `no-store` and its own CSP. Pure and Worker-safe:
 * it imports only the catalog and the template, takes an injected clock, and never throws (a
 * broken input degrades to the English page). Where it is served: `cloudflare-entry.ts` before
 * Astro, `status-middleware.ts` in `cloudhal dev`, and the starter's routes as their fallback.
 */
import {
  messageHtml,
  type StatusDir,
  type StatusDocument,
  type StatusTheme,
  statusDocument,
} from "./status-html.ts";
import { STATUS_CATALOG } from "./status-strings/catalog.ts";
import type { StatusMessages } from "./status-strings/en.ts";

// The hook's types, so a theme imports everything from one subpath (§1.7).
export type { HookState, StatusContext, StatusPageHook } from "./status-hook.ts";
export type { StatusTheme } from "./status-html.ts";

export type SiteState =
  | "not-published"
  | "maintenance"
  | "unavailable"
  | "error"
  | "preview-expired";

export const SITE_STATES: readonly SiteState[] = [
  "not-published",
  "maintenance",
  "unavailable",
  "error",
  "preview-expired",
];

export const isSiteState = (value: string): value is SiteState =>
  (SITE_STATES as readonly string[]).includes(value);

export interface StatusPageInput {
  /** §1.6 decides what is passed per state; `logo` is a same-origin `/media/…` URL. */
  readonly site?: { readonly name: string; readonly logo?: string | undefined } | undefined;
  /** Already chosen (§1.4: host or path prefix, the site default, then English). */
  readonly locale: string;
  /** Maintenance wording (§2.1 `page`); `maintenance` when absent. */
  readonly page?: "maintenance" | "coming-soon" | undefined;
  /** Maintenance only: the owner's plain-text message and its language. */
  readonly message?: { readonly text: string; readonly locale: string } | undefined;
  /** Maintenance only: when it ends, for "Back by …" and `Retry-After`. */
  readonly until?: { readonly at: string; readonly timeZone?: string | undefined } | undefined;
  /** The published site's tokens (§1.3); the caller passes them only where the state allows. */
  readonly theme?: StatusTheme | undefined;
  /** `error` only: the request id a visitor can quote (`cf-ray`). */
  readonly rayId?: string | undefined;
  /** Injected clock (RFC-0008 §9.4). */
  readonly now: number;
}

/** The built-in page's own policy (§1.3): inline style, same-origin images, nothing else. */
export const STATUS_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** The built-in document never exceeds this (§1.3); a test draws every state in every language. */
export const STATUS_PAGE_LIMIT = 8192;

/** A theme hook's document may be this large before the built-in page is used instead (§1.7). */
export const HOOK_HTML_LIMIT = 65536;

const STATUS: Record<SiteState, 503 | 500 | 410> = {
  "not-published": 503,
  maintenance: 503,
  unavailable: 503,
  error: 500,
  "preview-expired": 410,
};

const NOINDEX: ReadonlySet<SiteState> = new Set(["not-published", "preview-expired"]);

/** RTL scripts by primary language subtag (CLDR), for locales the catalog does not list. */
const RTL = new Set(["ar", "fa", "he", "ur", "ps", "ckb", "dv", "yi", "ug", "sd", "ks", "ku"]);

export function statusCode(state: SiteState): 503 | 500 | 410 {
  return STATUS[state];
}

/** Delay-seconds (§1.2), or nothing for `error` and `preview-expired`. */
export function retryAfter(
  state: SiteState,
  input: Pick<StatusPageInput, "until" | "now">,
): string | undefined {
  if (state === "not-published") return "3600";
  if (state === "unavailable") return "300";
  if (state !== "maintenance") return undefined;
  const end = input.until ? Date.parse(input.until.at) : Number.NaN;
  if (!Number.isFinite(end)) return "3600";
  return String(Math.max(60, Math.ceil((end - input.now) / 1000)));
}

/**
 * The catalog locale for a site locale (§1.4): exact, then the primary language subtag
 * (`pt-PT` → `pt-BR`, `zh-HK` → `zh-Hans`), then English.
 */
export function catalogLocale(locale: string): string {
  if (Object.hasOwn(STATUS_CATALOG, locale)) return locale;
  const language = locale.toLowerCase().split("-")[0] ?? "";
  if (Object.hasOwn(STATUS_CATALOG, language)) return language;
  const same = Object.keys(STATUS_CATALOG).find((l) => l.split("-")[0]?.toLowerCase() === language);
  return same ?? "en";
}

/** `<html dir>` for a locale: the catalog's entry, else by script. */
export function statusDirection(locale: string): StatusDir {
  const entry = STATUS_CATALOG[catalogLocale(locale)];
  if (entry && catalogLocale(locale) !== "en") return entry.dir;
  if (locale === "en") return "ltr";
  const [language = "", script] = locale.toLowerCase().split("-");
  if (script === "latn" || script === "cyrl") return "ltr";
  return RTL.has(language) ? "rtl" : "ltr";
}

/** ICU simple arguments only (§1.5): `{name}` is replaced, anything else is left as it is. */
export function fillMessage(message: string, params: Readonly<Record<string, string>>): string {
  return message.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (all, name: string) =>
    Object.hasOwn(params, name) ? (params[name] as string) : all,
  );
}

function wordsOf(state: SiteState, page: StatusPageInput["page"], m: StatusMessages) {
  switch (state) {
    case "not-published":
      return m.notPublished;
    case "maintenance":
      return page === "coming-soon" ? m.comingSoon : m.maintenance;
    case "unavailable":
      return m.unavailable;
    case "error":
      return m.error;
    case "preview-expired":
      return m.previewExpired;
  }
}

/** "2 November, 11:00 GMT+3" in the page's locale and the site's zone (Western digits as Studio). */
function formatUntil(at: string, timeZone: string | undefined, intl: string): string | undefined {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return undefined;
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  };
  for (const zone of [timeZone, "UTC"]) {
    try {
      return new Intl.DateTimeFormat(intl, { ...options, timeZone: zone ?? "UTC" }).format(t);
    } catch {
      // an unknown zone: UTC next
    }
  }
  return undefined;
}

/** The words of a page in its language: what the theme hook gets as `strings` (§1.7). */
export interface StatusStrings {
  readonly locale: string;
  readonly dir: StatusDir;
  readonly title: string;
  readonly body: string;
  readonly builtWith: string;
  readonly untilText?: string | undefined;
  readonly referenceText?: string | undefined;
}

export function statusStrings(state: SiteState, input: StatusPageInput): StatusStrings {
  const locale = catalogLocale(input.locale);
  const entry = STATUS_CATALOG[locale] ?? (STATUS_CATALOG.en as (typeof STATUS_CATALOG)["en"]);
  const m = entry.messages;
  const words = wordsOf(state, input.page, m);
  const until =
    state === "maintenance" && input.until
      ? formatUntil(input.until.at, input.until.timeZone, entry.intl ?? locale)
      : undefined;
  return {
    locale,
    dir: entry.dir,
    title: words.title,
    body: words.body,
    builtWith: m.builtWith,
    ...(until ? { untilText: fillMessage(m.backBy, { time: until }) } : {}),
    ...(state === "error" && input.rayId
      ? { referenceText: fillMessage(m.reference, { reference: input.rayId }) }
      : {}),
  };
}

/** Only a same-origin media URL may be the logo (CSP `img-src 'self'`, §1.6). */
const sameOriginLogo = (src: string | undefined) =>
  src && /^\/media\/[^\s"'<>]+$/.test(src) ? src : undefined;

function documentOf(state: SiteState, input: StatusPageInput, css?: string): StatusDocument {
  const s = statusStrings(state, input);
  const message = state === "maintenance" ? input.message : undefined;
  return {
    state,
    locale: s.locale,
    dir: s.dir,
    noindex: NOINDEX.has(state),
    words: { title: s.title, body: s.body, builtWith: s.builtWith },
    siteName: state === "unavailable" ? undefined : input.site?.name,
    logo:
      state === "not-published" || state === "unavailable"
        ? undefined
        : sameOriginLogo(input.site?.logo),
    ...(message?.text.trim()
      ? {
          message: {
            text: message.text,
            locale: message.locale,
            dir: statusDirection(message.locale),
          },
        }
      : {}),
    until: s.untilText,
    reference: s.referenceText,
    theme: state === "maintenance" || state === "preview-expired" ? input.theme : undefined,
    css,
  };
}

const NEUTRAL: StatusPageInput = { locale: "en", now: 0 };

/** The same document as a string, for theme hooks that only restyle it (§1.7). Never throws. */
export function statusPageHtml(
  state: SiteState,
  input: StatusPageInput,
  options: { css?: string | undefined } = {},
): string {
  try {
    return statusDocument(documentOf(state, input, options.css));
  } catch {
    return statusDocument(documentOf(state, NEUTRAL));
  }
}

/** The headers every status response carries (§1.2), for an HTML page or a plain answer. */
export function statusHeaders(
  state: SiteState,
  input: Pick<StatusPageInput, "until" | "now">,
  contentType: string,
  csp: string = STATUS_CSP,
): Headers {
  const headers = new Headers({
    "content-type": contentType,
    "cache-control": "no-store",
    "cloudflare-cdn-cache-control": "no-store",
    "x-cloudhal-state": state,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  const retry = retryAfter(state, input);
  if (retry) headers.set("retry-after", retry);
  if (NOINDEX.has(state)) headers.set("x-robots-tag", "noindex");
  if (contentType.startsWith("text/html")) headers.set("content-security-policy", csp);
  return headers;
}

export interface StatusPageOptions {
  /** `HEAD` gets the headers without a body. */
  readonly method?: string | undefined;
  /**
   * A theme's own document (§1.7), already checked by the hook runner: it replaces the built-in
   * body and gets `csp` (the site's policy) instead of the built-in page's stricter one.
   */
  readonly html?: string | undefined;
  readonly csp?: string | undefined;
}

/** The built-in page: status, headers and body. Never throws. */
export function statusPage(
  state: SiteState,
  input: StatusPageInput,
  options: StatusPageOptions = {},
): Response {
  const html = options.html ?? statusPageHtml(state, input);
  const headers = statusHeaders(
    state,
    input,
    "text/html; charset=utf-8",
    options.html ? (options.csp ?? STATUS_CSP) : STATUS_CSP,
  );
  return new Response(options.method === "HEAD" ? null : html, {
    status: statusCode(state),
    headers,
  });
}

/** Machine endpoints in the same states (§2.3): short plain text or JSON, same status and headers. */
export function statusPlain(
  state: SiteState,
  input: StatusPageInput,
  as: "text" | "json",
  options: { method?: string | undefined } = {},
): Response {
  const s = statusStrings(state, input);
  const body =
    as === "json"
      ? JSON.stringify({ error: state, message: `${s.title}. ${s.body}` })
      : `${s.title}. ${s.body}\n`;
  const headers = statusHeaders(
    state,
    input,
    as === "json" ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
  );
  return new Response(options.method === "HEAD" ? null : body, {
    status: statusCode(state),
    headers,
  });
}

/** The owner's message as the hook sees it (`messageHtml`, §1.7). */
export { messageHtml } from "./status-html.ts";
