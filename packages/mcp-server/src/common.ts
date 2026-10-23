/**
 * What every tool module shares: the SDK-independent tool shape, the call context, `ToolError` and
 * the mapping of store errors to it (stable codes, actionable text), and small schema/prompt helpers.
 */
import {
  type ApprovalStore,
  type AuditLog,
  type CallClass,
  checkEntryLimit,
  type Decision,
  type OwnershipResolver,
  type OwnLimit,
  OwnLimitError,
  type PolicyEngine,
  type Principal,
  type Scope,
  type ToolAnnotations,
} from "@cloudhal/agent-runtime";
import type { AnalyticsService } from "@cloudhal/analytics/service";
import { CommentsError } from "@cloudhal/comments";
import type { Actor, ContentEntry, Page, Site, Snapshot } from "@cloudhal/core-contracts";
import type { InvariantCode, SiteGraphStore } from "@cloudhal/core-ts";
import {
  ConflictError,
  FilterError,
  InvariantError,
  NotFoundError,
  UniqueConstraintError,
} from "@cloudhal/core-ts";
import type { BodyDiff } from "@cloudhal/core-ts/body-blocks";
import type { FetchTransport } from "@cloudhal/core-ts/media";
import { ScheduleConflictError, ScheduleError } from "@cloudhal/schedules";
import type { CommentsDeps } from "./comments.ts";
import { fieldHint } from "./field-hints.ts";
import type { PageRenderer, RenderLimiter } from "./render.ts";
import { type RunContext, ScheduleRequestError, type SchedulesDeps } from "./schedules.ts";

export type JsonSchema = Record<string, unknown>;

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  annotations: ToolAnnotations;
  scopes: Scope[];
  /**
   * MCP Apps (RFC-0020 §6): the View a host shows with this tool's results
   * (`_meta.ui.resourceUri`); `visibility` defaults to the model and the View.
   */
  ui?: { readonly resourceUri: string; readonly visibility?: readonly ("model" | "app")[] };
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
  own?: "entry" | "changeset" | "comment" | "release";
  /**
   * Per-argument policy (RFC-0007 §10.2): `read`, `advisory`, `reduce` or `person`. `person`
   * calls wait for a person in every mode, `bypass` included.
   */
  classify?: (args: Record<string, unknown>) => CallClass | undefined;
  /** The scopes a `propose` call needs instead of `scopes` (ADR-0028). */
  proposeScopes?: Scope[];
  /** Scopes the person approving the call must also hold (person-only ones included). */
  approverScopes?: Scope[];
  /**
   * What the call would change, for a person deciding its approval request (RFC-0014 §5): Studio
   * lists it with the request. Computed against the current state when the request is listed.
   */
  changes?: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ApprovalChanges>;
  /**
   * What an approval of this call is bound to, instead of the site graph's `stateHash` (RFC-0007
   * §10.3): comment tools bind to the `cm1:` hash of the comments and threads they name.
   */
  bindState?: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
  /**
   * Approving a request for this tool in Studio runs it at once as the approving person
   * (RFC-0007 §10.3); the agent never redeems it.
   */
  carryOutOnApproval?: boolean;
  /**
   * RFC-0008 §10.4: the tool files its own approval request (a release bound to its `rl1:` hash,
   * open until the release's time) instead of the generic gate. When the decision for an agent is
   * `approval-required` and the server has out-of-band approvals — or `auto` mode offers the
   * low-risk path — the handler runs with `ctx.pending` set and answers `approval-pending` itself.
   */
  handlesApproval?: boolean;
  /**
   * The text content of a result (default: the result as JSON). Comment tools write reader text
   * inside labelled untrusted blocks (RFC-0007 §11.2).
   */
  renderText?: (result: unknown) => string;
  /**
   * Rich content for a result (RFC-0021 §4: `render_page`'s screenshots): the blocks a client
   * shows, and the structured result without the bytes. Takes precedence over `renderText`.
   */
  renderContent?: (result: unknown) => {
    content: ToolContent[];
    structured: Record<string, unknown>;
  };
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
  /**
   * What the audit log keeps of the arguments (default: all of them, truncated). `upload_asset`
   * replaces its base64 payload with its size, so file bytes never land in the audit table.
   */
  auditArgs?: (args: Record<string, unknown>) => Record<string, unknown>;
}

/** A content block of a tool result (the MCP shapes Cloudhal uses). */
export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

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

/** What `render_page` renders with (RFC-0021 §4). */
export interface RenderDeps {
  readonly renderer: PageRenderer;
  /** Defaults to one shared per process: 10 a minute per key, 200 a day per site. */
  readonly limiter?: RenderLimiter | undefined;
  /** Per call (default 20 s). */
  readonly timeoutMs?: number | undefined;
}

/**
 * Watches drafts being built (RFC-0020 §6): Studio's Build view follows a page while agents
 * change it. Called after a write succeeds, and when a build's operations are refused, so a
 * person sees the agent correct itself. Awaited through `notifyBuild`, which bounds and swallows
 * failures: watching never fails or slows a write noticeably.
 */
