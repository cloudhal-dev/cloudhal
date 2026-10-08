/**
 * An agent asks for more autonomy (ADR-0016 addendum): `request_elevation` files a request that a
 * person grants or refuses in Studio; `get_mode` tells the agent where it stands. Neither changes
 * the site or the key — granting is a person's act, carried out by the API when they approve.
 */
import {
  type AgentMode,
  type Approval,
  ELEVATION_MAX_MINUTES,
  ELEVATION_MIN_MINUTES,
  ELEVATION_NOTICE_MINUTES,
  effectiveMode,
  elevationProblem,
  endsSoon,
  isAgentMode,
  isMoreAutonomous,
  minutesLeft,
  modeCap,
  REMOTE_AGENT_MODES,
} from "@cloudhal/agent-runtime";
import { canonicalJson, sha256Hex } from "@cloudhal/core-ts";
import { type JsonSchema, type ToolContext, type ToolDefinition, ToolError } from "./common.ts";

export const REQUEST_ELEVATION = "request_elevation";

const READ_ONLY = {
  // Nothing in the site or the key changes; a person decides in Studio.
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const REQUEST: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    status: { type: "string", enum: ["pending", "approved", "denied", "consumed", "expired"] },
    mode: { type: "string" },
    minutes: { type: "number" },
    reason: { type: "string" },
    granted: {
      type: "object",
      additionalProperties: false,
      properties: { minutes: { type: "number" }, until: { type: "string" } },
      required: ["minutes", "until"],
    },
    createdAt: { type: "string" },
    expiresAt: { type: "string" },
  },
  required: ["id", "status", "createdAt", "expiresAt"],
};

/** What a request looks like to the agent (status `consumed` = granted and applied). */
function requestView(a: Approval) {
  const input = (a.input ?? {}) as { mode?: unknown; minutes?: unknown; reason?: unknown };
  return {
    id: a.id,
    status: a.status,
    ...(typeof input.mode === "string" ? { mode: input.mode } : {}),
    ...(typeof input.minutes === "number" ? { minutes: input.minutes } : {}),
    ...(typeof input.reason === "string" ? { reason: input.reason } : {}),
    ...(a.grant ? { granted: { minutes: a.grant.minutes, until: a.grant.until } } : {}),
    createdAt: a.createdAt,
    expiresAt: a.expiresAt,
  };
}

/** The key's own mode: the elevation's starting point while one is in force. */
function ownMode(ctx: ToolContext): AgentMode {
  return ctx.principal.elevation?.from ?? effectiveMode(ctx.principal) ?? "edits";
}

/** Why this principal cannot ask for an elevation at all, if it cannot. */
function cannotRequest(ctx: ToolContext): string | undefined {
  if (ctx.principal.actor.kind !== "agent") return "only agents ask for an elevation";
  if (ctx.principal.local)
    return "this is a local server: restart `cloudhal mcp` with the --mode you need";
  if (!ctx.principal.keyId) return "elevations apply to API keys; this principal has none";
  if (!ctx.approvals) return "this server has no approvals, so nobody could grant it";
  return undefined;
}

/** Above the key creator's role cap (RFC-0005 §5.2: a Contributor's keys stop at `edits`). */
function aboveCap(ctx: ToolContext, mode: AgentMode): boolean {
  const role = ctx.principal.person?.role;
  return role !== undefined && isMoreAutonomous(mode, modeCap(role));
}

async function latestRequest(ctx: ToolContext): Promise<Approval | undefined> {
  const [latest] =
    (await ctx.approvals?.list({
      actorId: ctx.principal.actor.id,
      tool: REQUEST_ELEVATION,
      limit: 1,
    })) ?? [];
  return latest;
}

