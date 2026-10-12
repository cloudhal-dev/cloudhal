import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "../i18n/index.tsx";
import { ApiRequestError, api, type PublishResult, publishResultOf } from "../lib/api.ts";
import { ownOnlyGuess } from "../lib/roles.ts";
import { taxonomyKeys } from "./Taxonomy.tsx";
import { useToast } from "./Toast.ts";
import { useGate, useMe, useSelf } from "./useMe.ts";
import { approvalsKey } from "./usePendingApprovals.ts";

/**
 * How the signed-in person publishes (RFC-0005 §4, §6, DESIGN.md §2s):
 * - `publish` — Editors and above, or an Author whose change set looks own-only;
 * - `request` — an Author whose change set includes others' work or structure: the publish becomes
 *   a request an Editor approves (the server answers 202);
 * - `none` — Contributors: they submit articles for review; `reason` says so.
 */
export type PublishMode = "publish" | "request" | "none";

export function usePublishMode(siteId: string): {
  mode: PublishMode;
  reason: string | undefined;
} {
  const any = useGate("publish.any");
  const own = useGate("publish.own");
  const me = useMe().data;
  const self = useSelf();
  // Only an Author needs the guess; everyone else never fetches the extra lists.
  const author = !any.allowed && own.allowed && me?.can !== undefined;
  const site = useQuery({
    queryKey: ["site", siteId],
    queryFn: () => api.sites.get(siteId),
    enabled: author,
  });
  const snapshots = useQuery({
    queryKey: ["snapshots", siteId],
    queryFn: () => api.snapshots.list(siteId),
    enabled: author,
  });
  const entries = useQuery({
    queryKey: ["entries", siteId, "all"],
    queryFn: () => api.entries.list(siteId),
    enabled: author,
  });
  const pages = useQuery({
    queryKey: ["pages", siteId],
    queryFn: () => api.pages.list(siteId),
    enabled: author,
  });
  const terms = useQuery({
    queryKey: taxonomyKeys.terms(siteId),
    queryFn: () => api.terms.list(siteId),
    enabled: author,
    retry: false,
  });
  const redirects = useQuery({
    queryKey: taxonomyKeys.redirects(siteId),
    queryFn: () => api.redirects.list(siteId),
    enabled: author,
    retry: false,
  });
  if (any.allowed) return { mode: "publish", reason: undefined };
  if (!own.allowed) return { mode: "none", reason: own.reason };
  const live = snapshots.data?.find((s) => s.id === site.data?.publishedSnapshotId);
  const ownOnly = ownOnlyGuess({
    liveAt: live?.createdAt,
    entries: entries.data ?? [],
    structure: [
      ...(pages.data ?? []),
      ...(terms.data ?? []).map((i) => i.term),
      ...(redirects.data ?? []),
    ],
    self,
  });
  return { mode: ownOnly ? "publish" : "request", reason: undefined };
}

export type PublishTarget = { snapshotId: string } | { label: string };

/**
 * Publishing from anywhere in the site surface: a new snapshot of the current state (`label`), or
 * an existing snapshot (`snapshotId`). Live → success toast; 202 → an info notice that an Editor
 * must approve, with a way to the request; a refusal (403, a Contributor) → its reason.
 */
export function usePublishSite(siteId: string, options: { onDone?: () => void } = {}) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const gate = useGate("publish.own");
  return useMutation({
    mutationFn: async (target: PublishTarget): Promise<PublishResult> =>
      "snapshotId" in target
        ? api.snapshots.publish(siteId, target.snapshotId)
        : publishResultOf(
            await api.snapshots.create(siteId, { label: target.label, publish: true }),
          ),
    onSuccess: async (result, target) => {
      options.onDone?.();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["snapshots", siteId] }),
        qc.invalidateQueries({ queryKey: ["site", siteId] }),
        qc.invalidateQueries({ queryKey: approvalsKey(siteId) }),
      ]);
      if (result.kind === "published") {
        toast.success(
          "snapshotId" in target ? t("snapshots.published") : t("snapshots.publishedSnapshot"),
        );
        return;
      }
      toast.notice({
        id: result.request.id,
        title: t("publishing.requested"),
        description: t("publishing.requestedDescription"),
        tone: "info",
        actions: [
          {
            label: t("publishing.openRequest"),
            onClick: () => void navigate({ to: "/sites/$siteId/approvals", params: { siteId } }),
          },
        ],
      });
    },
    onError: (e) => {
      const refused = e instanceof ApiRequestError && e.status === 403;
      toast.error(
        refused ? t("publishing.refused") : t("snapshots.failed"),
        refused ? (gate.reason ?? e.message) : e instanceof Error ? e.message : String(e),
      );
    },
  });
}
