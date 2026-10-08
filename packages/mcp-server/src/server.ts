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
  type AgentMode,
  type ApprovalStore,
  type AuditLog,
  effectiveMode,
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
  /**
   * Out-of-band approvals (ADR-0014). When set, an agent principal's publish/rollback/delete waits
   * for a person to approve it in Studio — the agent's own MCP client never answers for a person.
   * Without it (local stdio), the approval question goes to the MCP client (elicitation).
   */
  approvals?: ApprovalStore | undefined;
  /**
   * Hand a `confirmToken` to clients that cannot elicit. Default false: the token reaches the
   * agent, so an agent could approve itself (security review H1). Local use only, opt-in.
   */
  confirmTokenFallback?: boolean | undefined;
  /** Clock for time-based answers (`get_mode`); tests inject one. */
  now?: (() => Date) | undefined;
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
  /** The site's content digest when the person was asked; a later change voids the approval. */
  state: string;
}

const REDEEM_MESSAGES: Record<string, string> = {
  "not-found": "unknown approvalId",
  pending: "still waiting for a person to approve it in Studio — try again later",
  denied: "a person denied this request; nothing changed",
  consumed: "this approval was already used; ask again",
  expired: "this approval expired; ask again",
  mismatch: "this approval was for a different call",
  "state-changed":
    "the site changed after the approval was requested; ask again so the person sees the current changes",
};

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

