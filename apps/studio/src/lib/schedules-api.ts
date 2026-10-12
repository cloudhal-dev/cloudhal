/**
 * The typed schedules client (RFC-0008 §13, `packages/api/src/routes/schedules.ts`): the calendar,
 * releases, gates, automations, runs and the site's schedule settings. The types live in `api.ts`
 * with every other contract; the calls live here so they load with the schedule screens and the
 * lazily loaded "Schedule…" dialog rather than with the shell (`bundle-budget.ts`). `api.scheduler`
 * (the health the shell polls) stays in `api.ts`.
 *
 * Every write takes the `rev` the caller read (CAS): a 409 `conflict` means the release or the
 * automation changed meanwhile ("Load the latest").
 */
import type { Automation, ContentEntry, Page, ScheduleRun } from "@cloudhal/core-contracts";
import {
  type AutomationInput,
  type CalendarQuery,
  json,
  query,
  type ReleaseDiff,
  type ReleaseResult,
  type ReleaseView,
  type ReleaseWhenInput,
  type RulePreview,
  type RunDetail,
  request,
  type SchedulePage,
  type ScheduleSettings,
} from "./api.ts";

const site = (siteId: string) => `/api/sites/${encodeURIComponent(siteId)}`;
const rel = (siteId: string, id: string) => `${site(siteId)}/releases/${encodeURIComponent(id)}`;
const aut = (siteId: string, id: string) => `${site(siteId)}/automations/${encodeURIComponent(id)}`;
const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", ...json(body) });

/** A gate write's answer: the node, and the gate-only release when it went live on its own. */
export interface GateResult {
  node?: ContentEntry | Page;
  release?: ReleaseResult["release"];
  status: "set" | "scheduled" | "with-next-publish" | "approval-pending" | "lifted";
  approvalId?: string;
}

