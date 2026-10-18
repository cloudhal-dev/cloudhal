import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { hitLocation } from "../lib/palette.ts";
import type { PaletteCommand } from "./AppFrame.tsx";
import type { PaletteSearch } from "./CommandMenu.tsx";
import { usePublishMode } from "./Publish.tsx";
import { useToast } from "./Toast.ts";

/** The site's screens the palette goes to, in its order (a table, not a list of closures). */
const SITE_SCREENS = [
  ["overview", "commands.goOverview", "/sites/$siteId"],
  ["analytics", "commands.goAnalytics", "/sites/$siteId/analytics"],
  ["pages", "nav.pages", "/sites/$siteId/pages"],
  ["articles", "commands.goArticles", "/sites/$siteId/articles"],
  ["taxonomy", "commands.goTaxonomy", "/sites/$siteId/taxonomy"],
  ["media", "commands.goMedia", "/sites/$siteId/media"],
  ["comments", "commands.goComments", "/sites/$siteId/comments"],
  ["schedules", "commands.goSchedules", "/sites/$siteId/schedules"],
  ["navigation", "commands.goNavigation", "/sites/$siteId/navigation"],
  ["redirects", "commands.goRedirects", "/sites/$siteId/redirects"],
  ["snapshots", "commands.goSnapshots", "/sites/$siteId/snapshots"],
  ["activity", "commands.goActivity", "/sites/$siteId/activity"],
  ["approvals", "commands.goApprovals", "/sites/$siteId/approvals"],
  ["settings", "commands.goSiteSettings", "/sites/$siteId/settings"],
] as const;

/** Screens outside the site, after its own. */
const OTHER_SCREENS = [
  ["agents", "commands.goAgents", "/agents"],
  ["skills", "commands.goSkills", "/agents/skills"],
  ["team", "commands.goTeam", "/team"],
  ["account", "commands.goAccount", "/account"],
] as const;

/**
 * The site surface's palette (DESIGN.md §1 "Top bar", RFC-0029 §7): its commands, the search over
 * the site's content (a hit opens its editor, ⌘/Ctrl in a new tab), and the state of the top bar's
 * publish confirmation, which the palette's Publish opens instead of publishing (§2s).
 */
export function useSitePalette({
  siteId,
  defaultLocale,
  comments,
}: {
  siteId: string;
  defaultLocale: string | undefined;
  /** Reader comments are on and the person may read them. */
  comments: boolean;
}): {
  commands: PaletteCommand[];
  search: PaletteSearch;
  publishOpen: boolean;
  setPublishOpen: (open: boolean) => void;
} {
  const t = useT();
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [publishOpen, setPublishOpen] = useState(false);
  const publishing = usePublishMode(siteId);
  const createArticle = useMutation({
    mutationFn: () =>
      api.entries.create(siteId, {
        collection: "posts",
        slug: `untitled-${Date.now().toString(36)}`,
        locale: defaultLocale ?? "en",
        status: "draft",
        title: t("articles.untitled"),
        body: { format: "markdown", value: "" },
        fields: {},
        tags: [],
      }),
    onSuccess: async (entry) => {
      await qc.invalidateQueries({ queryKey: ["entries", siteId] });
      await navigate({
        to: "/sites/$siteId/articles/$entryId",
        params: { siteId, entryId: entry.id },
      });
    },
  });
  const snapshot = useMutation({
    mutationFn: () => api.snapshots.create(siteId, { label: t("snapshots.fromStudio") }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["snapshots", siteId] });
      toast.success(t("snapshots.created"));
    },
    onError: (e) => toast.error(t("snapshots.failed"), apiErrorText(t, e)),
  });
  const screens: PaletteCommand[] = SITE_SCREENS.filter(([id]) => id !== "comments" || comments)
    .map(([id, label, to]) => ({
      id,
      label: t(label),
      run: () => navigate({ to, params: { siteId } }),
    }))
    .flatMap((c) =>
      // "Schedule a publish…" sits right after the schedule.
      c.id === "schedules"
        ? [
            c,
            {
              id: "new-schedule",
              label: t("commands.newSchedule"),
              run: () =>
                navigate({
                  to: "/sites/$siteId/schedules",
                  params: { siteId },
                  search: { new: "publish" },
                }),
            },
          ]
        : [c],
    )
    .concat(
      OTHER_SCREENS.map(([id, label, to]) => ({
        id,
        label: t(label),
        run: () => navigate({ to }),
      })),
    );
  const actions: PaletteCommand[] = [
    { id: "new-article", label: t("commands.newArticle"), run: () => createArticle.mutate() },
    { id: "snapshot", label: t("commands.createSnapshot"), run: () => snapshot.mutate() },
    // Publishing follows the role: live, a request an Editor approves (202), or not at all (§2s).
    ...(publishing.mode === "none"
      ? []
      : [
          {
            id: "publish",
            label:
              publishing.mode === "request"
                ? t("publishing.requestCommand")
                : t("commands.publishSite"),
            run: () => setPublishOpen(true),
          },
        ]),
    { id: "all-sites", label: t("nav.allSites"), run: () => navigate({ to: "/sites" }) },
  ];
  const search: PaletteSearch = {
    siteId,
    open: (hit, newTab) => {
      const location = hitLocation(siteId, hit);
      if (newTab) window.open(router.buildLocation(location).href, "_blank", "noopener");
      else void navigate(location);
    },
  };
  return { commands: [...screens, ...actions], search, publishOpen, setPublishOpen };
}
