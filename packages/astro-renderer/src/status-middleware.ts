/**
 * Dev middleware (added by the `cloudhal()` integration for Node targets, RFC-0043 §1.8):
 * `cloudhal dev` renders the working copy, drafts included, so it never answers a real page with
 * a status page. For parity it draws each page on demand, through the same module and the
 * project's theme hook, at `/__cloudhal/status/<state>` (`?locale=tr`, `?page=coming-soon`,
 * `?message=…`, `?until=<RFC 3339>`), so a theme author can see and screenshot their override.
 */
import config from "virtual:cloudhal/config";
import { loadTheme } from "virtual:cloudhal/theme-hooks";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import { renderStatus, themeStatusHook } from "./status-hook.ts";
import { isSiteState, type StatusPageInput } from "./status-page.ts";
import { statusInput } from "./status-serve.ts";

interface MiddlewareContext {
  request: Request;
}

export const STATUS_PREVIEW_PATH = /^\/__cloudhal\/status\/([a-z-]+)\/?$/;

const hook = themeStatusHook(loadTheme, (m, e) => console.error(m, e));

export async function onRequest(
  context: MiddlewareContext,
  next: () => Promise<Response>,
): Promise<Response> {
  const url = new URL(context.request.url);
  const m = STATUS_PREVIEW_PATH.exec(url.pathname);
  if (!m) return next();
  const state = m[1] as string;
  if (!isSiteState(state))
    return new Response(`unknown state "${state}"`, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  const site = await (await getSource(config)).site();
  const now = Date.now();
  // Dev shows the working copy: the live node stands in for the published one here.
  const base = statusInput(
    state,
    { live: site, published: site },
    { host: url.host, pathname: "/" },
    now,
  );
  const locale = url.searchParams.get("locale");
  const message = url.searchParams.get("message");
  const until = url.searchParams.get("until");
  const input: StatusPageInput = {
    ...base,
    ...(locale ? { locale } : {}),
    page: url.searchParams.get("page") === "coming-soon" ? "coming-soon" : "maintenance",
    ...(message ? { message: { text: message, locale: locale ?? site.defaultLocale } } : {}),
    ...(until ? { until: { at: until, timeZone: site.timeZone } } : {}),
    ...(state === "error" ? { rayId: "dev-preview" } : {}),
  };
  return renderStatus(state, input, {
    hook: await hook(),
    method: context.request.method,
    onFailure: (msg, e) => console.error(msg, e),
  });
}