export const schedulesApi = {
  /** Calendar items between two instants (at most 62 days, 200 items a page). */
  calendar: (siteId: string, q: CalendarQuery) =>
    request<SchedulePage>(
      `${site(siteId)}/schedule${query({
        from: q.from,
        to: q.to,
        types: q.types?.join(","),
        states: q.states?.join(","),
        origin: q.origin,
        approval: q.approval,
        collection: q.collection,
        q: q.q,
        cursor: q.cursor,
      })}`,
    ),
  releases: {
    list: (siteId: string, states?: readonly string[]) =>
      request<{ releases: ReleaseView[] }>(
        `${site(siteId)}/releases${query({ state: states?.join(","), limit: 200 })}`,
      ).then((r) => r.releases),
    get: (siteId: string, id: string) => request<ReleaseView>(rel(siteId, id)),
    diff: (siteId: string, id: string) => request<ReleaseDiff>(`${rel(siteId, id)}/diff`),
    /** A draft of these nodes (pinned now, plus what they need that is not live: `closureAdded`). */
    create: (siteId: string, input: { nodeIds: string[]; removeIds?: string[]; title?: string }) =>
      post<{ release: ReleaseResult["release"]; closureAdded: string[] }>(
        `${site(siteId)}/releases`,
        input,
      ),
    retitle: (siteId: string, id: string, rev: number, title: string | null) =>
      request<ReleaseView>(rel(siteId, id), { method: "PATCH", ...json({ rev, title }) }),
    /** Scheduled with the person's own approval when their role allows it, else a request. */
    schedule: (siteId: string, id: string, rev: number, when: ReleaseWhenInput) =>
      post<ReleaseResult>(`${rel(siteId, id)}/schedule`, { rev, when }),
    /** A person who may approve it keeps the approval; anyone else's move asks again (D4). */
    reschedule: (siteId: string, id: string, rev: number, when: ReleaseWhenInput) =>
      post<ReleaseResult>(`${rel(siteId, id)}/reschedule`, { rev, when }),
    /** The current versions of the same nodes; `approve` re-approves in the same act. */
    repin: (siteId: string, id: string, rev: number, approve = false) =>
      post<ReleaseResult>(`${rel(siteId, id)}/repin`, { rev, approve }),
    /** Back to a draft: the approval and the request are dropped, the nodes unlocked. */
    unschedule: (siteId: string, id: string, rev: number) =>
      post<ReleaseResult>(`${rel(siteId, id)}/unschedule`, { rev }),
    cancel: (siteId: string, id: string, rev: number) =>
      post<ReleaseResult>(`${rel(siteId, id)}/cancel`, { rev }),
    /** A manual run now (scheduled, missed, expired); 503 where this server cannot run it. */
    publishNow: (siteId: string, id: string, rev: number) =>
      post<{ release: ReleaseResult["release"]; runId?: string }>(
        `${rel(siteId, id)}/publish-now`,
        { rev },
      ),
  },
  gates: {
    /**
     * An embargo (`from`) or an expiry (`until`), as an instant. `apply: "now"` publishes a
     * gate-only change on its own; 409 `gates_unsupported` while the site cannot enforce gates.
     */
    set: (
      siteId: string,
      input: {
        nodeId: string;
        from?: string;
        until?: string;
        rev?: number;
        apply?: "now" | "with-next-publish";
      },
    ) => post<GateResult>(`${site(siteId)}/gates`, input),
    /** Lifting an embargo early (D8): Editors and above, with a reason. */
    lift: (
      siteId: string,
      nodeId: string,
      input: { reason: string; rev?: number; from?: string },
    ) => post<GateResult>(`${site(siteId)}/gates/${encodeURIComponent(nodeId)}/lift`, input),
  },
  automations: {
    list: (siteId: string) =>
      request<{ automations: Automation[] }>(`${site(siteId)}/automations`).then(
        (r) => r.automations,
      ),
    get: (siteId: string, id: string) =>
      request<{ automation: Automation; runs: ScheduleRun[] }>(aut(siteId, id)),
    /** Agent tasks mint their key: its secret is in this answer only. */
    create: (siteId: string, input: AutomationInput) =>
      post<{ automation: Automation; key?: { id: string; secret: string; scopes: string[] } }>(
        `${site(siteId)}/automations`,
        input,
      ),
    update: (
      siteId: string,
      id: string,
      rev: number,
      patch: Partial<Pick<AutomationInput, "name" | "recurrence">> & {
        job?:
          | Partial<Extract<AutomationInput["job"], { kind: "agent-task" }>>
          | { staleAfterDays?: number };
      },
    ) =>
      request<{ automation: Automation }>(aut(siteId, id), {
        method: "PATCH",
        ...json({ rev, ...patch }),
      }).then((r) => r.automation),
    pause: (siteId: string, id: string, rev: number) =>
      post<{ automation: Automation }>(`${aut(siteId, id)}/pause`, { rev }).then(
        (r) => r.automation,
      ),
    resume: (siteId: string, id: string, rev: number) =>
      post<{ automation: Automation }>(`${aut(siteId, id)}/resume`, { rev }).then(
        (r) => r.automation,
      ),
    /**
     * Agent tasks: a run window opens now; built-in jobs: a run starts within a minute. 409
     * `conflict` while a run is in progress or one already started this minute.
     */
    runNow: (siteId: string, id: string) =>
      post<{ runId: string; window?: { opensAt: string; closesAt: string } }>(
        `${aut(siteId, id)}/run-now`,
        {},
      ),
    remove: (siteId: string, id: string, rev: number) =>
      request<{ deleted: string }>(`${aut(siteId, id)}${query({ rev })}`, { method: "DELETE" }),
    /** The next five runs of a rule, the clock-change days and the rule in words. */
    previewRule: (
      siteId: string,
      input: { start: string; timeZone: string; rule?: string; locale: string },
    ) => post<RulePreview>(`${site(siteId)}/automations/preview-rule`, input),
  },
  runs: {
    list: (
      siteId: string,
      q: {
        state?: readonly string[];
        automationId?: string;
        releaseId?: string;
        before?: string;
      } = {},
    ) =>
      request<{ runs: ScheduleRun[]; nextCursor?: string }>(
        `${site(siteId)}/runs${query({
          state: q.state?.join(","),
          automationId: q.automationId,
          releaseId: q.releaseId,
          before: q.before,
          limit: 50,
        })}`,
      ),
    get: (siteId: string, id: string) =>
      request<RunDetail>(`${site(siteId)}/runs/${encodeURIComponent(id)}`),
  },
  settings: {
    get: (siteId: string) => request<ScheduleSettings>(`${site(siteId)}/schedule-settings`),
    /** The kill switch (with a reason) and the daily automation write cap; audited. */
    put: (
      siteId: string,
      input: { rev: number; paused?: boolean; reason?: string; dailyWriteCap?: number },
    ) =>
      request<ScheduleSettings>(`${site(siteId)}/schedule-settings`, {
        method: "PUT",
        ...json(input),
      }),
  },
};
