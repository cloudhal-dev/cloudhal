/** Reader comments: the calls (the types are in `comments-types.ts`). */
import type { Comment } from "@cloudhal/core-contracts";
import type {
  CommentBan,
  CommentCounts,
  CommentEraseResult,
  CommentEventRow,
  Commenter,
  CommentLabelName,
  CommentListQuery,
  CommentModerateAction,
  CommentModerationResponse,
  CommentModerationResult,
  CommentReasonCode,
  CommentReportRow,
  CommentSettings,
  CommentSettingsPatch,
  CommentSummary,
  CommentThreadMode,
  CommentThreadView,
  CommentView,
} from "./comments-types.ts";
import { type ApiError, ApiRequestError, json, query, request } from "./http.ts";

const commentsPath = (siteId: string) => `/api/sites/${encodeURIComponent(siteId)}`;

/**
 * Reader comments (RFC-0007 §12): the queue for Authors and above (moderation and replies on
 * their own articles), everything for Editors, commenter data for `commenters:data`, settings
 * for Administrators. Render every name, text and report as plain text.
 */
export const commentsApi = {
  list: (siteId: string, q: CommentListQuery = {}) =>
    request<{ items: CommentView[]; nextCursor?: string; counts: CommentCounts }>(
      `${commentsPath(siteId)}/comments${query({ ...q })}`,
    ),
  summary: (siteId: string, range: CommentSummary["range"] = "7d") =>
    request<CommentSummary>(`${commentsPath(siteId)}/comments/summary${query({ range })}`),
  get: (siteId: string, commentId: string) =>
    request<{
      comment: CommentView;
      history: CommentEventRow[];
      reports: CommentReportRow[];
      thread: CommentThreadView;
    }>(`${commentsPath(siteId)}/comments/${encodeURIComponent(commentId)}`),
  /** ≤ 50 ids; per-comment results (`conflict`, `not_own`, …). hide and spam need a reasonCode. */
  moderate: (
    siteId: string,
    input: {
      ids: string[];
      action: CommentModerateAction;
      revs: Record<string, number>;
      reasonCode?: CommentReasonCode;
      note?: string;
    },
  ) =>
    request<CommentModerationResponse>(`${commentsPath(siteId)}/comments/moderate`, {
      method: "POST",
      ...json(input),
    }),
  /** Soft delete (Editors and above): the text is removed at once; a reason is required. */
  remove: (
    siteId: string,
    commentId: string,
    rev: number,
    reasonCode: CommentReasonCode,
    note?: string,
  ) =>
    request<CommentModerationResponse>(
      `${commentsPath(siteId)}/comments/${encodeURIComponent(commentId)}`,
      { method: "DELETE", ...json({ rev, reasonCode, ...(note ? { note } : {}) }) },
    ),
  label: (
    siteId: string,
    commentId: string,
    change: { add?: CommentLabelName[]; remove?: CommentLabelName[]; rev?: number },
  ) =>
    request<CommentModerationResult>(
      `${commentsPath(siteId)}/comments/${encodeURIComponent(commentId)}/labels`,
      { method: "PATCH", ...json(change) },
    ),
  /** A person's reply on the site's behalf, approved at once ("Author" badge on one's own articles). */
  reply: (siteId: string, commentId: string, text: string) =>
    request<{ comment: CommentView }>(
      `${commentsPath(siteId)}/comments/${encodeURIComponent(commentId)}/replies`,
      { method: "POST", ...json({ text }) },
    ),
  editReply: (siteId: string, commentId: string, text: string, rev: number) =>
    request<{ comment: CommentView }>(
      `${commentsPath(siteId)}/comments/${encodeURIComponent(commentId)}`,
      { method: "PATCH", ...json({ text, rev }) },
    ),
  reports: (siteId: string, q: { open?: "true" | "false" | "all"; commentId?: string } = {}) =>
    request<{ items: CommentReportRow[] }>(
      `${commentsPath(siteId)}/comments/reports${query({ ...q })}`,
    ),
  resolveReport: (siteId: string, reportId: string, resolution: string) =>
    request<CommentReportRow>(
      `${commentsPath(siteId)}/comments/reports/${encodeURIComponent(reportId)}/resolve`,
      { method: "POST", ...json({ resolution }) },
    ),
  /**
   * The whole export as one JSON-lines file; `personal` also needs `commenters:data`. The
   * server answers one page per request (D1 Free's 50 queries per invocation) with
   * `cloudhal-next-cursor` while more remain; the pages concatenate (the header is on the first).
   */
  exportFile: async (siteId: string, personal = false): Promise<Blob> => {
    const parts: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10_000; page++) {
      const res: Response = await fetch(
        `${commentsPath(siteId)}/comments/export${query({ personal: personal ? "1" : undefined, cursor })}`,
        { credentials: "include" },
      );
      if (!res.ok)
        throw new ApiRequestError(
          res.status,
          (await res
            .json()
            .catch(() => ({ error: "export_failed", message: res.statusText }))) as ApiError,
        );
      parts.push(await res.text());
      cursor = res.headers.get("cloudhal-next-cursor");
      if (!cursor) break;
    }
    return new Blob(parts, { type: "application/x-ndjson" });
  },
  settings: (siteId: string) =>
    request<{
      settings: CommentSettings;
      secrets: Record<"turnstile-secret", { updatedAt: string; updatedBy: string } | null>;
      canStoreSecrets: boolean;
    }>(`${commentsPath(siteId)}/comments/settings`),
  /** CAS on `rev` (0 before the first save): 409 `conflict` when it changed meanwhile. */
  updateSettings: (siteId: string, rev: number, patch: CommentSettingsPatch) =>
    request<{ settings: CommentSettings; purge: "none" | "tags" | "everything" }>(
      `${commentsPath(siteId)}/comments/settings`,
      { method: "PUT", ...json({ rev, ...patch }) },
    ),
  /** Write-only (503 `comments_key_missing` without `CLOUDHAL_COMMENTS_KEY`). */
  setSecret: (siteId: string, name: "turnstile-secret", value: string) =>
    request<{ name: string; updatedAt: string; updatedBy: string }>(
      `${commentsPath(siteId)}/comments/settings/secrets/${name}`,
      { method: "PUT", ...json({ value }) },
    ),
  deleteSecret: (siteId: string, name: "turnstile-secret") =>
    request<{ name: string; deleted: boolean }>(
      `${commentsPath(siteId)}/comments/settings/secrets/${name}`,
      { method: "DELETE" },
    ),
  /** The last resort when a takedown waits (§8.4 step 5). */
  purgeSiteCache: (siteId: string) =>
    request<{ purged: boolean }>(`${commentsPath(siteId)}/comments/purge-site-cache`, {
      method: "POST",
    }),
  thread: (siteId: string, nodeId: string) =>
    request<{ thread: CommentThreadView; counts: CommentCounts }>(
      `${commentsPath(siteId)}/comment-threads/${encodeURIComponent(nodeId)}`,
    ),
  /** CAS on the thread's `rev` (0 before the first change). */
  setThread: (
    siteId: string,
    nodeId: string,
    rev: number,
    change: { mode: CommentThreadMode; closesAt?: string | null },
  ) =>
    request<{ thread: CommentThreadView }>(
      `${commentsPath(siteId)}/comment-threads/${encodeURIComponent(nodeId)}`,
      { method: "PUT", ...json({ rev, ...change }) },
    ),
  /** A POST with a JSON body, so an email address never goes in a URL (or request logs). */
  findCommenter: (siteId: string, by: { email: string } | { commentId: string }) =>
    request<{ commenter: Commenter | null }>(`${commentsPath(siteId)}/commenters/lookup`, {
      method: "POST",
      ...json(by),
    }),
  commenter: (siteId: string, commenterId: string) =>
    request<{ commenter: Commenter; comments: CommentView[] }>(
      `${commentsPath(siteId)}/commenters/${encodeURIComponent(commenterId)}`,
    ),
  exportCommenter: (siteId: string, commenterId: string) =>
    request<{ commenter: Commenter; comments: Comment[] }>(
      `${commentsPath(siteId)}/commenters/${encodeURIComponent(commenterId)}/export`,
      { method: "POST" },
    ),
  /** `anonymise` (default) or `delete-text`; a reason is required. Audited, purged. */
  eraseCommenter: (
    siteId: string,
    commenterId: string,
    mode: "anonymise" | "delete-text",
    reason: string,
  ) =>
    request<CommentEraseResult>(
      `${commentsPath(siteId)}/commenters/${encodeURIComponent(commenterId)}/erase`,
      { method: "POST", ...json({ mode, reason }) },
    ),
  /** A guest who left no email: erase these comments' author (and text). */
  eraseComments: (
    siteId: string,
    commentIds: string[],
    mode: "anonymise" | "delete-text",
    reason: string,
  ) =>
    request<CommentEraseResult>(`${commentsPath(siteId)}/comments/erase`, {
      method: "POST",
      ...json({ commentIds, mode, reason }),
    }),
  /** The site's bans; with `commentId`, only those on that comment's author (by keyed hash). */
  bans: (siteId: string, commentId?: string) =>
    request<{ items: CommentBan[] }>(`${commentsPath(siteId)}/comment-bans${query({ commentId })}`),
  /**
   * Bans the author of a comment by email and/or this month's IP hash; nobody sees an address.
   * With `hidePast` the server hides at most 1,000 approved comments a request (D1 Free's 50
   * queries per invocation) and says `more`; the ban is an upsert, so this repeats the request
   * until nothing is left and returns the total hidden.
   */
  ban: async (
    siteId: string,
    input: {
      commentId: string;
      subjects: ("email" | "ip")[];
      until?: string | null;
      reasonCode: CommentReasonCode;
      note?: string;
      hidePast?: boolean;
    },
  ): Promise<{ bans: CommentBan[]; hidden: number }> => {
    let hidden = 0;
    for (let round = 0; ; round++) {
      const r = await request<{ bans: CommentBan[]; hidden: number; more?: boolean }>(
        `${commentsPath(siteId)}/comment-bans`,
        { method: "POST", ...json(input) },
      );
      hidden += r.hidden;
      if (!r.more || round >= 100) return { bans: r.bans, hidden };
    }
  },
  liftBan: (siteId: string, banId: string) =>
    request<{ lifted: boolean }>(
      `${commentsPath(siteId)}/comment-bans/${encodeURIComponent(banId)}`,
      { method: "DELETE" },
    ),
};