Workflow: list_sites → list_pages / list_entries → get_page / get_entry (note the \`rev\`) → update_* with that rev → preview_page → publish. Publishing, rollback and deletion stop for human approval. Either the person is asked in your MCP client and the call completes, or the call returns "approval pending" with an approvalId: a person approves it in Cloudhal Studio, and you then repeat the same call with that approvalId. Never try to work around approval.

Categories and tags: before you file an article, call list_taxonomies (which taxonomies are required, how many terms an article takes, who may add terms) and list_terms for each one (or resolve_terms for the names you have in mind). Reuse existing terms: set them on create_entry / update_entry with \`terms\`, e.g. {"category": {"primary": "News"}, "tag": {"add": ["AI"]}}; ids, slugs, names and synonyms all work, and nothing is ever created implicitly. Propose a new tag with propose_term only when no existing term fits; it stays private until a person approves it. Categories are added by people only: if none fits, say so and ask. A review or published article needs a primary term in every required taxonomy. Renaming, merging, retiring or moving terms, taxonomy settings and redirects (site paths only) always wait for a person; taxonomy_report suggests clean-ups to propose to them.

Modes: get_mode tells you how independently you work right now. If a task needs more autonomy for a while (e.g. publishing a series of small updates), call request_elevation with the mode, the minutes and a one-sentence reason; a person decides in Studio, and once granted your next call runs in that mode until the time is up. Ask only for what the task needs.

If you are following a Cloudhal skill (read it from the skill:// resources), send its name in the request \`_meta["cloudhal.skill"]\`; your calls are then limited to the scopes that skill declared.`;

const MODE_TEXT: Record<AgentMode, string> = {
  plan: "You are in PLAN mode: read and preview only. Do not try to change anything; describe the changes you would make so a person can decide.",
  manual:
    "You are in MANUAL mode: every change you make waits for a person's approval before it happens.",
  edits:
    "You are in EDITS mode: you may create and edit content freely (every change is snapshotted); publishing, rollback and deletions wait for a person.",
  auto: "You are in AUTO mode: content edits are free, and a publish that only adds or edits a few articles goes live without waiting; anything larger, rollback and deletions wait for a person.",
  bypass:
    "You are in BYPASS mode on a local project: nothing waits for approval. Be careful — this is the developer's own machine and data.",
};

function modeInstructions(principal: Principal): string {
  const mode = effectiveMode(principal);
  if (!mode) return "You are acting for a signed-in person.";
  const elevation = principal.elevation;
  if (!elevation) return MODE_TEXT[mode];
  // Time-boxed elevation (ADR-0016): say when it ends and what the agent falls back to.
  return `${MODE_TEXT[mode]}\nThis mode is temporary: a person granted it until ${elevation.until} (UTC). After that you work in ${elevation.from.toUpperCase()} mode again, so finish or hand over anything that depends on it before then.`;
}

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
  const fallback = options.confirmTokenFallback ?? false;
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
      instructions: `${INSTRUCTIONS}\n\n${modeInstructions(options.principal)}`,
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
    // Any tool that writes can need a person (manual mode makes every write gated).
    const inputSchema =
      gated(def) || (options.approvals && def.annotations.readOnlyHint !== true)
        ? {
            ...def.inputSchema,
            properties: {
              ...(def.inputSchema.properties as Record<string, unknown>),
              ...(options.approvals
                ? {
                    approvalId: {
                      type: "string",
                      pattern: "^appr_[A-Z0-9]{10,40}$",
                      description:
                        "After a person approved your earlier request in Studio: the approvalId it returned. Same arguments as that request.",
                    },
                  }
                : {}),
              ...(fallback
                ? {
                    confirmToken: {
                      type: "string",
                      description:
                        "Only after a person approved this exact call: the token the server handed back with the approval request.",
                    },
                  }
                : {}),
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
        const { confirmToken, approvalId, ...args } = rawArgs as Record<string, unknown> & {
          confirmToken?: unknown;
          approvalId?: unknown;
        };
        const principal = principalFor(ctx);
        if ("content" in principal) return principal;
        const argsHash = await sha256Hex(canonicalJson(args));
        const siteId = typeof args.siteId === "string" ? args.siteId : undefined;
        // Approvals are bound to the content the person saw, not just to the arguments.
        const stateHash =
          def.annotations.readOnlyHint !== true && siteId
            ? await options.store.stateHash(siteId)
            : "";
        const matches = (state: ApprovalState | undefined) =>
          state?.tool === def.name && state.args === argsHash && state.state === stateHash;

        // Round 2 of an approval: the client echoed our elicitation answer + signed state.
        let confirmed = false;
        const answer = inputResponse(ctx.mcpReq.inputResponses, "approval");
        if (answer.kind !== "missing") {
          if (answer.kind !== "elicit") return errorResult("unexpected input response kind");
          if (!matches(ctx.mcpReq.requestState<ApprovalState>()))
            return errorResult(
              "approval state does not match this call (different arguments, or the site changed meanwhile); start over",
            );
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
        } else if (approvalId !== undefined) {
          if (!options.approvals) return errorResult("approvalId is not accepted on this server");
          if (typeof approvalId !== "string") return errorResult("approvalId must be a string");
          const redeemed = await options.approvals.redeem(approvalId, {
            tool: def.name,
            argsHash,
            actorId: principal.actor.id,
            stateHash,
          });
          if (!redeemed.ok)
            return errorResult(`approval ${approvalId}: ${REDEEM_MESSAGES[redeemed.reason]}`);
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
          approvals: options.approvals,
          now: options.now,
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
          // Agents with their own credentials never answer for a person: the request waits in Studio.
          if (options.approvals && principal.actor.kind === "agent") {
            const pending = await options.approvals.request({
              siteId,
              tool: def.name,
              argsHash,
              input: args,
              actor: principal.actor,
              prompt,
              stateHash,
              mode: effectiveMode(principal),
              cause: outcome.decision.cause,
              ...(outcome.autoCheck ? { autoCheck: outcome.autoCheck } : {}),
            });
            return errorResult(
              `approval pending: ${prompt}\nA person must approve request ${pending.id} in Cloudhal Studio (site → Activity → Approvals). After it is approved, call ${def.name} again with the same arguments plus approvalId "${pending.id}". It expires ${pending.expiresAt}.\napprovalId: ${pending.id}`,
            );
          }
          const state = await codec.mint({ tool: def.name, args: argsHash, state: stateHash }, ctx);
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
