/**
 * Agent modes (ADR-0015): how independently an agent works, chosen per API key by its owner —
 * the same idea as an IDE agent's permission modes. A mode never grants scopes; it narrows what
 * the key's scopes allow and decides where a person must approve.
 */
import type { Scope } from "./policy.ts";

export type AgentMode = "plan" | "manual" | "edits" | "auto" | "bypass";

/** In order of increasing autonomy. */
export const AGENT_MODES: readonly AgentMode[] = ["plan", "manual", "edits", "auto", "bypass"];

/** What existing keys and new keys without a choice get. */
export const DEFAULT_AGENT_MODE: AgentMode = "edits";

/** Modes a remote (HTTP, API key) agent may hold. `bypass` is for local stdio only. */
export const REMOTE_AGENT_MODES: readonly AgentMode[] = ["plan", "manual", "edits", "auto"];

export function isAgentMode(value: unknown): value is AgentMode {
  return typeof value === "string" && (AGENT_MODES as readonly string[]).includes(value);
}

/** The scopes a key needs to be useful in a mode (offered by default when creating one). */
export function scopesForMode(mode: AgentMode): Scope[] {
  // `analytics:read` is read-only and carries no personal data: every mode, plan included (RFC-0006).
  // `comments:read` likewise: reader text, never an email or IP hash (RFC-0007 D2).
  const read: Scope[] = [
    "site:read",
    "content:read",
    "preview:create",
    "analytics:read",
    "comments:read",
    // RFC-0008 §10.1: the schedule, read-only, in every mode.
    "schedules:read",
  ];
  // RFC-0014 §5 (ADR-0028): a plan key may propose body edits; they change nothing until a person
  // accepts them. Other modes get it through `content:write`.
  if (mode === "plan") return [...read, "content:propose"];
  // `asset:upload` is part of the default agent-key scopes outside plan (RFC-0004, ADR-0018);
  // `schedules:write` lets the agent propose and ask for releases (RFC-0008 §10.1).
  return [
    ...read,
    "content:write",
    "asset:upload",
    "site:publish",
    "site:rollback",
    "schedules:write",
  ];
}

/** Limits for an `auto`-mode publish that goes live without a person (see `isLowRiskPublish`). */
export const AUTO_PUBLISH_LIMIT = 20;

export interface PendingChange {
  id: string;
  kind: string;
}

/** Why `auto` mode did or did not let a publish through, as data (Studio words it itself). */
export type AutoCheckCode =
  | "low-risk"
  | "removes-content"
  | "nothing"
  | "structure"
  | "too-many"
  /** RFC-0004 §6.3: media that does not ride along with an article change. */
  | "media"
  /** RFC-0008 §10.7 (D9): the release would run after the key's window (elevation end or 24 h). */
  | "outside-window"
  /** RFC-0019 §2.4: an article gains a correction, an editorial statement a person signs off. */
  | "correction"
  /**
   * RFC-0042 §3.5: a live article gains a derived gate (its collection's expiry) or an earlier one,
   * which removes content at a set time, like `schedule_unpublish`.
   */
  | "expires";

/** The `auto`-mode check behind a publish (stored on audit rows and approvals, ADR-0015). */
export interface AutoCheck {
  /** `low-risk-release`: the same check applied to a release's items (RFC-0008 §10.3). */
  rule: "low-risk-publish" | "low-risk-release";
  lowRisk: boolean;
  code: AutoCheckCode;
  /** Pending changes the publish would carry (added + edited + removed). */
  changes: number;
  /** `AUTO_PUBLISH_LIMIT` at the time of the check. */
  limit: number;
}

const AUTO_CHECK_TEXT: Record<AutoCheckCode, (c: AutoCheck) => string> = {
  "low-risk": (c) => `${c.changes} article change(s) only`,
  "removes-content": () => "it removes content",
  nothing: () => "nothing to publish",
  structure: () => "it changes pages, menus, site settings, taxonomies or redirects",
  "too-many": (c) => `it changes more than ${c.limit} articles`,
  media: () => "it adds or changes media that is not part of an article change",
  "outside-window": () =>
    "it would run after your autonomy ends (the elevation's end, or 24 hours from now)",
  correction: () => "it adds a correction to a published article",
  expires: () => "it makes a published article expire sooner (its collection's expiry rule)",
};

