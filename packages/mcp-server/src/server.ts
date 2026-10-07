/**
 * The Cloudhal MCP server (ADR-0004, ADR-0011): one `McpServer` per principal, built from the
 * SDK-independent tool definitions in `tools.ts`. It adds what the protocol needs on top of the
 * policy engine:
 *
 * - **Approval gate** — when policy answers `approval-required`, the call returns MCP's
 *   multi-round-trip `input_required` with an elicitation ("Publish X to production?"). The human
 *   answers in their client; the client retries with `inputResponses` and the HMAC-signed
 *   `requestState`, and only then does the handler run. Clients without elicitation get a
 *   `confirmToken` to pass on a second call (ADR-0004 fallback; can be disabled).
 * - **Skills as resources** — `skill://<name>/SKILL.md` and `skill://<name>/references/<file>`.
 * - **Skill-scoped calls** — a client declares the skill it is following via
 *   `_meta["cloudhal.skill"]`; the policy engine then limits the call to that skill's scopes.
 * - **Audit** — every decision and call is recorded (see `runTool`).
 */
import {
  type AuditLog,
  type LoadedSkill,
  PolicyEngine,
  type Principal,
} from "@cloudhal/agent-runtime";
import type { SiteGraphStore } from "@cloudhal/core-ts";
import { canonicalJson, sha256Hex } from "@cloudhal/core-ts";
import {
  acceptedContent,
  type CallToolResult,
  CLIENT_CAPABILITIES_META_KEY,
  type ClientCapabilities,
  createRequestStateCodec,
  type ElicitRequestFormParams,
  fromJsonSchema,
  type InputRequiredResult,
  inputRequired,
  inputResponse,
  McpServer,
  ResourceTemplate,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { defineTools, runTool, type ToolDefinition, ToolError, toolPolicies } from "./tools.ts";

export interface CloudhalMcpOptions {
  store: SiteGraphStore;
  /** Who this server instance acts for. One instance per principal (per request over HTTP). */
  principal: Principal;
  audit?: AuditLog | undefined;
  skills?: LoadedSkill[] | undefined;
  /** Base URL of a running `cloudhal dev`, used for `preview_page.url`. */
  previewBaseUrl?: string | undefined;
  /** Preview secret shared with the deployed site: `preview_page.url` becomes a signed link. */
  previewSecret?: string | undefined;
  /**
   * HMAC key (≥ 32 bytes) for the approval state. Every instance that may receive a retried round
   * must share it: a random per-process key is fine for stdio, a configured secret for HTTP.
   */
  stateKey: Uint8Array | string;
  /** Offer a `confirmToken` to clients that cannot elicit. Default true (ADR-0004). */
  confirmTokenFallback?: boolean | undefined;
  /** Approval tokens/state expire after this many seconds. Default 600. */
  approvalTtlSeconds?: number | undefined;
  tools?: ToolDefinition[] | undefined;
  policy?: PolicyEngine | undefined;
  serverInfo?: { name?: string; version?: string } | undefined;
}

interface ApprovalState {
  tool: string;
  /** sha256 of the canonical arguments, so an approval cannot be replayed for other arguments. */
  args: string;
}

export const SKILL_META_KEY = "cloudhal.skill";

const APPROVAL_SCHEMA: ElicitRequestFormParams["requestedSchema"] = {
  type: "object",
  properties: {
    confirm: {
      type: "boolean",
      title: "Approve",
      description: "true to let the action run, false to stop here",
    },
  },
  required: ["confirm"],
};

const INSTRUCTIONS = `Cloudhal: agent-native sites. Content lives in a site graph (site → pages with sections, content entries such as articles); every mutation you make is snapshotted automatically and can be diffed or rolled back.

Workflow: list_sites → list_pages / list_entries → get_page / get_entry (note the \`rev\`) → update_* with that rev → preview_page → publish. Publishing, rollback and deletion stop for human approval: the call returns an approval request; the person answers in their client and the call completes. Never try to work around approval.

If you are following a Cloudhal skill (read it from the skill:// resources), send its name in the request \`_meta["cloudhal.skill"]\`; your calls are then limited to the scopes that skill declared.`;

function errorResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function okResult(result: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    structuredContent: result as Record<string, unknown>,
  };
}

