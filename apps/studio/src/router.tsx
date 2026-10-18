import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { RouteError, RoutePending } from "./components/RouteStates.tsx";
import { LOCALE_LIST, withMessages } from "./i18n/index.tsx";
import { type AnalyticsSearch, validateAnalyticsSearch } from "./lib/analytics-search.ts";
import { authClient } from "./lib/auth.ts";
import { isQueueTab, type QueueTab } from "./lib/comments-shell.ts";
import { AccountShell } from "./routes/AccountShell.tsx";
import { SiteShell } from "./routes/SiteShell.tsx";

/**
 * Screens load on demand (one chunk each); the shells above stay in the main bundle so the frame
 * renders immediately. `defaultPreload: "intent"` fetches a screen's chunk on hover/focus.
 */
const AccountPage = lazyRouteComponent(() => import("./routes/AccountPage.tsx"), "AccountPage");
const AnalyticsPage = lazyRouteComponent(
  () => withMessages(import("./routes/AnalyticsPage.tsx"), ["analytics"]),
  "AnalyticsPage",
);
const ActivityPage = lazyRouteComponent(() => import("./routes/ActivityPage.tsx"), "ActivityPage");
const AgentsPage = lazyRouteComponent(
  () => withMessages(import("./routes/AgentsPage.tsx"), ["analyticsSettings", "commentsSettings"]),
  "AgentsPage",
);
const ApprovalsPage = lazyRouteComponent(
  () => withMessages(import("./routes/ApprovalsPage.tsx"), ["comments"]),
  "ApprovalsPage",
);
const ArticleEditorPage = lazyRouteComponent(
  () =>
    withMessages(import("./routes/ArticleEditorPage.tsx"), [
      "readers",
      "comments",
      "bodyEditor",
      "media",
      "menus",
    ]),
  "ArticleEditorPage",
);
const ArticlesPage = lazyRouteComponent(
  () => withMessages(import("./routes/ArticlesPage.tsx"), ["readers", "menus"]),
  "ArticlesPage",
);
const CommentsPage = lazyRouteComponent(
  () => withMessages(import("./routes/CommentsPage.tsx"), ["comments"]),
  "CommentsPage",
);
const CommentThreadPage = lazyRouteComponent(
  () => withMessages(import("./routes/CommentThreadPage.tsx"), ["comments"]),
  "CommentThreadPage",
);
const CommenterPage = lazyRouteComponent(
  () => withMessages(import("./routes/CommenterPage.tsx"), ["comments"]),
  "CommenterPage",
);
const LoginPage = lazyRouteComponent(() => import("./routes/LoginPage.tsx"), "LoginPage");
const InvitePage = lazyRouteComponent(() => import("./routes/InvitePage.tsx"), "InvitePage");
const ResetPasswordPage = lazyRouteComponent(
  () => import("./routes/ResetPasswordPage.tsx"),
  "ResetPasswordPage",
);
const ForgotPasswordPage = lazyRouteComponent(
  () => import("./routes/ForgotPasswordPage.tsx"),
  "ForgotPasswordPage",
);
const MembersPage = lazyRouteComponent(() => import("./routes/MembersPage.tsx"), "MembersPage");
const PageEditorPage = lazyRouteComponent(
  () =>
    withMessages(import("./routes/PageEditorPage.tsx"), [
      "readers",
      "bodyEditor",
      "media",
      "menus",
    ]),
  "PageEditorPage",
);
const BuildPage = lazyRouteComponent(
  () => withMessages(import("./routes/BuildPage.tsx"), ["build"]),
  "BuildPage",
);
const PagesPage = lazyRouteComponent(
  () => withMessages(import("./routes/PagesPage.tsx"), ["readers", "menus"]),
  "PagesPage",
);
const SiteOverviewPage = lazyRouteComponent(
  () => withMessages(import("./routes/SiteOverviewPage.tsx"), ["readers"]),
  "SiteOverviewPage",
);
const SiteSettingsPage = lazyRouteComponent(
  // The privacy notice is offered in every language, so every locale's settings words load.
  () =>
    withMessages(
      import("./routes/SiteSettingsPage.tsx"),
      [
        "analyticsSettings",
        "commentsSettings",
        "scheduleSettings",
        "aiSettings",
        "appearance",
        "media",
      ],
      LOCALE_LIST,
    ),
  "SiteSettingsPage",
);
const SitesPage = lazyRouteComponent(() => import("./routes/SitesPage.tsx"), "SitesPage");
const SkillsPage = lazyRouteComponent(() => import("./routes/SkillsPage.tsx"), "SkillsPage");
const SnapshotsPage = lazyRouteComponent(
  () => withMessages(import("./routes/SnapshotsPage.tsx"), ["menus"]),
  "SnapshotsPage",
);
const TaxonomyPage = lazyRouteComponent(() => import("./routes/TaxonomyPage.tsx"), "TaxonomyPage");
const TermEditorPage = lazyRouteComponent(
  () => withMessages(import("./routes/TermEditorPage.tsx"), ["media", "menus"]),
  "TermEditorPage",
);
const NavigationPage = lazyRouteComponent(
  () => withMessages(import("./routes/NavigationPage.tsx"), ["menus"]),
  "NavigationPage",
);
const MediaPage = lazyRouteComponent(
  () => withMessages(import("./routes/MediaPage.tsx"), ["media"]),
  "MediaPage",
);
const AssetPage = lazyRouteComponent(
  () => withMessages(import("./routes/AssetPage.tsx"), ["media"]),
  "AssetPage",
);
const TranslationsPage = lazyRouteComponent(
  () => import("./routes/TranslationsPage.tsx"),
  "TranslationsPage",
);
const RedirectsPage = lazyRouteComponent(
  () => import("./routes/RedirectsPage.tsx"),
  "RedirectsPage",
);

