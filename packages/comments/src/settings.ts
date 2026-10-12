/**
 * Comment settings (RFC-0007 §4.5): per site in `comment_settings`, per collection inside the same
 * row, per entry in `comment_threads`. Not a contract and not in the graph, so a content rollback
 * never reopens comments and closing a thread takes effect at once. This module holds the types and
 * the pure rules; `@cloudhal/comments/sql` reads and writes the rows (CAS on `rev`).
 */
import { CommentSettingsError } from "./errors.ts";
import { LINK_HARD_LIMIT } from "./model.ts";
import { foldForMatch } from "./rules.ts";

export type Protection = "pow" | "turnstile";
export type AiLabels = "off" | "workers-ai";
export type PlanHint = "free" | "paid";

export interface CollectionCommentSettings {
  readonly enabled: boolean;
  /** Overrides the site's `closeAfterDays`; `null` = never close; absent = the site's. */
  readonly closeAfterDays?: number | null;
}

/** Retention in days (§9.3). `null` = keep. */
export interface RetentionSettings {
  /** `pending` never decided (default 30). */
  readonly pendingDays: number;
  /** `spam` (default 30). */
  readonly spamDays: number;
  /** `deleted`, unless approved replies keep a tombstone (default 30). */
  readonly deletedDays: number;
  /** `hidden` (default `null`: kept until a person deletes it). */
  readonly hiddenDays: number | null;
  /**
   * `ip_hmac` and `challenge_id` on comments and reports: 1 to 30 days (default 30). The privacy
   * notice promises "up to 30 days" (RFC-0007 §9.1, §9.6), so it is a ceiling, not just a default.
   */
  readonly clientDataDays: number;
  /** Resolved reports and statements of reasons of removed comments (default 183, six months). */
  readonly resolvedReportDays: number;
}

export interface CommentSettings {
  readonly siteId: string;
  /** New comments accepted anywhere on the site. */
  readonly enabled: boolean;
  /** Keep approved comments visible (closed) while comments are off. */
  readonly showWhenOff: boolean;
  /** Collection slug → settings. A collection absent here is off. */
  readonly collections: Readonly<Record<string, CollectionCommentSettings>>;
  /** Site default; `null` = never. */
  readonly closeAfterDays: number | null;
  readonly protection: Protection;
  /** Public Turnstile widget key (the secret is in `comment_secrets`). */
  readonly turnstileSiteKey: string | null;
  /**
   * Accept JavaScript-less posts under the stricter limits (§6.5). They carry no proof of work and
   * no Turnstile token, so with Turnstile on they are accepted only when
   * `allowWithoutScriptWithTurnstile` is also true (see `withoutScriptAllowed`).
   */
  readonly allowWithoutScript: boolean;
  /**
   * Keep accepting JavaScript-less posts while Turnstile protects the form (default false). An
   * owner who turns on Turnstile expects every post to be verified; these posts are not, so the
   * owner must opt in explicitly (threat-model review of 2026-10-12, item 5).
   */
  readonly allowWithoutScriptWithTurnstile: boolean;
  /** Links above this add the `links` label; above 10 the comment is refused. */
  readonly linkLimit: number;
  /** Add the `watch-word` label. */
  readonly watchWords: readonly string[];
  /** Stored as `spam`, never shown. */
  readonly blockedWords: readonly string[];
  /** Stored submissions per UTC day (§6.5). */
  readonly dailyCap: number;
  readonly aiLabels: AiLabels;
  readonly retention: RetentionSettings;
  readonly planHint: PlanHint | null;
  /** `0` and `updatedAt: null` when no row is stored (the defaults apply). */
  readonly rev: number;
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

export type CommentSettingsInput = Partial<
  Omit<CommentSettings, "siteId" | "rev" | "updatedAt" | "updatedBy" | "retention">
> & { readonly retention?: Partial<RetentionSettings> };

export const DEFAULT_RETENTION: RetentionSettings = {
  pendingDays: 30,
  spamDays: 30,
  deletedDays: 30,
  hiddenDays: null,
  clientDataDays: 30,
  resolvedReportDays: 183,
};

/**
 * The defaults: comments off (§0.2 D4), 90-day close, proof of work, JavaScript-less posts on
 * (under proof of work only: off while Turnstile is on unless the owner allows them there too).
 */
export function defaultCommentSettings(siteId: string): CommentSettings {
  return {
    siteId,
    enabled: false,
    showWhenOff: true,
    collections: {},
    closeAfterDays: 90,
    protection: "pow",
    turnstileSiteKey: null,
    allowWithoutScript: true,
    allowWithoutScriptWithTurnstile: false,
    linkLimit: 2,
    watchWords: [],
    blockedWords: [],
    dailyCap: 1000,
    aiLabels: "off",
    retention: DEFAULT_RETENTION,
    planHint: null,
    rev: 0,
    updatedAt: null,
    updatedBy: null,
  };
}

/** Suggested `dailyCap` on Workers Paid (§6.5). */
export const PAID_DAILY_CAP = 5000;
export const MAX_DAILY_CAP = 100_000;
export const MAX_WORDS = 200;
export const MAX_WORD_LENGTH = 64;
export const MAX_COLLECTIONS = 100;
export const MAX_CLOSE_DAYS = 3650;
/**
 * The longest IP hashes and challenge ids are kept (§9.1, §9.3). The disclosure snippet says "up
 * to 30 days", so settings refuse more and the retention job clamps a stored value to it.
 */
export const MAX_CLIENT_DATA_DAYS = 30;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SITE_KEY = /^[A-Za-z0-9_-]{1,128}$/;

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

function checkDays(name: string, v: unknown, nullable: boolean, max = MAX_CLOSE_DAYS): void {
  if (v === null && nullable) return;
  if (!isInt(v, 1, max))
    throw new CommentSettingsError(
      `${name} must be a whole number of days from 1 to ${max}${nullable ? " or null" : ""}`,
    );
}

/** `clientDataDays` as the retention job applies it: never above `MAX_CLIENT_DATA_DAYS`. */
export function clientDataDays(retention: Pick<RetentionSettings, "clientDataDays">): number {
  const v = retention.clientDataDays;
  return Number.isInteger(v) && v >= 1 ? Math.min(v, MAX_CLIENT_DATA_DAYS) : MAX_CLIENT_DATA_DAYS;
}

/** Word lists are stored trimmed, de-duplicated by their folded form, in the order given. */
export function normalizeWordList(name: string, words: unknown): string[] {
  if (!Array.isArray(words)) throw new CommentSettingsError(`${name} must be a list of words`);
  if (words.length > MAX_WORDS)
    throw new CommentSettingsError(`${name} holds at most ${MAX_WORDS} entries`);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (typeof w !== "string") throw new CommentSettingsError(`${name} must be a list of words`);
    const word = w.normalize("NFC").replace(/\s+/g, " ").trim();
    const folded = foldForMatch(word);
    if (word.length === 0 || folded.length === 0)
      throw new CommentSettingsError(`${name} cannot hold an empty entry`);
    if (word.length > MAX_WORD_LENGTH)
      throw new CommentSettingsError(`${name} entries are at most ${MAX_WORD_LENGTH} characters`);
    if (seen.has(folded)) continue;
    seen.add(folded);
    out.push(word);
  }
  return out;
}

