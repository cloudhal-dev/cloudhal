/**
 * Playground mode (RFC-0036 §5): a disposable, account-less Cloudhal per visitor. One pure guard
 * says which API routes a playground refuses; it runs in the playground Worker before forwarding
 * and again as API middleware. Under both sits the fixed principal's scope check (RFC-0005 I15).
 *
 * The guard is a deny list with an allow list beside it. Every route in `ROUTE_SCOPES` must be on
 * exactly one of them (`test/playground.test.ts` walks them all), and a route on neither is
 * refused as `unclassified`, so a new route is never silently open in a playground.
 */
import { type Principal, ROLE_SCOPES, type Scope } from "@cloudhal/agent-runtime";
import { createMiddleware } from "hono/factory";
import type { Env } from "./context.ts";
import { matchesRoute, routeFor } from "./scopes.ts";

export type PlaygroundBlock =
  | "auth"
  | "people"
  | "keys"
  | "mcp"
  | "uploads"
  | "outbound"
  | "transfer"
  | "sites"
  | "domains"
  | "agent"
  | "schedules"
  | "unclassified";

/** What Studio needs to show the session bar (`InstanceInfo.features.playground`). */
export interface PlaygroundInfo {
  /** When the session's data is deleted (ISO 8601). */
  expiresAt: string;
  /** `POST` here deletes the session at once; the next request starts a fresh one. */
  resetUrl: string;
  /** Where "Deploy to Cloudflare" leads. */
  deployUrl: string;
}

export interface PlaygroundOptions {
  /** The session's current info; read on every `/api/instance`. */
  info(): PlaygroundInfo | Promise<PlaygroundInfo>;
  /** Largest request body the API accepts, in bytes (RFC-0036 §7: 200 KB per entry or section). */
  maxBodyBytes?: number;
}

export const PLAYGROUND_MAX_BODY_BYTES = 200_000;

const S = "/api/sites/:siteId";

/** Refused in a playground: `[method or ALL, pattern, why]`. Patterns use `ROUTE_SCOPES` syntax. */
const DENY: readonly (readonly [string, string, PlaygroundBlock])[] = [
  ["ALL", "/api/auth/*", "auth"],
  ["ALL", "/api/password-reset/*", "auth"],
  ["ALL", "/api/members", "people"],
  ["ALL", "/api/members/*", "people"],
  ["ALL", "/api/invites", "people"],
  ["ALL", "/api/invites/*", "people"],
  ["ALL", "/api/agent-keys", "keys"],
  ["ALL", "/api/agent-keys/*", "keys"],
  ["ALL", "/mcp", "mcp"],
  ["ALL", `${S}/approvals`, "agent"],
  ["ALL", `${S}/approvals/*`, "agent"],
  ["ALL", `${S}/ai/*`, "agent"],
  ["GET", `${S}/pages/:pageId/build/events`, "agent"],
  // Uploads and every change to the media library: a session's media are the read-only demo
  // pack (no bytes enter a session, RFC-0036 §2 invariant 5).
  ["ALL", `${S}/assets/uploads`, "uploads"],
  ["ALL", `${S}/assets/uploads/*`, "uploads"],
  ["PUT", `${S}/assets/:assetId`, "uploads"],
  ["DELETE", `${S}/assets/:assetId`, "uploads"],
  ["POST", `${S}/assets/:assetId/*`, "uploads"],
  ["POST", `${S}/media/:sha256/lift-purge`, "uploads"],
  // Bundles, media moves, site create and delete, domains, search reindex: the operator's routes.
  ["PUT", "/api/admin/sites/:siteId/domains", "domains"],
  ["ALL", "/api/admin/*", "transfer"],
  ["POST", "/api/sites", "sites"],
  // A signed preview link would show a session's work outside it (share links: RFC-0036 phase 5).
  ["POST", `${S}/preview-links`, "outbound"],
  ["ALL", `${S}/analytics/*`, "outbound"],
  ["ALL", `${S}/comments`, "outbound"],
  ["ALL", `${S}/comments/*`, "outbound"],
  ["ALL", `${S}/comment-threads/*`, "outbound"],
  ["ALL", `${S}/commenters/*`, "outbound"],
  ["ALL", `${S}/comment-bans`, "outbound"],
  ["ALL", `${S}/comment-bans/*`, "outbound"],
  // Releases and automations need a ticker and may call out; a one-hour session has neither.
  ["ALL", "/api/scheduler", "schedules"],
  ["ALL", `${S}/schedule`, "schedules"],
  ["ALL", `${S}/schedule-settings`, "schedules"],
  ["ALL", `${S}/releases`, "schedules"],
  ["ALL", `${S}/releases/*`, "schedules"],
  ["ALL", `${S}/gates`, "schedules"],
  ["ALL", `${S}/gates/*`, "schedules"],
  ["ALL", `${S}/automations`, "schedules"],
  ["ALL", `${S}/automations/*`, "schedules"],
  ["ALL", `${S}/runs`, "schedules"],
  ["ALL", `${S}/runs/*`, "schedules"],
];

