/**
 * `cloudhal dev` sends the deployed site's policy as `Content-Security-Policy-Report-Only` on
 * HTML pages that set none of their own: the browser (and `render_page`) reports what the Site
 * Worker's `SITE_CSP` would block, an inline theme script say, without breaking Vite's dev client.
 */
import { SITE_CSP } from "./csp.ts";

interface MiddlewareContext {
  request: Request;
}

export async function onRequest(
  _context: MiddlewareContext,
  next: () => Promise<Response>,
): Promise<Response> {
  const response = await next();
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;
  if (response.headers.has("content-security-policy")) return response;
  if (response.headers.has("content-security-policy-report-only")) return response;
  try {
    response.headers.set("content-security-policy-report-only", SITE_CSP);
    return response;
  } catch {
    // Immutable headers (a fetched response): copy them.
    const headers = new Headers(response.headers);
    headers.set("content-security-policy-report-only", SITE_CSP);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