/**
 * Applies a patch to the current settings and checks the result. Throws `CommentSettingsError`
 * for anything outside the allowed values; unknown keys are refused so a typo is not silently
 * dropped.
 */
export function applySettingsInput(
  current: CommentSettings,
  input: CommentSettingsInput,
): CommentSettings {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    throw new CommentSettingsError("settings must be an object");
  const known = new Set([
    "enabled",
    "showWhenOff",
    "collections",
    "closeAfterDays",
    "protection",
    "turnstileSiteKey",
    "allowWithoutScript",
    "allowWithoutScriptWithTurnstile",
    "linkLimit",
    "watchWords",
    "blockedWords",
    "dailyCap",
    "aiLabels",
    "retention",
    "planHint",
  ]);
  for (const k of Object.keys(input))
    if (!known.has(k)) throw new CommentSettingsError(`unknown setting "${k}"`);
  const bool = (name: keyof CommentSettingsInput, fallback: boolean): boolean => {
    const v = input[name];
    if (v === undefined) return fallback;
    if (typeof v !== "boolean") throw new CommentSettingsError(`${name} must be true or false`);
    return v;
  };

  let collections = current.collections;
  if (input.collections !== undefined) {
    const c = input.collections as unknown;
    if (c === null || typeof c !== "object" || Array.isArray(c))
      throw new CommentSettingsError("collections must be an object");
    const entries = Object.entries(c as Record<string, unknown>);
    if (entries.length > MAX_COLLECTIONS)
      throw new CommentSettingsError(`at most ${MAX_COLLECTIONS} collections`);
    const out: Record<string, CollectionCommentSettings> = {};
    for (const [slug, v] of entries) {
      if (!SLUG.test(slug) || slug.length > 64)
        throw new CommentSettingsError(`"${slug.slice(0, 40)}" is not a collection slug`);
      if (v === null || typeof v !== "object" || Array.isArray(v))
        throw new CommentSettingsError(`collections.${slug} must be an object`);
      const o = v as Record<string, unknown>;
      for (const k of Object.keys(o))
        if (k !== "enabled" && k !== "closeAfterDays")
          throw new CommentSettingsError(`unknown setting "collections.${slug}.${k}"`);
      if (typeof o.enabled !== "boolean")
        throw new CommentSettingsError(`collections.${slug}.enabled must be true or false`);
      if (o.closeAfterDays !== undefined)
        checkDays(`collections.${slug}.closeAfterDays`, o.closeAfterDays, true);
      out[slug] =
        o.closeAfterDays === undefined
          ? { enabled: o.enabled }
          : { enabled: o.enabled, closeAfterDays: o.closeAfterDays as number | null };
    }
    collections = out;
  }

  const closeAfterDays =
    input.closeAfterDays === undefined ? current.closeAfterDays : input.closeAfterDays;
  checkDays("closeAfterDays", closeAfterDays, true);

  const protection = input.protection ?? current.protection;
  if (protection !== "pow" && protection !== "turnstile")
    throw new CommentSettingsError('protection must be "pow" or "turnstile"');
  const turnstileSiteKey =
    input.turnstileSiteKey === undefined ? current.turnstileSiteKey : input.turnstileSiteKey;
  if (
    turnstileSiteKey !== null &&
    (typeof turnstileSiteKey !== "string" || !SITE_KEY.test(turnstileSiteKey))
  )
    throw new CommentSettingsError("turnstileSiteKey must be a Turnstile site key");
  if (protection === "turnstile" && turnstileSiteKey === null)
    throw new CommentSettingsError("Turnstile needs its site key");

  const linkLimit = input.linkLimit ?? current.linkLimit;
  if (!isInt(linkLimit, 0, LINK_HARD_LIMIT))
    throw new CommentSettingsError(`linkLimit must be a whole number from 0 to ${LINK_HARD_LIMIT}`);
  const dailyCap = input.dailyCap ?? current.dailyCap;
  if (!isInt(dailyCap, 1, MAX_DAILY_CAP))
    throw new CommentSettingsError(`dailyCap must be a whole number from 1 to ${MAX_DAILY_CAP}`);
  const aiLabels = input.aiLabels ?? current.aiLabels;
  if (aiLabels !== "off" && aiLabels !== "workers-ai")
    throw new CommentSettingsError('aiLabels must be "off" or "workers-ai"');
  const planHint = input.planHint === undefined ? current.planHint : input.planHint;
  if (planHint !== null && planHint !== "free" && planHint !== "paid")
    throw new CommentSettingsError('planHint must be "free", "paid" or null');

  let retention = current.retention;
  if (input.retention !== undefined) {
    const r = input.retention as unknown;
    if (r === null || typeof r !== "object" || Array.isArray(r))
      throw new CommentSettingsError("retention must be an object");
    for (const k of Object.keys(r))
      if (!(k in DEFAULT_RETENTION))
        throw new CommentSettingsError(`unknown setting "retention.${k}"`);
    retention = { ...current.retention, ...(r as Partial<RetentionSettings>) };
    checkDays("retention.pendingDays", retention.pendingDays, false);
    checkDays("retention.spamDays", retention.spamDays, false);
    checkDays("retention.deletedDays", retention.deletedDays, false);
    checkDays("retention.hiddenDays", retention.hiddenDays, true);
    checkDays("retention.clientDataDays", retention.clientDataDays, false, MAX_CLIENT_DATA_DAYS);
    checkDays("retention.resolvedReportDays", retention.resolvedReportDays, false);
  }

  return {
    ...current,
    enabled: bool("enabled", current.enabled),
    showWhenOff: bool("showWhenOff", current.showWhenOff),
    collections,
    closeAfterDays,
    protection,
    turnstileSiteKey,
    allowWithoutScript: bool("allowWithoutScript", current.allowWithoutScript),
    allowWithoutScriptWithTurnstile: bool(
      "allowWithoutScriptWithTurnstile",
      current.allowWithoutScriptWithTurnstile,
    ),
    linkLimit,
    watchWords:
      input.watchWords === undefined
        ? current.watchWords
        : normalizeWordList("watchWords", input.watchWords),
    blockedWords:
      input.blockedWords === undefined
        ? current.blockedWords
        : normalizeWordList("blockedWords", input.blockedWords),
    dailyCap,
    aiLabels,
    retention,
    planHint,
  };
}

/**
 * Whether posts without JavaScript (no proof of work, no Turnstile token) are accepted (§6.2 step
 * 7, D11): when the owner allows them, and, while Turnstile is on, only when the owner allowed them
 * under Turnstile as well.
 */
export function withoutScriptAllowed(
  settings: Pick<
    CommentSettings,
    "allowWithoutScript" | "allowWithoutScriptWithTurnstile" | "protection"
  >,
): boolean {
  return (
    settings.allowWithoutScript &&
    (settings.protection !== "turnstile" || settings.allowWithoutScriptWithTurnstile)
  );
}

/** Whether new comments are accepted in a collection (site and collection both on). */
export function collectionEnabled(settings: CommentSettings, collection: string): boolean {
  return settings.enabled && settings.collections[collection]?.enabled === true;
}

/** Days after first publication a thread in this collection closes (`null` = never). */
export function closeAfterDaysFor(settings: CommentSettings, collection: string): number | null {
  const c = settings.collections[collection];
  return c?.closeAfterDays === undefined ? settings.closeAfterDays : c.closeAfterDays;
}