/** Open in a playground: content, structure, design, snapshots, publish, search, previews. */
export const PLAYGROUND_ALLOW: ReadonlySet<string> = new Set([
  "GET /api/health",
  "GET /api/me",
  "GET /api/instance",
  "GET /api/skills",
  "GET /api/notifications",
  "GET /api/activity",
  "GET /api/sites",
  "GET /api/projects",
  `GET ${S}`,
  `PUT ${S}`,
  `GET ${S}/pages`,
  `POST ${S}/pages`,
  `GET ${S}/pages/:pageId/preview`,
  `POST ${S}/pages/:pageId/preview`,
  `GET ${S}/pages/:pageId`,
  `PUT ${S}/pages/:pageId`,
  `DELETE ${S}/pages/:pageId`,
  `PATCH ${S}/pages/:pageId/sections/:sectionId/body`,
  `GET ${S}/entries`,
  `POST ${S}/entries`,
  `GET ${S}/entries/:entryId/preview`,
  `POST ${S}/entries/:entryId/preview`,
  `POST ${S}/entries/preview-fragment`,
  `GET ${S}/entries/:entryId`,
  `PUT ${S}/entries/:entryId`,
  `DELETE ${S}/entries/:entryId`,
  `PATCH ${S}/entries/:entryId/body`,
  `GET ${S}/proposals`,
  `POST ${S}/proposals/:proposalId/preview`,
  `POST ${S}/proposals/:proposalId/accept`,
  `POST ${S}/proposals/:proposalId/reject`,
  `GET ${S}/block-types`,
  `GET ${S}/theme-settings`,
  `PUT ${S}/theme-settings`,
  `GET ${S}/chrome`,
  `PUT ${S}/chrome`,
  `GET ${S}/design`,
  `PUT ${S}/design`,
  `GET ${S}/snapshots`,
  `POST ${S}/snapshots`,
  `GET ${S}/snapshots/:snapshotId`,
  `GET ${S}/snapshots/:snapshotId/diff/:otherId`,
  `GET ${S}/snapshots/:snapshotId/nodes/:nodeId`,
  `POST ${S}/snapshots/:snapshotId/publish`,
  `POST ${S}/snapshots/:snapshotId/rollback`,
  `GET ${S}/activity`,
  `GET ${S}/taxonomies`,
  `POST ${S}/taxonomies`,
  `GET ${S}/taxonomies/:taxonomyId`,
  `PUT ${S}/taxonomies/:taxonomyId`,
  `GET ${S}/terms`,
  `POST ${S}/terms`,
  `GET ${S}/terms/:termId/preview`,
  `POST ${S}/terms/:termId/preview`,
  `GET ${S}/terms/:termId`,
  `PUT ${S}/terms/:termId`,
  `POST ${S}/terms/:termId/rename`,
  `POST ${S}/terms/:termId/merge`,
  `POST ${S}/terms/:termId/retire`,
  `POST ${S}/terms/:termId/parent`,
  `POST ${S}/terms/:termId/visibility`,
  `POST ${S}/terms/:termId/review`,
  `GET ${S}/search`,
  `GET ${S}/translations`,
  `GET ${S}/translations/:nodeId`,
  `POST ${S}/translations/:nodeId/review`,
  `GET ${S}/glossary`,
  `PUT ${S}/glossary`,
  `GET ${S}/redirects`,
  `POST ${S}/redirects`,
  `GET ${S}/redirects/:redirectId`,
  `PUT ${S}/redirects/:redirectId`,
  `DELETE ${S}/redirects/:redirectId`,
  `GET ${S}/menus`,
  `POST ${S}/menus`,
  `POST ${S}/menus/from-pages`,
  `POST ${S}/menus/preview`,
  `GET ${S}/menus/references`,
  `GET ${S}/menus/:menuId`,
  `PUT ${S}/menus/:menuId`,
  `DELETE ${S}/menus/:menuId`,
  `GET ${S}/menus/:menuId/resolve`,
  `POST ${S}/menus/:menuId/ops`,
  `GET ${S}/assets`,
  `GET ${S}/assets/:assetId`,
  `GET ${S}/assets/:assetId/content`,
  `POST ${S}/migrations/tags-to-terms`,
  `POST ${S}/migrations/tags-to-terms/revert`,
]);