const TERM_FILTERS = new Set(["all", "public", "internal", "proposed", "retired"]);
const slugParam = (v: unknown): string | undefined =>
  typeof v === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) ? v : undefined;

export interface RouterContext {
  queryClient: QueryClient;
}

async function requireSession() {
  const { data } = await authClient.getSession();
  if (!data) throw redirect({ to: "/login" });
  return data;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: () => <Outlet /> });
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});
/**
 * Public token pages (RFC-0005 §7): the link's secret is in the fragment (`#chinv_…`, `#chrst_…`),
 * which the page takes and strips at once; no session needed.
 */
const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite",
  component: InvitePage,
});
/** RFC-0011: asks for a reset link by email; public, answers the same for every address. */
const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forgot-password",
  component: ForgotPasswordPage,
});
const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  component: ResetPasswordPage,
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    await requireSession();
    throw redirect({ to: "/sites" });
  },
});

// Account surface
const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "account",
  beforeLoad: requireSession,
  component: AccountShell,
});
const sitesRoute = createRoute({
  getParentRoute: () => accountRoute,
  path: "/sites",
  component: SitesPage,
});
const agentsRoute = createRoute({
  getParentRoute: () => accountRoute,
  path: "/agents",
  component: AgentsPage,
});
const skillsRoute = createRoute({
  getParentRoute: () => accountRoute,
  path: "/agents/skills",
  component: SkillsPage,
});
const accountSettingsRoute = createRoute({
  getParentRoute: () => accountRoute,
  path: "/account",
  component: AccountPage,
});
/** Settings › Team (RFC-0005): members, invites; `?view=activity` for the deployment's events. */
const teamRoute = createRoute({
  getParentRoute: () => accountRoute,
  path: "/team",
  validateSearch: (search: Record<string, unknown>): { view?: "activity" } =>
    search.view === "activity" ? { view: "activity" } : {},
  component: MembersPage,
});

// Site surface
const siteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sites/$siteId",
  beforeLoad: requireSession,
  component: SiteShell,
});
const siteIndexRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/",
  component: SiteOverviewPage,
});
/** Site › Overview › Analytics (RFC-0006 §10.1): `?range=7d` or `?from=&to=`, `&compare=0`, `&filter=`. */
const analyticsRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/analytics",
  validateSearch: (search: Record<string, unknown>): AnalyticsSearch =>
    validateAnalyticsSearch(search),
  component: AnalyticsPage,
});
const pagesRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/pages",
  component: PagesPage,
});
const articlesRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/articles",
  /** `?category=<slug>&tag=<slug>`: the facet filters (linked from Categories & tags). */
  validateSearch: (search: Record<string, unknown>): { category?: string; tag?: string } => {
    const category = slugParam(search.category);
    const tag = slugParam(search.tag);
    return { ...(category ? { category } : {}), ...(tag ? { tag } : {}) };
  },
  component: ArticlesPage,
});
/** Site › Categories & tags (RFC-0002 §8): `?taxonomy=<key>&filter=<status>`. */
const taxonomyRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/taxonomy",
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    taxonomy?: string;
    filter?: "all" | "public" | "internal" | "proposed" | "retired";
  } => {
    const taxonomy = slugParam(search.taxonomy);
    const filter =
      typeof search.filter === "string" && TERM_FILTERS.has(search.filter)
        ? (search.filter as "all")
        : undefined;
    return { ...(taxonomy ? { taxonomy } : {}), ...(filter ? { filter } : {}) };
  },
  component: TaxonomyPage,
});
const termEditorRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/taxonomy/$termId",
  component: TermEditorPage,
});
/** Site › Settings › Navigation (RFC-0003 §8): `?menu=<key>&item=<itemId>`. */
const navigationRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/navigation",
  validateSearch: (search: Record<string, unknown>): { menu?: string; item?: string } => {
    const menu = slugParam(search.menu);
    const item =
      typeof search.item === "string" && /^item_[A-Za-z0-9]{6,32}$/.test(search.item)
        ? search.item
        : undefined;
    return { ...(menu ? { menu } : {}), ...(item ? { item } : {}) };
  },
  component: NavigationPage,
});
/** Site › Content › Media (RFC-0004 §8): the library, and one file's page. */
const mediaRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/media",
  component: MediaPage,
});
const assetRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/media/$assetId",
  component: AssetPage,
});
/** Site › Content › Comments (RFC-0007 §14): the moderation queue, `?tab=reported` etc. */
const commentsRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/comments",
  validateSearch: (search: Record<string, unknown>): { tab?: QueueTab } =>
    isQueueTab(search.tab) && search.tab !== "pending" ? { tab: search.tab } : {},
  component: CommentsPage,
});
const commentIdParam = (v: unknown): string | undefined =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : undefined;
/** One article's thread: `?comment=<id>` lands on a comment, `?reply=<id>` opens the reply form. */
const commentThreadRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/comments/$nodeId",
  validateSearch: (search: Record<string, unknown>): { comment?: string; reply?: string } => {
    const comment = commentIdParam(search.comment);
    const reply = commentIdParam(search.reply);
    return { ...(comment ? { comment } : {}), ...(reply ? { reply } : {}) };
  },
  component: CommentThreadPage,
});
/** A commenter (`commenters:data`): identity, their comments, ban, export, erase. */
const commenterRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/commenters/$commenterId",
  component: CommenterPage,
});
/** Site › Translations (RFC-0033 §8): the coverage view. */
const translationsRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/translations",
  component: TranslationsPage,
});
/** Site › Settings › Redirects. */
const redirectsRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/redirects",
  component: RedirectsPage,
});
/**
 * Site › Automation › Schedules (RFC-0008 §15.1): Calendar · Automations · History, a release —
 * lazy screens with their words. They check their own URL (`schedules-search.ts`), so the entry
 * carries none of it.
 */
