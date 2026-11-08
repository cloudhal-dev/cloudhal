/**
 * The theme hook for status pages (RFC-0043 §1.7): a theme may export `statusPage(state, ctx)`
 * from `src/theme.ts` and return its own document. The renderer keeps the status code, the
 * headers and the CSP (invariant 9); the built-in page is used when the hook returns
 * `undefined`, throws, answers with something other than a string, exceeds 64 KB, or takes more
 * than 50 ms — logged once per state and isolate — and always for `error`, which must not depend
 * on code that may be the cause. Worker-safe.
 */
import { SITE_CSP } from "./csp.ts";
import { messageHtml, type StatusDir } from "./status-html.ts";
import {
  HOOK_HTML_LIMIT,
  type SiteState,
  type StatusPageInput,
  type StatusStrings,
  statusCode,
  statusPage,
  statusPageHtml,
  statusStrings,
} from "./status-page.ts";

/** The states a theme may draw. */
export type HookState = Exclude<SiteState, "error">;

export interface StatusContext extends StatusPageInput {
  readonly status: 503 | 410;
  readonly dir: StatusDir;
  /** The built-in words, already in the page's locale. */
  readonly strings: StatusStrings;
  /** The owner's message, escaped, line breaks as `<br>` (never use `message.text` raw). */
  readonly messageHtml?: string | undefined;
  /** "Back by …", formatted. */
  readonly untilText?: string | undefined;
  /** The built-in document, with extra CSS appended. */
  defaultHtml(options?: { css?: string | undefined }): string;
}

export type StatusPageHook = (
  state: HookState,
  ctx: StatusContext,
) => string | undefined | Promise<string | undefined>;

/** How long a hook may take before the built-in page answers instead. */
export const HOOK_TIMEOUT_MS = 50;

const failed = new Set<string>();

/** Loads `src/theme.ts` lazily (the integration's `virtual:cloudhal/theme-hooks`) and memoises the hook. */
export function themeStatusHook(
  loadTheme: () => Promise<unknown>,
  onError: (message: string, error: unknown) => void = () => {},
): () => Promise<StatusPageHook | undefined> {
  let pending: Promise<StatusPageHook | undefined> | undefined;
  return () => {
    pending ??= loadTheme().then(
      (mod) => {
        const hook = (mod as { statusPage?: unknown } | null)?.statusPage;
        return typeof hook === "function" ? (hook as StatusPageHook) : undefined;
      },
      (error: unknown) => {
        onError("cloudhal: the theme module could not be loaded for the status page", error);
        return undefined;
      },
    );
    return pending;
  };
}

export interface RenderStatusOptions {
  readonly hook?: StatusPageHook | undefined;
  readonly method?: string | undefined;
  readonly onFailure?: ((message: string, error?: unknown) => void) | undefined;
  /** The site's policy for a theme's document (default `SITE_CSP`). */
  readonly csp?: string | undefined;
  /** Test hook: the hook's time budget. */
  readonly timeoutMs?: number | undefined;
}

/** Runs the hook within its budget; `undefined` means the built-in page. */
async function hookHtml(
  state: HookState,
  input: StatusPageInput,
  hook: StatusPageHook,
  options: RenderStatusOptions,
): Promise<string | undefined> {
  const strings = statusStrings(state, input);
  const ctx: StatusContext = {
    ...input,
    status: statusCode(state) as 503 | 410,
    dir: strings.dir,
    strings,
    ...(input.message && state === "maintenance"
      ? { messageHtml: messageHtml(input.message.text) }
      : {}),
    untilText: strings.untilText,
    defaultHtml: (o = {}) => statusPageHtml(state, input, o),
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`took more than ${options.timeoutMs ?? HOOK_TIMEOUT_MS} ms`)),
      options.timeoutMs ?? HOOK_TIMEOUT_MS,
    );
  });
  try {
    const result = await Promise.race([Promise.resolve().then(() => hook(state, ctx)), timeout]);
    if (result === undefined) return undefined;
    if (typeof result !== "string") throw new Error("returned something other than a string");
    if (result.length > HOOK_HTML_LIMIT)
      throw new Error(`returned more than ${HOOK_HTML_LIMIT} bytes`);
    return result;
  } catch (error) {
    if (!failed.has(state)) {
      failed.add(state);
      options.onFailure?.(`cloudhal: the theme's statusPage hook failed for ${state}`, error);
    }
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Test hook: forget which states' hook failures were logged. */
export function resetHookFailures(): void {
  failed.clear();
}

/** The status response for `state`: the theme's document when the hook gives one, else the built-in page. */
export async function renderStatus(
  state: SiteState,
  input: StatusPageInput,
  options: RenderStatusOptions = {},
): Promise<Response> {
  if (state === "error" || !options.hook)
    return statusPage(state, input, { method: options.method });
  const html = await hookHtml(state, input, options.hook, options);
  return statusPage(state, input, {
    method: options.method,
    ...(html !== undefined ? { html, csp: options.csp ?? SITE_CSP } : {}),
  });
}
