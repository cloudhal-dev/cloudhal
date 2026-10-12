/**
 * HTTP transport (web-standard `fetch`): stateless, one server instance per request, so it runs
 * unchanged on Node (behind the Hono API) and on Cloudflare Workers. The caller authenticates the
 * request and hands over the resolved `Principal`; this module never reads credentials itself.
 */
import type {
  ApprovalStore,
  AuditLog,
  LoadedSkill,
  OwnershipResolver,
  Principal,
} from "@cloudhal/agent-runtime";
import type { AnalyticsService } from "@cloudhal/analytics/service";
import type { SiteGraphStore } from "@cloudhal/core-ts";
import { createMcpHandler, type McpHttpHandler } from "@modelcontextprotocol/server";
import type { CommentsDeps } from "./comments.ts";
import type { MediaToolOptions } from "./common.ts";
import { createCloudhalMcpServer } from "./server.ts";

export interface HttpOptions {
  store: SiteGraphStore;
  /** Clock for time-based answers (`get_mode`); tests inject one. */
  now?: (() => Date) | undefined;
  audit?: AuditLog | undefined;
  skills?: LoadedSkill[] | undefined;
  previewBaseUrl?: string | undefined;
  previewSecret?: string | undefined;
  /** Media settings for the asset tools (RFC-0004). */
  media?: MediaToolOptions | undefined;
  /** Site analytics for the read-only analytics tools (RFC-0006 §9.3). */
  analytics?: AnalyticsService | undefined;
  /** Reader comments for the comment tools (RFC-0007 §11). */
  comments?: CommentsDeps | undefined;
  /** Shared secret (≥ 32 bytes) so approval state survives across instances/requests. */
  stateKey: Uint8Array | string;
  confirmTokenFallback?: boolean | undefined;
  /** Out-of-band approvals: agents' gated calls wait for a person in Studio (ADR-0014). */
  approvals?: ApprovalStore | undefined;
  /** Who owns what: the person behind an agent's key (RFC-0005 §4). */
  ownership?: OwnershipResolver | undefined;
  /** `"reject"` refuses 2025-era clients (strict, ADR-0004); default serves them statelessly. */
  legacy?: "stateless" | "reject" | undefined;
  onerror?: ((error: Error) => void) | undefined;
}

export interface CloudhalMcpHttp {
  /** Serves one MCP request for an already-authenticated principal. */
  fetch(request: Request, principal: Principal): Promise<Response>;
  close(): Promise<void>;
}

export function createCloudhalMcpHandler(options: HttpOptions): CloudhalMcpHttp {
  const handler: McpHttpHandler = createMcpHandler(
    (ctx) => {
      const principal = ctx.authInfo?.extra?.principal as Principal | undefined;
      if (!principal) throw new Error("mcp handler called without a principal");
      return createCloudhalMcpServer({
        store: options.store,
        principal,
        audit: options.audit,
        skills: options.skills,
        previewBaseUrl: options.previewBaseUrl,
        previewSecret: options.previewSecret,
        media: options.media,
        analytics: options.analytics,
        comments: options.comments,
        now: options.now,
        stateKey: options.stateKey,
        confirmTokenFallback: options.confirmTokenFallback,
        approvals: options.approvals,
        ownership: options.ownership,
      });
    },
    {
      ...(options.legacy ? { legacy: options.legacy } : {}),
      ...(options.onerror ? { onerror: options.onerror } : {}),
    },
  );
  return {
    fetch: (request, principal) =>
      handler.fetch(request, {
        authInfo: {
          token: "",
          clientId: principal.actor.id,
          scopes: principal.scopes,
          extra: { principal },
        },
      }),
    close: () => handler.close(),
  };
}