/** English wording of a check, for agents and audit reasons. */
export function describeAutoCheck(check: AutoCheck): string {
  return AUTO_CHECK_TEXT[check.code](check);
}

/**
 * Low risk = only articles added or edited, nothing removed, no pages, menus, site settings,
 * taxonomies, terms or redirects touched (RFC-0002 §6.4, RFC-0003 §6.4), and at most `AUTO_PUBLISH_LIMIT` changes. Anything
 * else waits for a person even in `auto`.
 *
 * Media (RFC-0004 §6.3, answer 1): an added asset whose id is in `ridingAssets` (a new raster
 * image used only by articles in the same publish; the store decides) goes out with them and does
 * not count toward the limit. Any other asset change is `media` and waits for a person.
 *
 * Corrections (RFC-0019 §2.4): an entry in `corrections` (it adds a correction to its live
 * version; the store decides) makes the publish wait for a person. So does an entry in `expiries`
 * (RFC-0042 §3.5: it adds or advances a live entry's derived gate; core-ts `expiringEntries`).
 */
export function checkAutoPublish(
  diff: {
    added: PendingChange[];
    changed: { after: PendingChange }[];
    removed: PendingChange[];
  },
  options: {
    ridingAssets?: ReadonlySet<string>;
    corrections?: ReadonlySet<string>;
    expiries?: ReadonlySet<string>;
  } = {},
): AutoCheck {
  const riding = options.ridingAssets ?? new Set<string>();
  const corrects = options.corrections ?? new Set<string>();
  const expires = options.expiries ?? new Set<string>();
  const rides = (n: PendingChange) => n.kind === "asset" && riding.has(n.id);
  const added = diff.added.filter((n) => !rides(n));
  const touched = [...added, ...diff.changed.map((c) => c.after)];
  const base = {
    rule: "low-risk-publish" as const,
    changes: touched.length + diff.removed.length,
    limit: AUTO_PUBLISH_LIMIT,
  };
  const any = (test: (n: PendingChange) => boolean) => touched.some(test);
  // The first rule that holds decides, in this order; none: low risk.
  const rules: [AutoCheckCode, () => boolean][] = [
    ["removes-content", () => diff.removed.length > 0],
    ["nothing", () => touched.length === 0],
    ["structure", () => any((n) => n.kind !== "contentEntry" && n.kind !== "asset")],
    ["media", () => any((n) => n.kind === "asset")],
    ["correction", () => any((n) => corrects.has(n.id))],
    ["expires", () => any((n) => expires.has(n.id))],
    ["too-many", () => touched.length > AUTO_PUBLISH_LIMIT],
  ];
  const code: AutoCheckCode = rules.find(([, holds]) => holds())?.[0] ?? "low-risk";
  return { ...base, code, lowRisk: code === "low-risk" };
}

/**
 * Time-boxed elevation (ADR-0016): the owner lets a key work in a more autonomous mode until
 * `until`; afterwards it is back in its own mode without anyone doing anything (the effective mode
 * is computed on every call).
 */
export interface ModeElevation {
  mode: AgentMode;
  /** ISO time the elevation ends. */
  until: string;
  /** Actor id of the person who granted it. */
  grantedBy: string;
  grantedAt: string;
  /** Why, in the owner's words (shown in Studio and the audit). */
  reason?: string | undefined;
}

/** Shortest and longest elevation an owner can grant. */
export const ELEVATION_MIN_MINUTES = 5;
export const ELEVATION_MAX_MINUTES = 24 * 60;

/** `a` lets the agent do more on its own than `b` (AGENT_MODES order). */
export function isMoreAutonomous(a: AgentMode, b: AgentMode): boolean {
  return AGENT_MODES.indexOf(a) > AGENT_MODES.indexOf(b);
}

/**
 * Why an elevation request is refused, or undefined when it is acceptable: a remote mode more
 * autonomous than the key's own, for between `ELEVATION_MIN_MINUTES` and `ELEVATION_MAX_MINUTES`.
 */
