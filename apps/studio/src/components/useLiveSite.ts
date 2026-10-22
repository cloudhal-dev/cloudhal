/**
 * Links to the live site (its primary domain): the origin, the live snapshot, an item as the live
 * snapshot holds it, and the toast actions and notices that point there. Every read shares the
 * `["site", siteId]` and `["snapshots", siteId]` queries Studio already has.
 */
import type { Site, Snapshot } from "@cloudhal/core-contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { siteOrigin } from "../lib/live-site.ts";
import { useOpenSitePublish } from "./sitePublishOpener.ts";
import { type ToastAction, useToast } from "./Toast.ts";
import { useGate } from "./useMe.ts";

function useSite(siteId: string) {
  return useQuery({
    queryKey: ["site", siteId],
    queryFn: () => api.sites.get(siteId),
    enabled: siteId !== "",
  });
}

/** `https://<primary hostname>`, or undefined while the site has no domain (or is loading). */
export function useSiteOrigin(siteId: string): string | undefined {
  return siteOrigin(useSite(siteId).data?.domains);
}

/** The origin, the id of the live snapshot (undefined: never published), and the site itself. */
export function useLiveSite(siteId: string): {
  origin: string | undefined;
  liveSnapshotId: string | undefined;
  loading: boolean;
  site: Site | undefined;
} {
  const site = useSite(siteId);
  return {
    origin: siteOrigin(site.data?.domains),
    liveSnapshotId: site.data?.publishedSnapshotId,
    loading: site.isPending,
    site: site.data,
  };
}

/** The live snapshot (snapshots never change): from the list when it is there, else fetched. */
export function useLiveSnapshot(siteId: string) {
  const qc = useQueryClient();
  const id = useSite(siteId).data?.publishedSnapshotId;
  return useQuery({
    queryKey: ["snapshot", siteId, id],
    queryFn: () => api.snapshots.get(siteId, id as string),
    enabled: id !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    initialData: () => qc.getQueryData<Snapshot[]>(["snapshots", siteId])?.find((s) => s.id === id),
  });
}

/**
 * A page or article as the live snapshot holds it (drafts included), or undefined when the site
 * was never published or the item is not in there (404). One request per item, cached for good.
 */
export function useLiveNode<T>(siteId: string, nodeId: string): T | undefined {
  const id = useSite(siteId).data?.publishedSnapshotId;
  return useQuery({
    queryKey: ["snapshot-node", siteId, id, nodeId],
    queryFn: () => api.snapshots.node<T>(siteId, id as string, nodeId),
    enabled: id !== undefined && nodeId !== "",
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  }).data;
}

/** Opens a live URL in a new tab, without giving it this window. */
export function openLive(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Copies a URL and says so (as Studio copies ids elsewhere). */
export function useCopyLink(): (url: string) => Promise<void> {
  const t = useT();
  const toast = useToast();
  return async (url) => {
    await navigator.clipboard?.writeText(url);
    toast.success(t("common.copied"), url);
  };
}

/**
 * Toast actions to the live site: `view` ("View site"), `viewAndCopy` (plus "Copy link"). Empty
 * without a domain, so the toast stays plain.
 */
export function useLiveSiteActions(siteId: string): {
  view: ToastAction[];
  viewAndCopy: ToastAction[];
} {
  const t = useT();
  const origin = useSiteOrigin(siteId);
  const copy = useCopyLink();
  if (!origin) return { view: [], viewAndCopy: [] };
  const url = `${origin}/`;
  const view = { label: t("liveSite.view"), onClick: () => openLive(url) };
  const copyLink = { label: t("liveSite.copyLink"), onClick: () => void copy(url) };
  return { view: [view], viewAndCopy: [view, copyLink] };
}

/**
 * Setting a page or article to Published only marks it: it goes live with the next site publish
 * (`editor.publishPageDescription`). The notice says so and offers "Publish site" — the top bar's
 * confirmation — to people who may publish.
 */
export function useMarkedPublishedNotice(): (item: { id: string; rev: number }) => void {
  const t = useT();
  const toast = useToast();
  const openPublish = useOpenSitePublish();
  const gate = useGate("publish.own");
  return (item) =>
    toast.notice({
      id: `marked-published-${item.id}-${item.rev}`,
      title: t("liveSite.markedPublished"),
      description: t("liveSite.markedPublishedDescription"),
      tone: "info",
      actions:
        openPublish && gate.allowed
          ? [{ label: t("liveSite.publishSite"), onClick: openPublish }]
          : [],
    });
}

/**
 * An editor's save toast: "Saved · Revision n", or — when the save is what marked the item
 * Published — the notice that it goes live with the next site publish.
 */
export function useSavedToast(): (
  saved: { id: string; rev: number; status: string },
  before: string | undefined,
) => void {
  const t = useT();
  const toast = useToast();
  const markedPublished = useMarkedPublishedNotice();
  return (saved, before) => {
    if (saved.status === "published" && before !== "published") markedPublished(saved);
    else toast.success(t("editor.saved"), t("common.rev", { rev: saved.rev }));
  };
}
