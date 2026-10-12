/**
 * Row ↔ record mapping for the comment tables. `toComment` is the only way a `comments` row
 * leaves the store, and it reads none of `email_id`, `ip_hmac`, `challenge_id`, `proof` or `op`,
 * so no returned record can carry them (invariant C1).
 */
import type { Comment, CommentLabel, CommentModeration } from "@cloudhal/core-contracts";
import { CommentSettingsError } from "../errors.ts";
import { num } from "../model.ts";
import {
  type CommentSettings,
  DEFAULT_RETENTION,
  defaultCommentSettings,
  type RetentionSettings,
} from "../settings.ts";

export interface CommentRow extends Record<string, unknown> {
  id: string;
  site_id: string;
  node_id: string;
  parent_id: string | null;
  in_reply_to_id: string | null;
  source: string;
  origin: string | null;
  author: string;
  body: string | null;
  status: string;
  labels: string;
  moderation: string | null;
  email_id: string | null;
  ip_hmac: string | null;
  challenge_id: string | null;
  proof: string;
  op: string | null;
  hash: string;
  created_at: string;
  edited_at: string | null;
  rev: number;
}

const parse = <T>(text: string | null): T | undefined =>
  text === null || text === undefined ? undefined : (JSON.parse(text) as T);

export function toComment(r: CommentRow): Comment {
  const labels = parse<CommentLabel[]>(r.labels) ?? [];
  const origin = parse<Comment["origin"]>(r.origin);
  const moderation = parse<CommentModeration>(r.moderation);
  return {
    schemaVersion: 1,
    id: r.id,
    siteId: r.site_id,
    nodeId: r.node_id,
    ...(r.parent_id ? { parentId: r.parent_id } : {}),
    ...(r.in_reply_to_id ? { inReplyToId: r.in_reply_to_id } : {}),
    source: r.source as Comment["source"],
    ...(origin ? { origin } : {}),
    author: JSON.parse(r.author) as Comment["author"],
    ...(r.body !== null ? { body: { format: "text", text: r.body } } : {}),
    status: r.status as Comment["status"],
    ...(labels.length > 0 ? { labels } : {}),
    ...(moderation ? { moderation } : {}),
    createdAt: r.created_at,
    ...(r.edited_at ? { editedAt: r.edited_at } : {}),
    rev: num(r.rev),
  };
}

export interface SettingsRow extends Record<string, unknown> {
  site_id: string;
  enabled: number;
  show_when_off: number;
  collections: string;
  close_after_days: number | null;
  protection: string;
  turnstile_site_key: string | null;
  allow_without_script: number;
  link_limit: number;
  watch_words: string;
  blocked_words: string;
  daily_cap: number;
  ai_labels: string;
  retention: string;
  plan_hint: string | null;
  rev: number;
  updated_at: string;
  updated_by: string;
}

export function toSettings(r: SettingsRow): CommentSettings {
  const base = defaultCommentSettings(r.site_id);
  try {
    return {
      ...base,
      enabled: num(r.enabled) === 1,
      showWhenOff: num(r.show_when_off) === 1,
      collections: JSON.parse(r.collections) as CommentSettings["collections"],
      closeAfterDays: r.close_after_days === null ? null : num(r.close_after_days),
      protection: r.protection === "turnstile" ? "turnstile" : "pow",
      turnstileSiteKey: r.turnstile_site_key,
      allowWithoutScript: num(r.allow_without_script) === 1,
      linkLimit: num(r.link_limit),
      watchWords: JSON.parse(r.watch_words) as string[],
      blockedWords: JSON.parse(r.blocked_words) as string[],
      dailyCap: num(r.daily_cap),
      aiLabels: r.ai_labels === "workers-ai" ? "workers-ai" : "off",
      retention: {
        ...DEFAULT_RETENTION,
        ...(JSON.parse(r.retention) as Partial<RetentionSettings>),
      },
      planHint: r.plan_hint === "free" || r.plan_hint === "paid" ? r.plan_hint : null,
      rev: num(r.rev),
      updatedAt: r.updated_at,
      updatedBy: r.updated_by,
    };
  } catch (cause) {
    throw new CommentSettingsError(`stored comment settings are unreadable: ${String(cause)}`);
  }
}

export function settingsValues(s: CommentSettings): (string | number | null)[] {
  return [
    s.enabled ? 1 : 0,
    s.showWhenOff ? 1 : 0,
    JSON.stringify(s.collections),
    s.closeAfterDays,
    s.protection,
    s.turnstileSiteKey,
    s.allowWithoutScript ? 1 : 0,
    s.linkLimit,
    JSON.stringify(s.watchWords),
    JSON.stringify(s.blockedWords),
    s.dailyCap,
    s.aiLabels,
    JSON.stringify(s.retention),
    s.planHint,
  ];
}

export const SETTINGS_COLUMNS =
  "enabled, show_when_off, collections, close_after_days, protection, turnstile_site_key, allow_without_script, link_limit, watch_words, blocked_words, daily_cap, ai_labels, retention, plan_hint";
