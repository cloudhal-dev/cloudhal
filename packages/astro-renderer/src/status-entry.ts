/**
 * The Site Worker entry's status step and `error` page (RFC-0043 §1.2, §1.8, §2.5), apart from
 * `cloudflare-entry.ts` so unit tests run them: no bindings, no Astro, no `cloudflare:` imports.
 * Worker-safe.
 */
import type { Site } from "@cloudhal/core-contracts";
import type { SiteStateResult } from "./runtime-workerd.ts";
import { type StatusPageInput, statusPage, statusPlain } from "./status-page.ts";
import { statusInput, statusPathKind } from "./status-serve.ts";

/** A state the entry answers itself. */
export type StatusState = Exclude<SiteStateResult, { kind: "serve" }>;

type Log = (message: string, error?: unknown) => void;

/** §1.3: the `error` page's reference — Cloudflare's ray id, else a random one. */
export function referenceId(request: Request): string {
  return (
    request.headers.get("cf-ray") ??
    Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")
  );
}

export interface ErrorPageOptions {
  /** The site node this request already read (`loadedSite()`); never read here (§1.6). */
  readonly site?: Site | undefined;
  readonly log?: Log | undefined;
  readonly now?: number | undefined;
}

/**
 * The `error` page (§1.2): never the theme's hook, nothing read from the store. In the site's
 * locale and with its name when this request already read the site (§1.4, §1.6), else English.
 */
export function errorPage(
  request: Request,
  error: unknown,
  options: ErrorPageOptions = {},
): Response {
  const rayId = referenceId(request);
  (options.log ?? console.error)(`cloudhal: request failed (reference ${rayId})`, error);
  const now = options.now ?? Date.now();
  let input: StatusPageInput = { locale: "en", now };
  try {
    const url = new URL(request.url);
    input = statusInput(
      "error",
      { live: options.site },
      { host: url.host, pathname: url.pathname },
      now,
    );
  } catch {
    // a malformed site node: the English page without a name
  }
  return statusPage("error", { ...input, rayId }, { method: request.method });
}

/**
 * §1.8: Astro's own 500 HTML (a render that threw) becomes the `error` page. What the renderer
 * or the theme answered on purpose passes unchanged and logs nothing: a status page
 * (`x-cloudhal-state`, e.g. the starter's `not-published` 503 for a request that reaches Astro),
 * a theme's `500.astro` (`x-cloudhal-error-page: theme`) and any other 5xx.
 */
export function withErrorPage(
  response: Response,
  request: Request,
  options: ErrorPageOptions = {},
): Response {
  if (
    response.status !== 500 ||
    !(response.headers.get("content-type") ?? "").includes("text/html") ||
    response.headers.has("x-cloudhal-state") ||
    response.headers.get("x-cloudhal-error-page") === "theme"
  )
    return response;
  return errorPage(request, new Error("Astro answered 500"), options);
}

export interface StatusStepOptions {
  /** The request's verdict (the runtime's `siteState`); a throw is a store read failure. */
  readonly state: () => Promise<SiteStateResult>;
  /** Draws the status page for a page path (theme hook, render event). */
  readonly page: (state: StatusState) => Promise<Response>;
  readonly log?: Log | undefined;
  readonly now?: (() => number) | undefined;
}

/**
 * §2.5 step 6, for `GET`/`HEAD`: the status answer for this request, or `undefined` to serve the
 * site. Page paths get the page of every state. Machine paths (§2.3) get a short plain or JSON
 * answer for `preview-expired` (decision 12: never the published content) and `unavailable`;
 * before the first publish they keep the theme's own `statusPlain`. A store that cannot be read
 * is `unavailable` (503, `Retry-After: 300`), as `/__cloudhal/health` reports it.
 */
export async function statusStep(
  request: Request,
  options: StatusStepOptions,
): Promise<Response | undefined> {
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;
  const url = new URL(request.url);
  const kind = statusPathKind(url.pathname);
  if (!kind) return undefined;
  let state: SiteStateResult;
  try {
    state = await options.state();
  } catch (error) {
    (options.log ?? console.error)("cloudhal: the store could not be read before rendering", error);
    state = { kind: "unavailable" };
  }
  if (state.kind === "serve") return undefined;
  if (kind === "page") return options.page(state);
  if (state.kind === "not-published") return undefined;
  const sites =
    state.kind === "unavailable" ? {} : { live: state.site, published: state.published };
  const input = statusInput(
    state.kind,
    sites,
    { host: url.host, pathname: url.pathname },
    (options.now ?? Date.now)(),
  );
  const as = url.pathname.toLowerCase().endsWith(".json") ? "json" : "text";
  return statusPlain(state.kind, input, as, { method: request.method });
}
