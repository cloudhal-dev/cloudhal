/**
 * `/mcp` (ADR-0011): the API resolves the caller, then hands the request and its `Principal` to
 * the stateless MCP handler. With `McpMountOptions.oauth` (RFC-0044 §1) the route also speaks
 * OAuth discovery: the challenge on 401, the protected resource metadata, the step-up 403.
 */
import type { OwnershipResolver } from "@cloudhal/agent-runtime";
import { createCloudhalMcpHandler } from "@cloudhal/mcp-server/http";
import type { Hono } from "hono";
import type { BuildHub } from "./build.ts";
import type { ApiDeps, Env } from "./context.ts";
import { unauthorized } from "./errors.ts";
import {
  mountProtectedResourceMetadata,
  stepUpChallenge,
  unauthorizedChallenge,
} from "./mcp-oauth.ts";

export interface McpMountParts {
  readonly build: BuildHub;
  readonly ownership: OwnershipResolver;
  readonly schedules: ApiDeps["schedules"];
}

export function mountMcp(
  app: Hono<Env>,
  deps: ApiDeps & { readonly mcp: NonNullable<ApiDeps["mcp"]> },
  parts: McpMountParts,
): void {
  const mcp = createCloudhalMcpHandler({
    store: deps.store,
    build: parts.build,
    ...deps.mcp,
    previewSecret: deps.mcp.previewSecret ?? deps.preview?.secret,
    now: deps.now,
    ownership: parts.ownership,
    analytics: deps.analytics,
    comments: deps.comments,
    schedules: parts.schedules,
  });
  const oauth = deps.mcp.oauth;
  if (oauth) mountProtectedResourceMetadata(app, oauth);
  app.all("/mcp", async (c) => {
    // DNS-rebinding / cross-site protection: browsers send Origin; it must be this origin.
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin)
      return c.json(
        { error: "forbidden", message: "cross-origin MCP requests are not allowed" },
        403,
      );
    const principal = c.get("principal");
    if (!principal) {
      if (oauth) return unauthorizedChallenge(oauth, c.req.raw);
      throw unauthorized();
    }
    // A signed-in person without a membership has no scopes; refuse rather than list tools.
    if (deps.staff && principal.actor.kind === "human" && !principal.person)
      return c.json(
        { error: "not_a_member", message: "Your access was removed. Ask an administrator." },
        403,
      );
    if (oauth) {
      const stepUp = await stepUpChallenge(c.req.raw, principal, c.get("policy")(), oauth);
      if (stepUp) return stepUp;
    }
    return mcp.fetch(c.req.raw, principal);
  });
}
