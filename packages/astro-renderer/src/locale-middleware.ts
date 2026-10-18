/**
 * RFC-0033 §4: a localized page's internal links lead to the same locale. The page route puts a
 * localizer on `locals.cloudhalLinks` (`linkLocalizer`); this middleware rewrites the HTML it
 * rendered (`localizeLinks`). Starters export it as their `src/middleware.ts`.
 */
import { localizeLinks } from "./locales.ts";

interface MiddlewareContext {
  locals: object;
}

export async function onRequest(
  context: MiddlewareContext,
  next: () => Promise<Response>,
): Promise<Response> {
  const response = await next();
  const localize = (context.locals as { cloudhalLinks?: (path: string) => string }).cloudhalLinks;
  if (!localize || !response.headers.get("content-type")?.includes("text/html")) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(localizeLinks(await response.text(), localize), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