export function elevationTools(): ToolDefinition[] {
  return [
    {
      name: "get_mode",
      title: "Get my mode",
      description:
        "Your current mode, your key's own mode, any time-boxed elevation in force (and when it ends), and the status of your latest elevation request. Call it after request_elevation to see whether a person granted it.",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      outputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: { type: ["string", "null"] },
          ownMode: { type: ["string", "null"] },
          elevation: {
            type: "object",
            additionalProperties: false,
            properties: {
              from: { type: "string" },
              until: { type: "string" },
              minutesLeft: { type: "number" },
              endingSoon: {
                type: "boolean",
                description: `true in the last ${ELEVATION_NOTICE_MINUTES} minutes: finish or hand over what depends on this mode.`,
              },
            },
            required: ["from", "until", "minutesLeft", "endingSoon"],
          },
          canRequestElevation: { type: "boolean" },
          requestableModes: { type: "array", items: { type: "string" } },
          latestRequest: REQUEST,
          person: {
            type: "object",
            additionalProperties: false,
            description:
              "Whose key this is (RFC-0005): you never do more than this person's role allows.",
            properties: { role: { type: "string" }, name: { type: "string" } },
            required: ["role"],
          },
          scopes: {
            type: "array",
            items: { type: "string" },
            description: "Your effective scopes right now (narrowed to the person's role).",
          },
        },
        required: ["mode", "ownMode", "canRequestElevation", "requestableModes"],
      },
      annotations: { ...READ_ONLY, idempotentHint: true },
      scopes: [],
      handler: async (_a, ctx) => {
        const mode = effectiveMode(ctx.principal) ?? null;
        const person = ctx.principal.person;
        const who = {
          ...(person
            ? { person: { role: person.role, ...(person.name ? { name: person.name } : {}) } }
            : {}),
          scopes: [...ctx.principal.scopes],
        };
        if (mode === null)
          return { mode, ownMode: null, canRequestElevation: false, requestableModes: [], ...who };
        const own = ownMode(ctx);
        const at = ctx.now?.() ?? new Date();
        const latest = cannotRequest(ctx) ? undefined : await latestRequest(ctx);
        return {
          mode,
          ownMode: own,
          ...(ctx.principal.elevation
            ? {
                elevation: {
                  ...ctx.principal.elevation,
                  minutesLeft: minutesLeft(ctx.principal.elevation.until, at),
                  endingSoon: endsSoon(ctx.principal.elevation.until, at),
                },
              }
            : {}),
          canRequestElevation: cannotRequest(ctx) === undefined,
          requestableModes: REMOTE_AGENT_MODES.filter(
            (m) => isMoreAutonomous(m, own) && isMoreAutonomous(m, mode) && !aboveCap(ctx, m),
          ),
          ...(latest ? { latestRequest: requestView(latest) } : {}),
          ...who,
        };
      },
    },
    {
      name: REQUEST_ELEVATION,
      title: "Request a temporary elevation",
      description: `Ask a person for a more autonomous mode for a limited time (${ELEVATION_MIN_MINUTES}–${ELEVATION_MAX_MINUTES} minutes), e.g. AUTO for an hour to publish a series of small article updates. Explain why in \`reason\`; the person sees it in Cloudhal Studio (site → Activity → Approvals) and may grant it, shorten it or refuse. Nothing changes until then; check with get_mode. Ask only for what the task needs. One open request per key: asking again returns the pending one.`,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          siteId: {
            type: "string",
            pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$",
            description: "The site you are working on (its Studio shows the request).",
          },
          mode: {
            type: "string",
            enum: ["manual", "edits", "auto"],
            description: "The mode you need; must be more autonomous than your key's own mode.",
          },
          minutes: {
            type: "integer",
            minimum: ELEVATION_MIN_MINUTES,
            maximum: ELEVATION_MAX_MINUTES,
            description: "How long you need it.",
          },
          reason: {
            type: "string",
            minLength: 3,
            maxLength: 200,
            description: "Why, in one sentence a person can judge.",
          },
        },
        required: ["siteId", "mode", "minutes", "reason"],
      },
      outputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { request: REQUEST, message: { type: "string" } },
        required: ["request", "message"],
      },
      annotations: { ...READ_ONLY, idempotentHint: false },
      scopes: ["site:read"],
      handler: async (a, ctx) => {
        const blocked = cannotRequest(ctx);
        if (blocked) throw new ToolError("denied", blocked);
        const siteId = a.siteId as string;
        if (!(await ctx.store.getSite(siteId)))
          throw new ToolError("not_found", `site ${siteId} not found`);
        const mode = a.mode;
        if (!isAgentMode(mode)) throw new ToolError("invalid", "unknown mode");
        const minutes = a.minutes as number;
        const reason = String(a.reason).replace(/\s+/g, " ").trim().slice(0, 200);
        const own = ownMode(ctx);
        const problem = elevationProblem(own, mode, minutes);
        if (problem) throw new ToolError("invalid", problem);
        if (aboveCap(ctx, mode))
          throw new ToolError(
            "denied",
            `your key's person cannot hold ${mode.toUpperCase()} mode (their role caps keys at ${modeCap(ctx.principal.person?.role ?? "owner").toUpperCase()})`,
          );
        const current = effectiveMode(ctx.principal) ?? own;
        if (!isMoreAutonomous(mode, current))
          throw new ToolError(
            "invalid",
            `you already work in ${current.toUpperCase()} mode${ctx.principal.elevation ? ` until ${ctx.principal.elevation.until}` : ""}`,
          );

        const approvals = ctx.approvals as NonNullable<ToolContext["approvals"]>;
        const [open] = await approvals.list({
          actorId: ctx.principal.actor.id,
          tool: REQUEST_ELEVATION,
          status: "pending",
          limit: 5,
        });
        if (open && open.status === "pending")
          return {
            request: requestView(open),
            message: `You already have a pending request (${open.id}); a person decides it in Studio. Check with get_mode.`,
          };

        const input = { mode, minutes, reason, keyId: ctx.principal.keyId as string, ownMode: own };
        const name = ctx.principal.actor.name ?? ctx.principal.actor.id;
        const request = await approvals.request({
          siteId,
          tool: REQUEST_ELEVATION,
          argsHash: await sha256Hex(canonicalJson({ mode, minutes })),
          input,
          actor: ctx.principal.actor,
          prompt: `${name} asks to work in ${mode.toUpperCase()} mode for ${minutes} min (its own mode is ${own.toUpperCase()}): "${reason}"`,
          stateHash: "",
          mode: current,
          cause: "tool",
        });
        return {
          request: requestView(request),
          message: `Request ${request.id} is waiting for a person in Cloudhal Studio (site → Activity → Approvals). Nothing changes until it is granted; then your next call runs in ${mode.toUpperCase()} mode until the time is up. Check with get_mode. It expires ${request.expiresAt}.`,
        };
      },
    },
  ];
}
