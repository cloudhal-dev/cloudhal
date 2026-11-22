/**
 * RFC-0047 §8: the Worker each socket serves first. The site and admin Workers count rate limits by
 * `CF-Connecting-IP`, as on Cloudflare, and workerd cannot pass a connection's address on, so:
 *
 * - any `CF-Connecting-IP` a request brings is removed, so no client chooses its own address;
 * - behind a proxy (`TRUST_PROXY`), it becomes the last `X-Forwarded-For` hop, the one the proxy
 *   in front appended (Caddy, nginx's `$proxy_add_x_forwarded_for`, ingress-nginx and Envoy do),
 *   as `cloudhal studio --behind-proxy` read it on Node (#165).
 *
 * Linear: one `lastIndexOf`, a length cap and a character check, no regular expression.
 */
export const FRONT_WORKER_SOURCE = `
const ALLOWED = "0123456789abcdefABCDEF.:[]";
function lastHop(value) {
  if (!value || value.length > 4096) return undefined;
  const hop = value.slice(value.lastIndexOf(",") + 1).trim();
  if (hop.length === 0 || hop.length > 64) return undefined;
  for (const c of hop) if (!ALLOWED.includes(c)) return undefined;
  return hop;
}
export default {
  fetch(request, env) {
    const headers = new Headers(request.headers);
    headers.delete("cf-connecting-ip");
    if (env.TRUST_PROXY) {
      const hop = lastHop(headers.get("x-forwarded-for"));
      if (hop) headers.set("cf-connecting-ip", hop);
    }
    return env.NEXT.fetch(new Request(request, { headers }));
  },
};
`;