export function elevationProblem(
  base: AgentMode,
  mode: AgentMode,
  minutes: number,
): string | undefined {
  if (!REMOTE_AGENT_MODES.includes(mode))
    return `mode "${mode}" is not available for API keys (bypass is local only)`;
  if (!isMoreAutonomous(mode, base))
    return `an elevation must be more autonomous than the key's own mode (${base})`;
  if (
    !Number.isInteger(minutes) ||
    minutes < ELEVATION_MIN_MINUTES ||
    minutes > ELEVATION_MAX_MINUTES
  )
    return `minutes must be a whole number between ${ELEVATION_MIN_MINUTES} and ${ELEVATION_MAX_MINUTES}`;
  return undefined;
}

/** The elevation that applies right now, if any (expired or no-longer-higher ones do not). */
export function activeElevation(
  base: AgentMode,
  elevation: ModeElevation | undefined,
  now: Date,
): ModeElevation | undefined {
  if (!elevation || !REMOTE_AGENT_MODES.includes(elevation.mode)) return undefined;
  if (!isMoreAutonomous(elevation.mode, base)) return undefined;
  const until = Date.parse(elevation.until);
  return Number.isFinite(until) && until > now.getTime() ? elevation : undefined;
}

/** How long before an elevation ends that owners and the agent are told (Studio notifications, `get_mode`). */
export const ELEVATION_NOTICE_MINUTES = 10;

/** Whole minutes left until `until` (rounded up; 0 once it has ended). */
export function minutesLeft(until: string, now: Date): number {
  const ms = Date.parse(until) - now.getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 60_000) : 0;
}

/** True during the last `ELEVATION_NOTICE_MINUTES` of an elevation. */
export function endsSoon(until: string, now: Date): boolean {
  const left = minutesLeft(until, now);
  return left > 0 && left <= ELEVATION_NOTICE_MINUTES;
}

/** The longest an `auto`-mode release may wait without a person (RFC-0008 §10.7, D9). */
export const AUTO_RELEASE_WINDOW_HOURS = 24;

/** A release item as the low-risk check sees it (RFC-0008 §10.3). */
export interface ReleaseItemRisk {
  kind: "set" | "remove";
  nodeId: string;
  nodeKind: string;
  /** The node is live today (the item has a base). */
  live: boolean;
  /** Ids the target references (assets that ride with an article). */
  deps?: readonly string[];
  /** RFC-0019 §2.4: the target adds a correction to the live version. */
  corrects?: boolean;
  /** RFC-0042 §3.5: the target adds or advances the live version's derived gate. */
  expires?: boolean;
}

/**
 * `checkAutoPublish` applied to a release (RFC-0008 §10.3): articles only, nothing removed, at most
 * `AUTO_PUBLISH_LIMIT` changes; a new asset rides along when an article item of the same release
 * references it.
 */
export function checkAutoRelease(items: readonly ReleaseItemRisk[]): AutoCheck {
  const riding = new Set<string>();
  for (const i of items)
    if (i.kind === "set" && i.nodeKind === "contentEntry")
      for (const d of i.deps ?? []) riding.add(d);
  const ref = (i: ReleaseItemRisk) => ({ id: i.nodeId, kind: i.nodeKind });
  const set = items.filter((i) => i.kind === "set");
  const check = checkAutoPublish(
    {
      added: set.filter((i) => !i.live).map(ref),
      changed: set.filter((i) => i.live).map((i) => ({ after: ref(i) })),
      removed: items.filter((i) => i.kind === "remove").map(ref),
    },
    {
      ridingAssets: new Set(
        set
          .filter((i) => i.nodeKind === "asset" && !i.live && riding.has(i.nodeId))
          .map((i) => i.nodeId),
      ),
      corrections: new Set(set.filter((i) => i.corrects).map((i) => i.nodeId)),
      expiries: new Set(set.filter((i) => i.expires).map((i) => i.nodeId)),
    },
  );
  return { ...check, rule: "low-risk-release" };
}

/**
 * The latest an `auto`-mode release may run and still go ahead without a person (RFC-0008 §10.7,
 * D9): the end of the key's elevation (when `auto` comes from one) or 24 hours from now, whichever
 * comes first.
 */
export function autoReleaseWindowEnds(now: Date, elevationUntil?: string): string {
  const day = now.getTime() + AUTO_RELEASE_WINDOW_HOURS * 3_600_000;
  const until = elevationUntil ? Date.parse(elevationUntil) : Number.NaN;
  return new Date(Number.isFinite(until) ? Math.min(day, until) : day).toISOString();
}