const scheduleRoute = <P extends string>(path: P, load: () => Promise<object>, name: string) =>
  createRoute({
    getParentRoute: () => siteRoute,
    path,
    component: lazyRouteComponent(() => withMessages(load(), ["schedules"]), name as never),
  });
const schedulesRoute = scheduleRoute(
  "/schedules",
  () => import("./routes/SchedulesPage.tsx"),
  "SchedulesPage",
);
const automationsRoute = scheduleRoute(
  "/schedules/automations",
  () => import("./routes/AutomationsPage.tsx"),
  "AutomationsPage",
);
const scheduleHistoryRoute = scheduleRoute(
  "/schedules/history",
  () => import("./routes/ScheduleHistoryPage.tsx"),
  "ScheduleHistoryPage",
);
const releaseRoute = scheduleRoute(
  "/schedules/releases/$releaseId",
  () => import("./routes/ReleasePage.tsx"),
  "ReleasePage",
);
const snapshotsRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/snapshots",
  /** `?diff=<snapshotId>` opens that snapshot's changes (linked from Activity). */
  validateSearch: (search: Record<string, unknown>): { diff?: string } =>
    typeof search.diff === "string" && search.diff ? { diff: search.diff } : {},
  component: SnapshotsPage,
});
const activityRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/activity",
  component: ActivityPage,
});
/** Activity › Approvals: agents' gated calls waiting for a person (ADR-0014). */
const approvalsRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/approvals",
  component: ApprovalsPage,
});
const siteSettingsRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/settings",
  component: SiteSettingsPage,
});
const pageEditorRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/pages/$pageId",
  component: PageEditorPage,
});
// RFC-0020 §6: a page as agents build it, live.
const buildRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/pages/$pageId/build",
  // The editor's "Change with AI" aims Build chat at a section or component of the page.
  validateSearch: (search: Record<string, unknown>): { section?: string; component?: string } => ({
    ...(typeof search.section === "string" && search.section.length <= 64
      ? { section: search.section }
      : {}),
    ...(typeof search.component === "string" && search.component.length <= 64
      ? { component: search.component }
      : {}),
  }),
  component: BuildPage,
});
const articleEditorRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/articles/$entryId",
  component: ArticleEditorPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  inviteRoute,
  resetPasswordRoute,
  forgotPasswordRoute,
  indexRoute,
  accountRoute.addChildren([sitesRoute, agentsRoute, skillsRoute, accountSettingsRoute, teamRoute]),
  siteRoute.addChildren([
    siteIndexRoute,
    analyticsRoute,
    pagesRoute,
    articlesRoute,
    snapshotsRoute,
    activityRoute,
    approvalsRoute,
    siteSettingsRoute,
    pageEditorRoute,
    buildRoute,
    articleEditorRoute,
    taxonomyRoute,
    termEditorRoute,
    redirectsRoute,
    translationsRoute,
    navigationRoute,
    mediaRoute,
    assetRoute,
    commentsRoute,
    commentThreadRoute,
    commenterRoute,
    schedulesRoute,
    automationsRoute,
    scheduleHistoryRoute,
    releaseRoute,
  ]),
]);

export function createStudioRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultPendingComponent: RoutePending,
    defaultErrorComponent: RouteError,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createStudioRouter>;
  }
}
