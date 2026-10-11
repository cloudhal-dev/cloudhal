/**
 * What every tool module shares: the SDK-independent tool shape, the call context, `ToolError` and
 * the mapping of store errors to it (stable codes, actionable text), and small schema/prompt helpers.
 */
import {
  type ApprovalStore,
  checkEntryLimit,
  type OwnershipResolver,
  type OwnLimit,
  OwnLimitError,
  type Principal,
  type Scope,
  type ToolAnnotations,
} from "@cloudhal/agent-runtime";
import type { AnalyticsService } from "@cloudhal/analytics/service";
import type { ContentEntry, Site, Snapshot } from "@cloudhal/core-contracts";
import type { InvariantCode, SiteGraphStore } from "@cloudhal/core-ts";
import {
  ConflictError,
  FilterError,
  InvariantError,
  NotFoundError,
  UniqueConstraintError,
} from "@cloudhal/core-ts";
import type { FetchTransport } from "@cloudhal/core-ts/media";

export type JsonSchema = Record<string, unknown>;

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  annotations: ToolAnnotations;
  scopes: Scope[];
  requiresApproval?: boolean;
  /** Human-readable question shown in the approval gate. */
  approvalPrompt?: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
  /**
   * Agent-layer refusals (RFC-0002 §6.4: who may create terms, external redirect targets, approving
   * one's own proposal). Runs after the scope check and before anyone is asked to approve, so a call
   * that cannot succeed never waits for a person; a throw is audited as a denial.
   */
  precheck?: (args: Record<string, unknown>, ctx: ToolContext) => Promise<void>;
  /**
   * The own variants of the tool's scope satisfy it with a limit (RFC-0005 §9): `entry` — the
   * handler (and `precheck`) check the target with `entryLimitCheck`; `changeset` — `runTool`
   * checks that a publish is own-only.
   */
  own?: "entry" | "changeset";
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
  /**
   * What the audit log keeps of the arguments (default: all of them, truncated). `upload_asset`
   * replaces its base64 payload with its size, so file bytes never land in the audit table.
   */
  auditArgs?: (args: Record<string, unknown>) => Record<string, unknown>;
}

/** Media settings of a deployment for the asset tools (RFC-0004 §5.6–§5.7). */
export interface MediaToolOptions {
  /**
   * How `fetch_asset_url` reaches the network: `nodeTransport()` from `@cloudhal/core-ts/media-node`
   * on Node (resolves, checks and pins every address), `workersTransport()` (the default) on Workers.
   */
  fetchTransport?: FetchTransport | undefined;
  /** Hosts agents may fetch from, for every site (each site may add `cloudhal.media.allowHosts`). */
  allowHosts?: readonly string[] | undefined;
  /** This deployment's own hosts (Studio, admin API, workers.dev): never fetched. */
  blockedHosts?: readonly string[] | undefined;
  /** Per agent key per day (default 100 assets and 500 MB; audited as a denial when exceeded). */
  agentDailyAssets?: number | undefined;
  agentDailyBytes?: number | undefined;
}

export interface ToolContext {
  store: SiteGraphStore;
  principal: Principal;
  /** Out-of-band approvals (HTTP): where `request_elevation` files its request. */
  approvals?: ApprovalStore | undefined;
  /** Clock (tests); defaults to the system time. */
  now?: (() => Date) | undefined;
  /** Base URL of a running `cloudhal dev` server, when known (preview links). */
  previewBaseUrl?: string | undefined;
  /** Shared preview secret: signed links to the deployed site (preferred over `previewBaseUrl`). */
  previewSecret?: string | undefined;
  /**
   * Set by `runTool` for one call: what the call did beyond its arguments (assignment deltas, a
   * governance operation's id and counts). It lands in the audit row's `input.effect`.
   */
  report?: ((effect: Record<string, unknown>) => void) | undefined;
  /** Who owns what: the person behind an agent (RFC-0005 §4). */
  ownership?: OwnershipResolver | undefined;
  /** Set by `runTool`: the own limit this call runs under (absent = full scope). */
  limit?: OwnLimit | undefined;
  /** Media settings (fetch transport, host lists, daily limits). */
  media?: MediaToolOptions | undefined;
  /** Site analytics (RFC-0006): the analytics tools answer `analytics_disabled` without it. */
  analytics?: AnalyticsService | undefined;
}

/**
 * Without a membership source an agent owns what it wrote itself (local stdio with own-limited
 * scopes); people are themselves; the system owns nothing.
 */
export const ACTOR_OWNERSHIP: OwnershipResolver = {
  async personOf(actor) {
    return actor.kind === "system" ? undefined : actor.id;
  },
};

/** The person a call is measured against for "own" (RFC-0005 §4). */
export function callerPerson(ctx: ToolContext): string {
  return ctx.principal.person?.id ?? ctx.principal.actor.id;
}

/** Checks an entry write against the call's own limit (I9); refusals are `denied`. */
export async function entryLimitCheck(
  ctx: ToolContext,
  op: "create" | "update" | "delete",
  stored: ContentEntry | undefined,
  next?: Pick<ContentEntry, "author" | "status"> & { publishedAt?: string | undefined },
): Promise<void> {
  try {
    await checkEntryLimit({
      limit: ctx.limit,
      op,
      person: callerPerson(ctx),
      owner: ctx.ownership ?? ACTOR_OWNERSHIP,
      stored,
      next,
    });
  } catch (e) {
    if (e instanceof OwnLimitError) throw new ToolError("denied", e.message, { code: e.code });
    throw e;
  }
}