/** The deny rule a declared route falls under, if any. */
export function playgroundDenyRule(method: string, pattern: string): PlaygroundBlock | undefined {
  for (const [m, rule, block] of DENY)
    if ((m === "ALL" || method === "ALL" || m === method) && matchesRoute(rule, pattern))
      return block;
  return undefined;
}

/**
 * Why `method path` is refused in playground mode, or undefined when it is allowed. Only API
 * paths (`/api/*`, `/mcp`) are judged; anything else (Studio, the rendered site) is not the API's.
 */
export function isBlockedInPlayground(method: string, path: string): PlaygroundBlock | undefined {
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/mcp" || clean.startsWith("/mcp/")) return "mcp";
  if (!clean.startsWith("/api/")) return undefined;
  const m = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase();
  // Prefix rules first, so an undeclared path under a blocked area names its area.
  const route = routeFor(m, clean);
  const pattern = route?.[1] ?? clean;
  const denied = playgroundDenyRule(route?.[0] ?? m, pattern);
  if (denied) return denied;
  if (route && PLAYGROUND_ALLOW.has(`${route[0]} ${route[1]}`)) return undefined;
  return "unclassified";
}

/**
 * The one principal of a playground session (RFC-0036 §5): an Editor with site settings, and
 * nothing installation-wide. It also lacks the Editor's media, person-only and outward scopes
 * (`asset:manage` implies `asset:upload`; inviting, commenter data, automations), so a route the
 * guard missed still fails the scope check.
 */
const EDITOR_DROPPED: readonly Scope[] = [
  "asset:manage",
  "members:invite",
  "commenters:data",
  "automations:manage",
];
export const PLAYGROUND_SCOPES: readonly Scope[] = [
  ...ROLE_SCOPES.editor.filter((s) => !EDITOR_DROPPED.includes(s)),
  "site:settings",
];

export const PLAYGROUND_PRINCIPAL: Principal = {
  actor: { kind: "human", id: "user_playground", name: "Playground Owner" },
  scopes: [...PLAYGROUND_SCOPES],
  person: { id: "user_playground", userId: "playground", role: "editor", name: "Playground Owner" },
};

/** API middleware: refuses blocked routes with `403 {error: "playground"}` and oversized bodies. */
export function playgroundGuard(options: PlaygroundOptions) {
  const max = options.maxBodyBytes ?? PLAYGROUND_MAX_BODY_BYTES;
  return createMiddleware<Env>(async (c, next) => {
    const block = isBlockedInPlayground(c.req.method, c.req.path);
    if (block)
      return c.json(
        {
          error: "playground",
          block,
          message: "This is not available in the playground. It works in your own install.",
        },
        403,
      );
    const length = Number(c.req.header("content-length") ?? 0);
    if (
      length > max ||
      (c.req.method !== "GET" && c.req.method !== "HEAD" && (await tooLarge(c.req.raw, max)))
    )
      return c.json(
        { error: "payload_too_large", message: `request bodies are limited to ${max} bytes here` },
        413,
      );
    await next();
  });
}

/** Without a content-length header, measure a clone of the body. */
async function tooLarge(req: Request, max: number): Promise<boolean> {
  if (req.headers.has("content-length") || !req.body) return false;
  const bytes = await req.clone().arrayBuffer();
  return bytes.byteLength > max;
}
