/**
 * Site settings › Comments (RFC-0007 §4.5, §6, §9.3, §14; DESIGN.md §2w): the form model behind
 * `components/CommentSettings.tsx` — what the selects offer, what a save sends (only the changed
 * fields, with `rev`), how a form keeps unsaved edits across "Load latest", and the checks the
 * server makes, so the form can say what is wrong before it asks.
 */
import type {
  AgentKeySummary,
  CommentRetention,
  CommentSettings,
  CommentSettingsPatch,
} from "./api.ts";
import { holds } from "./roles.ts";

/** The editable part of a site's comment settings. */
export interface CommentsForm {
  enabled: boolean;
  showWhenOff: boolean;
  collections: Record<string, { enabled: boolean; closeAfterDays?: number | null }>;
  closeAfterDays: number | null;
  protection: "pow" | "turnstile";
  /** Empty while there is none (sent as `null`). */
  turnstileSiteKey: string;
  allowWithoutScript: boolean;
  linkLimit: number;
  watchWords: string[];
  blockedWords: string[];
  dailyCap: number;
  aiLabels: "off" | "workers-ai";
  retention: CommentRetention;
}

const FIELDS = [
  "enabled",
  "showWhenOff",
  "collections",
  "closeAfterDays",
  "protection",
  "turnstileSiteKey",
  "allowWithoutScript",
  "linkLimit",
  "watchWords",
  "blockedWords",
  "dailyCap",
  "aiLabels",
  "retention",
] as const satisfies readonly (keyof CommentsForm)[];

/** "Close threads after": Never, then 14 days to a year (RFC-0007 §14; the default is 90). */
export const CLOSE_OPTIONS: readonly (number | null)[] = [null, 14, 30, 90, 180, 365];

/** Retention choices per kind of data (RFC-0007 §9.3 gives the defaults). */
export const RETENTION_OPTIONS: Record<keyof CommentRetention, readonly (number | null)[]> = {
  pendingDays: [7, 14, 30, 90],
  spamDays: [7, 14, 30, 90],
  deletedDays: [7, 14, 30, 90],
  hiddenDays: [null, 30, 90, 180, 365],
  clientDataDays: [7, 14, 30],
  resolvedReportDays: [90, 183, 365],
};
export const RETENTION_FIELDS = Object.keys(RETENTION_OPTIONS) as (keyof CommentRetention)[];

/** Limits the server checks (`@cloudhal/comments` settings). */
export const LINK_LIMIT_MAX = 10;
export const DAILY_CAP_MAX = 100_000;
export const WORDS_MAX = 200;
export const WORD_LENGTH_MAX = 64;
const SITE_KEY = /^[A-Za-z0-9_-]{1,128}$/;

/** The starter's article collection, offered even before anything was saved (RFC-0007 §4.5). */
export const DEFAULT_COLLECTION = "posts";

