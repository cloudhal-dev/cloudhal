/**
 * Workers Cache keys by path, not hostname, and answers before the Worker runs (#62). Every host
 * routed to the site Worker — a custom domain, its workers.dev name, a redirect host (#49), the
 * other sites of a multi-site Worker (RFC-0034) — would otherwise share one entry per path. `Vary:
 * Host` makes it keep one variant per host.
 *
 * Worker-safe: no imports.
 */
export function varyByHost(response: Response): Response {
  const vary = response.headers.get("vary") ?? "";
  if (vary.trim() === "*" || /(^|,)\s*host\s*(,|$)/i.test(vary)) return response;
  // A redirect's or a WebSocket's headers can be immutable; copy them into a fresh response.
  const headers = new Headers(response.headers);
  headers.set("vary", vary.trim() ? `${vary}, Host` : "Host");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