/** Stable error codes agents can branch on; the text says what to do next. */
export type ToolErrorCode =
  | "not_found"
  | "conflict"
  | "invalid"
  | "denied"
  | "approval_required"
  | InvariantCode
  | "unknown_taxonomy"
  | "unknown_term"
  | "ambiguous_term"
  | "invalid_filter"
  | "analytics_disabled"
  | "analytics_unavailable";

export class ToolError extends Error {
  override readonly name = "ToolError";
  readonly code: ToolErrorCode;
  /** Machine-readable context (suggestions, counts, ids). */
  readonly details: Readonly<Record<string, unknown>>;
  constructor(code: ToolErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export const id = { type: "string", pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$" };
export const SLUG_PATTERN = "^[a-z0-9]+(?:-[a-z0-9]+)*$";
export const str = (desc: string, extra: JsonSchema = {}) => ({
  type: "string",
  description: desc,
  ...extra,
});
export const obj = (
  properties: JsonSchema,
  required: string[] = [],
  extra: JsonSchema = {},
): JsonSchema => ({ type: "object", additionalProperties: false, properties, required, ...extra });
export const strip = (schema: unknown): JsonSchema => {
  const { $schema: _s, $id: _i, ...rest } = schema as JsonSchema;
  return rest;
};

/** Agent-controlled text in approval prompts is shortened and quoted so it cannot pose as UI. */
export function quote(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export async function requireSite(ctx: ToolContext, siteId: string): Promise<Site> {
  const site = await ctx.store.getSite(siteId);
  if (!site) throw new ToolError("not_found", `site ${siteId} not found`);
  return site;
}

export async function autoSnapshot(
  ctx: ToolContext,
  siteId: string,
  tool: string,
  metadata?: Record<string, string>,
): Promise<Snapshot> {
  return ctx.store.createSnapshot(siteId, {
    actor: ctx.principal.actor,
    reason: "agentMutation",
    label: `${tool} by ${ctx.principal.actor.name ?? ctx.principal.actor.id}`,
    ...(metadata ? { metadata } : {}),
  });
}

/** What to do next, per invariant (RFC-0002 §3). */
function invariantHint(e: InvariantError): string | undefined {
  const key = typeof e.details.taxonomy === "string" ? e.details.taxonomy : undefined;
  switch (e.code) {
    case "required_term":
      return key
        ? `this site requires a ${key} on review and published articles; call list_terms(taxonomy: "${key}") and set terms.${key}.primary`
        : "merge the term into another one (merge_terms) or reassign those articles first";
    case "primary_not_assigned":
      return "the primary term must be one of the assigned terms; set it with terms.<taxonomy>.primary (it is added for you)";
    case "invalid_assignment":
      return "call list_taxonomies for the keys and collections, and list_terms or resolve_terms for the terms";
    case "term_not_assignable":
      return "the term was retired or merged; call resolve_terms with its name to find the term that replaced it";
    case "too_many_terms":
      return "list_taxonomies shows each taxonomy's maxPerEntry; drop some with terms.<taxonomy>.remove";
    case "not_allowed":
      return "ask a person to add or review it in Cloudhal Studio, or reuse an existing term (list_terms)";
    case "slug_taken":
      return "reuse that term (resolve_terms) or choose another slug";
    case "invalid_labels":
      return "names and synonyms must not repeat another term's name, synonym or slug; reuse that term or pick another name";
    case "too_large":
      return typeof e.details.limit === "number"
        ? "use a smaller file; larger files are uploaded by a person in Studio"
        : "split the operation, or ask a person for the staged job";
    case "unknown_asset":
      return "call list_assets for this site's files, or add one with upload_asset or fetch_asset_url";
    case "retired_asset":
      return "pick another file (list_assets), or ask a person to restore this one";
    case "in_use":
      return "remove those uses first (update_entry, update_page), or retire the file instead";
    case "fetch_blocked":
      return "use a public https address of the file itself; internal hosts, IP addresses and redirects into them are refused";
    case "reserved_path":
      return "paths under /media/<16 hex digits>/ belong to media files";
    case "retry":
      return "call the tool again in a few seconds";
    default:
      return undefined;
  }
}

/** Store errors as `ToolError`s with stable codes; anything else is returned unchanged. */
export function toToolError(e: unknown): unknown {
  if (e instanceof ToolError) return e;
  if (e instanceof ConflictError) return new ToolError("conflict", e.message);
  if (e instanceof NotFoundError) return new ToolError("not_found", e.message);
  if (e instanceof UniqueConstraintError)
    return new ToolError(
      "conflict",
      e.kind === "contentEntry"
        ? `an article with this collection, locale and slug already exists (${e.key}); choose another slug`
        : `${e.kind} "${e.key}" already exists`,
    );
  if (e instanceof InvariantError) {
    const hint = invariantHint(e);
    return new ToolError(e.code, hint ? `${e.message}. ${hint}` : e.message, { ...e.details });
  }
  if (e instanceof FilterError) {
    if (e.code === "unknown_term")
      return new ToolError(
        "unknown_term",
        `${e.message}; call list_terms for the vocabulary (old slugs still match)`,
        { unknown: e.unknown },
      );
    if (e.code === "unknown_taxonomy") return new ToolError("unknown_taxonomy", e.message);
    return new ToolError(
      "invalid_filter",
      `${e.message} (grammar: clauses joined by "+", e.g. "category:news+tag:[ai,llm]+-tag:sponsored"; "primary:category:x"; "category:x>*" for sub-categories)`,
    );
  }
  return e;
}

export function mapError(e: unknown): never {
  throw toToolError(e);
}