export function formOf(settings: CommentSettings): CommentsForm {
  return {
    enabled: settings.enabled,
    showWhenOff: settings.showWhenOff,
    collections: structuredClone(settings.collections),
    closeAfterDays: settings.closeAfterDays,
    protection: settings.protection,
    turnstileSiteKey: settings.turnstileSiteKey ?? "",
    allowWithoutScript: settings.allowWithoutScript,
    linkLimit: settings.linkLimit,
    watchWords: [...settings.watchWords],
    blockedWords: [...settings.blockedWords],
    dailyCap: settings.dailyCap,
    aiLabels: settings.aiLabels,
    retention: { ...settings.retention },
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Only what differs from what is saved: the PUT sends these with `rev`. */
export function patchOf(saved: CommentsForm, form: CommentsForm): CommentSettingsPatch {
  const patch: Record<string, unknown> = {};
  for (const field of FIELDS) {
    if (same(form[field], saved[field])) continue;
    if (field === "turnstileSiteKey") patch[field] = form.turnstileSiteKey.trim() || null;
    else if (field === "retention") {
      const changed: Partial<CommentRetention> = {};
      for (const k of RETENTION_FIELDS)
        if (form.retention[k] !== saved.retention[k])
          (changed as Record<string, number | null>)[k] = form.retention[k];
      patch.retention = changed;
    } else patch[field] = form[field];
  }
  return patch as CommentSettingsPatch;
}

export function isDirty(saved: CommentsForm, form: CommentsForm): boolean {
  return Object.keys(patchOf(saved, form)).length > 0;
}

/**
 * The form after the server's copy moved from `base` to `latest` (our save, or "Load latest" after
 * a 409): fields the server changed take its value, the person's other edits stay (DESIGN.md §2c).
 */
export function rebase(base: CommentsForm, form: CommentsForm, latest: CommentsForm): CommentsForm {
  const next: Record<string, unknown> = { ...form };
  for (const field of FIELDS) if (!same(latest[field], base[field])) next[field] = latest[field];
  return next as unknown as CommentsForm;
}

/** The collections the form lists: the default one, any the site has entries in, any saved. */
export function collectionKeys(
  form: Pick<CommentsForm, "collections">,
  fromEntries: readonly string[] = [],
): string[] {
  return [...new Set([DEFAULT_COLLECTION, ...fromEntries, ...Object.keys(form.collections)])].sort(
    (a, b) => (a === DEFAULT_COLLECTION ? -1 : b === DEFAULT_COLLECTION ? 1 : a.localeCompare(b)),
  );
}

export type CommentsFormProblem =
  | "turnstileSiteKey"
  | "linkLimit"
  | "dailyCap"
  | "watchWords"
  | "blockedWords";

/** What the server would refuse, by field (the form shows each under its control). */
export function formProblems(form: CommentsForm): Partial<Record<CommentsFormProblem, true>> {
  const out: Partial<Record<CommentsFormProblem, true>> = {};
  const key = form.turnstileSiteKey.trim();
  if (form.protection === "turnstile" && !SITE_KEY.test(key)) out.turnstileSiteKey = true;
  if (form.protection === "pow" && key && !SITE_KEY.test(key)) out.turnstileSiteKey = true;
  if (!Number.isInteger(form.linkLimit) || form.linkLimit < 0 || form.linkLimit > LINK_LIMIT_MAX)
    out.linkLimit = true;
  if (!Number.isInteger(form.dailyCap) || form.dailyCap < 1 || form.dailyCap > DAILY_CAP_MAX)
    out.dailyCap = true;
  const badWords = (words: string[]) =>
    words.length > WORDS_MAX || words.some((w) => !w.trim() || w.length > WORD_LENGTH_MAX);
  if (badWords(form.watchWords)) out.watchWords = true;
  if (badWords(form.blockedWords)) out.blockedWords = true;
  return out;
}

/** Word lists: trimmed, lower-cased in the site's sense, without duplicates or empties. */
export function cleanWords(words: readonly string[]): string[] {
  return [...new Set(words.map((w) => w.trim()).filter(Boolean))];
}

/** `Select` values are strings: days, or `never`. */
export const daysValue = (days: number | null | undefined) =>
  days === null ? "never" : days === undefined ? "site" : String(days);
export function daysFrom(value: string): number | null | undefined {
  if (value === "never") return null;
  if (value === "site") return undefined;
  const days = Number(value);
  return Number.isInteger(days) && days > 0 ? days : undefined;
}

/** What `D1` writes a day of comments costs, roughly: rows written per stored comment. */
export const ROWS_PER_COMMENT = 3;

// ---- agent keys: "Allow comments" (RFC-0007 §10.1) ----------------------------------------------

/**
 * A key made before `comments:read` existed (or customised without it): its agent cannot read
 * comments. Keys are never widened on their own; a person adds the read scope with one click.
 */
export function missesComments(key: Pick<AgentKeySummary, "scopes">): boolean {
  return !holds(key.scopes, "comments:read");
}