export interface BuildObserver {
  pageChanged(change: {
    readonly siteId: string;
    readonly page: Page;
    readonly tool: string;
    readonly actor: Actor;
    /** The operations applied (after repairs), when the change was a patch. */
    readonly ops?: readonly unknown[] | undefined;
    readonly repairs?: readonly string[] | undefined;
  }): void | Promise<void>;
  patchRejected(rejection: {
    readonly siteId: string;
    readonly pageId: string;
    readonly tool: string;
    readonly actor: Actor;
    readonly issues: readonly unknown[];
  }): void | Promise<void>;
}

/** Tells the Build view, waiting at most 2 s; a failure is logged, never thrown (RFC-0020 §6). */
export async function notifyBuild(report: () => void | Promise<void>): Promise<void> {
  try {
    const pending = report();
    if (!pending) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      pending,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 2_000);
      }),
    ]).finally(() => clearTimeout(timer));
  } catch (e) {
    console.warn(`cloudhal: build view not told: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export interface ToolContext {
  store: SiteGraphStore;
  /** Studio's Build view, when a server runs one (RFC-0020 §6). */
  build?: BuildObserver | undefined;
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
  /** Reader comments (RFC-0007): the comment tools answer `comments_disabled` without them. */
  comments?: CommentsDeps | undefined;
  /**
   * Set by `runTool`: a person said yes to this call in their own client (or a decided approval
   * is being carried out), so a `person`-class call may run.
   */
  confirmed?: boolean | undefined;
  /**
   * Set when Studio carries out an approved request (RFC-0007 §10.3): `principal` is the approving
   * person, `requestedBy` the agent that asked.
   */
  approval?: { readonly id: string; readonly requestedBy: Actor } | undefined;
  /** Schedules (RFC-0008): the schedule tools answer `schedules_disabled` without them. */
  schedules?: SchedulesDeps | undefined;
  /** A browser for `render_page` (RFC-0021 §4); without it the tool answers `render_unavailable`. */
  render?: RenderDeps | undefined;
  /** Set by the server for an automation key's call: its open run (RFC-0008 §11.2). */
  run?: RunContext | undefined;
  /**
   * Set by `runTool` for a `handlesApproval` tool whose decision waits for a person: the handler
   * files the request itself (or takes the `auto` low-risk path).
   */
  pending?: Extract<Decision, { kind: "approval-required" }> | undefined;
  /** Set by `runTool`: the policy engine (a run envelope lists the tools the run may call). */
  policy?: PolicyEngine | undefined;
  /** Set by `runTool`: the audit log (`get_run` lists a run's rows). */
  audit?: AuditLog | undefined;
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
  | "analytics_unavailable"
  | "comments_disabled"
  // RFC-0008: schedules and automation runs
  | "schedules_disabled"
  | "outside_run"
  | "tainted"
  | "no_egress_in_runs"
  | "budget_exceeded"
  | "run"
  // RFC-0021 §4: render_page
  | "render_unavailable"
  | "render_limited"
  | "render_failed";

/** What an approval request would change (RFC-0014 §5): a body, block by block. */
export interface ApprovalChanges {
  kind: "body";
  /** The article, or the page whose rich-text section `sectionId` it changes. */
  nodeId: string;
  sectionId?: string;
  title: string;
  diff: BodyDiff;
}

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
  const field = fieldHint(e.code, e.details);
  if (field) return field;
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
    case "locale_not_enabled":
      return "use one of the site's locales (get_site), or ask a person to add the language";
    case "translation_exists":
      return "that language already has a version in the group; update it instead";
    case "review_required":
      return "save it as a draft; a person reviews machine translations of this collection before they publish";
    case "host_taken":
      return "pick another hostname; this one already serves another site of the installation";
    case "collection_undeclared":
      return "call list_collections and use one of them, or create_collection first (a person approves it)";
    case "collection_in_use":
      return "the collection still has entries or a taxonomy names it; move or delete those first";
    case "collection_exists":
      return "the collection is already declared; change it with update_collection";
    case "invalid_surface":
      return "fix the parts named by the JSON Pointers in details.issues; get_catalog lists every component, its props and the binding rules";
    default:
      return undefined;
  }
}

/** Store errors as `ToolError`s with stable codes; anything else is returned unchanged. */
export function toToolError(e: unknown): unknown {
  if (e instanceof ToolError) return e;
  // Schedule errors (RFC-0008): a refused input keeps its code in the text and the details.
  if (e instanceof ScheduleError)
    return new ToolError(
      e.code === "not_found" ? "not_found" : "invalid",
      `${e.code}: ${e.message}`,
      {
        code: e.code,
      },
    );
  if (e instanceof ScheduleConflictError)
    return new ToolError(
      "conflict",
      `${e.message}; read it again (get_release) and pass the current rev`,
      { kind: e.kind, id: e.id },
    );
  if (e instanceof ScheduleRequestError) return new ToolError("invalid", e.message);
  // Comment store errors (RFC-0007): stable codes, the store's message says what to fix.
  if (e instanceof CommentsError)
    return new ToolError(
      e.code === "not_found"
        ? "not_found"
        : e.code === "conflict"
          ? "conflict"
          : e.code === "forbidden"
            ? "denied"
            : "invalid",
      e.message,
    );
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
