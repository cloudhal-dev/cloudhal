/**
 * `@cloudhal/cloudflare/playground` (RFC-0036): the single Worker of a public playground. Every
 * visitor gets a disposable Cloudhal in their own `PlaygroundSite` Durable Object; this Worker only
 * serves static files (landing page, Studio, site assets), issues and checks the session cookie,
 * applies `isBlockedInPlayground`, the rate limits, the daily cap and the kill switch, and forwards.
 *
 * ```ts
 * const playground = createPlaygroundWorker({ seed, render, deployUrl });
 * export const PlaygroundSite = playground.PlaygroundSite;
 * export default playground.worker;
 * ```
 */
import { isBlockedInPlayground } from "@cloudhal/api";
import {
  DEFAULT_PLAYGROUND_LIMITS,
  type PlaygroundEnv,
  type PlaygroundLimits,
  type PlaygroundOptions,
  RESET_PATH,
  SESSION_HEADER,
  SESSION_PATH,
  SITE_PREFIX,
} from "./playground-options.ts";
import {
  newSessionId,
  readSessionCookie,
  sessionCookie,
  sessionTime,
  signSession,
  verifySession,
} from "./playground-session.ts";
import { type PlaygroundSiteClass, playgroundSiteClass } from "./playground-site.ts";

export * from "./playground-options.ts";
export { prefixPath } from "./playground-render.ts";
export { newSessionId, sessionTime, signSession, verifySession } from "./playground-session.ts";
export type { PlaygroundSiteClass } from "./playground-site.ts";

const MINUTE = 60_000;
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

/** Paths that belong to a session's Durable Object. */
function isSessionPath(path: string): boolean {
  return (
    path.startsWith("/api/") ||
    path === "/mcp" ||
    path.startsWith("/mcp/") ||
    path.startsWith(SITE_PREFIX) ||
    path.startsWith("/media/") ||
    path === RESET_PATH
  );
}

export interface PlaygroundWorker {
  worker: { fetch(request: Request, env: PlaygroundEnv): Promise<Response> };
  PlaygroundSite: PlaygroundSiteClass;
}

export function createPlaygroundWorker(options: PlaygroundOptions): PlaygroundWorker {
  const limits: PlaygroundLimits = { ...DEFAULT_PLAYGROUND_LIMITS, ...options.limits };
  const landingPath = options.landingPath ?? "/landing/";

  const landing = (request: Request, env: PlaygroundEnv, status = 200) =>
    env.ASSETS.fetch(
      new Request(new URL(landingPath, request.url), { headers: request.headers }),
    ).then((res) =>
      status === 200 ? res : new Response(res.body, { status, headers: res.headers }),
    );

  /** The verified, unexpired session of a request. */
  async function sessionOf(request: Request, env: PlaygroundEnv): Promise<string | undefined> {
    const value = readSessionCookie(request);
    if (!value || !env.PLAYGROUND_SECRET) return undefined;
    const id = await verifySession(value, env.PLAYGROUND_SECRET);
    const created = id ? sessionTime(id) : undefined;
    if (!id || created === undefined) return undefined;
    const now = Date.now();
    if (created > now + MINUTE || now >= created + limits.maxMinutes * MINUTE) return undefined;
    return id;
  }

  async function createSession(request: Request, env: PlaygroundEnv): Promise<Response> {
    const secret = env.PLAYGROUND_SECRET;
    if (!secret || secret.length < 32) return landing(request, env, 503);
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    if (env.SESSION_LIMIT && !(await env.SESSION_LIMIT.limit({ key: ip })).success) {
      if (!(await passedTurnstile(request, env, ip)))
        return json(429, {
          error: "rate_limited",
          message: "Too many new sessions. Try again in a minute.",
          ...(env.TURNSTILE_SITE_KEY ? { turnstile: env.TURNSTILE_SITE_KEY } : {}),
        });
    }
    const cap = Number(env.PLAYGROUND_DAILY_SESSIONS ?? 0);
    if (cap > 0) {
      const day = new Date().toISOString().slice(0, 10);
      const counter = env.PLAYGROUND.get(env.PLAYGROUND.idFromName(`daily:${day}`));
      const { count } = (await (await counter.fetch("https://playground/_count")).json()) as {
        count: number;
      };
      if (count > cap) return landing(request, env, 503);
    }
    const id = newSessionId(Date.now());
    const cookie = sessionCookie(await signSession(id, secret), limits.maxMinutes * 60);
    return new Response(null, {
      status: 303,
      headers: { location: "/sites", "set-cookie": cookie },
    });
  }

  async function forward(request: Request, env: PlaygroundEnv, id: string, path: string) {
    if (path.startsWith(SITE_PREFIX) && path.split("/")[2] !== id)
      return json(404, { error: "not_found" });
    const block = isBlockedInPlayground(request.method, path);
    if (block)
      return json(403, {
        error: "playground",
        block,
        message: "This is not available in the playground. It works in your own install.",
      });
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > limits.maxRequestBytes) return json(413, { error: "payload_too_large" });
    const write = request.method !== "GET" && request.method !== "HEAD";
    if (write && env.WRITE_LIMIT && !(await env.WRITE_LIMIT.limit({ key: id })).success)
      return json(429, { error: "rate_limited", message: "Slow down a little." });
    const headers = new Headers(request.headers);
    headers.set(SESSION_HEADER, id);
    const stub = env.PLAYGROUND.get(env.PLAYGROUND.idFromName(id));
    return stub.fetch(new Request(request, { headers }));
  }

  const worker = {
    async fetch(request: Request, env: PlaygroundEnv): Promise<Response> {
      const url = new URL(request.url);
      const path = url.pathname;
      // Never trust a client's own session header.
      if (request.headers.has(SESSION_HEADER)) {
        const headers = new Headers(request.headers);
        headers.delete(SESSION_HEADER);
        request = new Request(request, { headers });
      }
      const enabled = env.PLAYGROUND_ENABLED !== "false" && Boolean(env.PLAYGROUND_SECRET);
      if (path === SESSION_PATH && request.method === "POST")
        return enabled ? createSession(request, env) : landing(request, env, 503);
      if (isSessionPath(path)) {
        if (!enabled) return json(503, { error: "playground_closed" });
        const id = await sessionOf(request, env);
        if (!id)
          return path.startsWith("/api/") || path === "/mcp" || path === RESET_PATH
            ? json(410, { error: "playground_expired", message: "This session has ended." })
            : Response.redirect(new URL("/", url).href, 303);
        if (path === RESET_PATH && request.method !== "POST") return json(405, { error: "method" });
        return forward(request, env, id, path);
      }
      // Static files. "/" is the landing page unless the visitor has a session (then Studio).
      if (path === "/" && (!enabled || !(await sessionOf(request, env))))
        return landing(request, env);
      return env.ASSETS.fetch(request);
    },
  };

  return { worker, PlaygroundSite: playgroundSiteClass(options) };
}

/** After a rate-limit hit, a valid Turnstile token (form field or header) lets one session through. */
async function passedTurnstile(request: Request, env: PlaygroundEnv, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return false;
  let token = request.headers.get("cf-turnstile-response");
  if (!token && request.headers.get("content-type")?.includes("form")) {
    const form = await request.clone().formData();
    token = String(form.get("cf-turnstile-response") ?? "");
  }
  if (!token) return false;
  const body = new FormData();
  body.set("secret", env.TURNSTILE_SECRET);
  body.set("response", token);
  body.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  return ((await res.json()) as { success?: boolean }).success === true;
}
