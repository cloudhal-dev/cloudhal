/**
 * The Site Worker entry's status step, `error` page, health endpoint and the answer when the
 * hostname cannot be mapped to a site (RFC-0043 §1.2, §1.8, §1.9, §2.5), apart from
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
 * §1.8: Astro's own 500 (a render that threw) becomes the `error` page — HTML, or Astro's empty
 * fallback (`new Response(null, { status: 500 })` when no `500.astro` renders: the starter's
 * catch-all route matches `/500` and throws again). What the renderer or the theme answered on
 * purpose passes unchanged and logs nothing: a status page (`x-cloudhal-state`, e.g. the
 * starter's `not-published` 503 for a request that reaches Astro), a theme's `500.astro`
 * (`x-cloudhal-error-page: theme`), a 500 with an explicit non-HTML type, and any other 5xx.
 */
export function withErrorPage(
  response: Response,
  request: Request,
  options: ErrorPageOptions = {},
): Response {
  const type = response.headers.get("content-type") ?? "";
  if (
    response.status !== 500 ||
    (type !== "" && !type.includes("text/html")) ||
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

export const HEALTH_PATH = "/__cloudhal/health";

const HEALTH_HEADERS = {
  "cache-control": "no-store",
  "cloudflare-cdn-cache-control": "no-store",
  "x-robots-tag": "noindex",
} as const;

/** §1.9: the store cannot be read, so the site is down for monitors. */
function healthDown(): Response {
  return Response.json({ ok: false }, { status: 503, headers: HEALTH_HEADERS });
}

/**
 * §1.9: `{ ok, state }`, the admin's `/api/health` shape plus the site's state, so one monitor
 * rule reads both. Public, never cached, never indexed; reads only the memoised pointer.
 */
export async function health(
  request: Request,
  state: () => Promise<SiteStateResult>,
  log: Log = console.error,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD")
    return Response.json(
      { error: "method_not_allowed" },
      { status: 405, headers: { ...HEALTH_HEADERS, allow: "GET" } },
    );
  try {
    const result = await state();
    if (result.kind === "unavailable") return healthDown();
    return Response.json(
      { ok: true, state: result.kind === "not-published" ? "not-published" : "published" },
      { headers: HEALTH_HEADERS },
    );
  } catch (error) {
    log("cloudhal: health check could not read the store", error);
    return healthDown();
  }
}

/**
 * RFC-0034 §4 with §1.2: on a multi-site Worker the hostname map could not be read (the store
 * failed past the map's TTL), so no site is known. Treated as a store failure, never as `error`:
 * health answers `503 { ok: false }`; `GET`/`HEAD` page paths the `unavailable` page and machine
 * paths its plain answer (503, `Retry-After: 300`, English, no site name); anything else a
 * plain 503.
 */
export async function hostLookupFailed(
  request: Request,
  error: unknown,
  options: Pick<StatusStepOptions, "page" | "log" | "now">,
): Promise<Response> {
  (options.log ?? console.error)("cloudhal: the site's hostnames could not be read", error);
  if (new URL(request.url).pathname === HEALTH_PATH) return healthDown();
  const answer = await statusStep(request, {
    state: () => Promise.reject(error),
    page: options.page,
    log: () => {},
    now: options.now,
  });
  const input = { locale: "en", now: (options.now ?? Date.now)() };
  return answer ?? statusPlain("unavailable", input, "text", { method: request.method });
}