/** Builds a Cloudhal MCP server for one principal. */
export function createCloudhalMcpServer(options: CloudhalMcpOptions): McpServer {
  const tools = options.tools ?? defineTools();
  const policy = options.policy ?? new PolicyEngine(toolPolicies(tools));
  const skills = new Map((options.skills ?? []).map((s) => [s.manifest.name, s]));
  const fallback = options.confirmTokenFallback ?? true;
  const codec = createRequestStateCodec<ApprovalState>({
    key: options.stateKey,
    ttlSeconds: options.approvalTtlSeconds ?? 600,
    bind: () => `cloudhal.approval\0${options.principal.actor.id}`,
  });

  const server = new McpServer(
    {
      name: options.serverInfo?.name ?? "cloudhal",
      version: options.serverInfo?.version ?? "0.0.1",
      title: "Cloudhal",
      websiteUrl: "https://github.com/cloudhal-dev/cloudhal",
    },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: INSTRUCTIONS,
      requestState: { verify: codec.verify },
    },
  );

  const principalFor = (ctx: ServerContext): Principal | CallToolResult => {
    const meta = ctx.mcpReq._meta as Record<string, unknown> | undefined;
    const skillName = meta?.[SKILL_META_KEY];
    if (skillName === undefined) return options.principal;
    if (typeof skillName !== "string")
      return errorResult(`_meta["${SKILL_META_KEY}"] must be a string`);
    const skill = skills.get(skillName);
    if (!skill)
      return errorResult(
        `unknown skill "${skillName}"; read skill:// resources for the available ones`,
      );
    return {
      ...options.principal,
      skill: {
        name: skill.manifest.name,
        scopes: skill.cloudhal.scopes,
        approval: skill.cloudhal.approval,
      },
    };
  };

  const gated = (def: ToolDefinition) =>
    def.requiresApproval || def.annotations.destructiveHint === true;

  for (const def of tools) {
    const inputSchema = gated(def)
      ? {
          ...def.inputSchema,
          properties: {
            ...(def.inputSchema.properties as Record<string, unknown>),
            confirmToken: {
              type: "string",
              description:
                "Only after a person approved this exact call out of band: the token the server handed back with the approval request.",
            },
          },
        }
      : def.inputSchema;

    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: fromJsonSchema<Record<string, unknown>>(
          inputSchema as Parameters<typeof fromJsonSchema>[0],
        ),
        outputSchema: fromJsonSchema<Record<string, unknown>>(
          def.outputSchema as Parameters<typeof fromJsonSchema>[0],
        ),
        annotations: { ...def.annotations, title: def.title },
      },
      async (rawArgs, ctx): Promise<CallToolResult | InputRequiredResult> => {
        const { confirmToken, ...args } = rawArgs as Record<string, unknown> & {
          confirmToken?: unknown;
        };
        const principal = principalFor(ctx);
        if ("content" in principal) return principal;
        const argsHash = await sha256Hex(canonicalJson(args));
        const matches = (state: ApprovalState | undefined) =>
          state?.tool === def.name && state.args === argsHash;

        // Round 2 of an approval: the client echoed our elicitation answer + signed state.
        let confirmed = false;
        const answer = inputResponse(ctx.mcpReq.inputResponses, "approval");
        if (answer.kind !== "missing") {
          if (answer.kind !== "elicit") return errorResult("unexpected input response kind");
          if (!matches(ctx.mcpReq.requestState<ApprovalState>()))
            return errorResult("approval state does not match this call; start over");
          const content = acceptedContent<{ confirm?: unknown }>(
            ctx.mcpReq.inputResponses,
            "approval",
          );
          if (answer.action !== "accept" || content?.confirm !== true) {
            await options.audit?.record({
              at: new Date().toISOString(),
              actor: principal.actor,
              siteId: typeof args.siteId === "string" ? args.siteId : undefined,
              tool: def.name,
              decision: "deny",
              reason:
                answer.action === "accept" ? "approval refused" : `approval ${answer.action}d`,
              skill: principal.skill?.name,
              input: args,
              outcome: "error",
            });
            return errorResult(`${def.name} was not approved; nothing changed.`);
          }
          confirmed = true;
        } else if (confirmToken !== undefined) {
          if (!fallback) return errorResult("confirmToken is not accepted on this server");
          if (typeof confirmToken !== "string") return errorResult("confirmToken must be a string");
          let state: ApprovalState | undefined;
          try {
            state = await codec.verify(confirmToken, ctx);
          } catch {
            state = undefined;
          }
          if (!matches(state))
            return errorResult(
              "invalid, expired or mismatched confirmToken; ask for approval again",
            );
          confirmed = true;
        }

        const toolCtx = {
          store: options.store,
          principal,
          previewBaseUrl: options.previewBaseUrl,
          previewSecret: options.previewSecret,
        };
        let outcome: Awaited<ReturnType<typeof runTool>>;
        try {
          outcome = await runTool(def, args, toolCtx, { policy, audit: options.audit, confirmed });
        } catch (e) {
          if (e instanceof ToolError) return errorResult(`${e.code}: ${e.message}`);
          throw e;
        }
        if (outcome.decision.kind === "deny")
          return errorResult(`denied: ${outcome.decision.reason}`);
        if (outcome.decision.kind === "approval-required") {
          const prompt = outcome.approvalPrompt ?? outcome.decision.reason;
          const state = await codec.mint({ tool: def.name, args: argsHash }, ctx);
          // 2026-07-28 requests carry the client's capabilities in their _meta envelope (stateless
          // HTTP); 2025-era connections declared them at initialize.
          const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
          const caps =
            (envelope?.[CLIENT_CAPABILITIES_META_KEY] as ClientCapabilities | undefined) ??
            server.server.getClientCapabilities();
          if (caps?.elicitation) {
            return inputRequired({
              inputRequests: {
                approval: inputRequired.elicit({
                  message: prompt,
                  requestedSchema: APPROVAL_SCHEMA,
                }),
              },
              requestState: state,
            });
          }
          if (!fallback)
            return errorResult(
              `approval required: ${prompt}\nThis client cannot collect approval (no elicitation support).`,
            );
          return errorResult(
            `approval required: ${prompt}\nAsk the person. If (and only if) they approve, call ${def.name} again with the same arguments plus confirmToken: "${state}" (valid ${Math.round((options.approvalTtlSeconds ?? 600) / 60)} minutes).`,
          );
        }
        return okResult(outcome.result);
      },
    );
  }

  for (const skill of skills.values()) {
    const name = skill.manifest.name;
    server.registerResource(
      `skill:${name}`,
      `skill://${name}/SKILL.md`,
      {
        title: name,
        description: skill.manifest.description,
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: await skill.source() }],
      }),
    );
  }
  if (skills.size > 0) {
    server.registerResource(
      "skill-reference",
      new ResourceTemplate("skill://{name}/references/{file}", {
        list: async () => ({
          resources: (
            await Promise.all(
              [...skills.values()].map(async (s) =>
                (
                  await s.references()
                ).map((file) => ({
                  uri: `skill://${s.manifest.name}/references/${file}`,
                  name: `${s.manifest.name}/references/${file}`,
                  mimeType: "text/markdown",
                })),
              ),
            )
          ).flat(),
        }),
      }),
      {
        title: "Skill reference",
        description: "Supporting notes for a skill",
        mimeType: "text/markdown",
      },
      async (uri, variables) => {
        const skill = skills.get(String(variables.name));
        if (!skill) throw new Error(`unknown skill ${String(variables.name)}`);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: await skill.reference(String(variables.file)),
            },
          ],
        };
      },
    );
  }

  return server;
}
