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
import { authClient } from "./lib/auth.ts";
import { AccountShell } from "./routes/AccountShell.tsx";
import { SiteShell } from "./routes/SiteShell.tsx";
import { SiteTabsLayout } from "./routes/SiteTabsLayout.tsx";

/**
 * Screens load on demand (one chunk each); the shells above stay in the main bundle so the frame
 * renders immediately. `defaultPreload: "intent"` fetches a screen's chunk on hover/focus.
 */
const AccountPage = lazyRouteComponent(() => import("./routes/AccountPage.tsx"), "AccountPage");
const ActivityPage = lazyRouteComponent(() => import("./routes/ActivityPage.tsx"), "ActivityPage");
const AgentsPage = lazyRouteComponent(() => import("./routes/AgentsPage.tsx"), "AgentsPage");
const ArticleEditorPage = lazyRouteComponent(
  () => import("./routes/ArticleEditorPage.tsx"),
  "ArticleEditorPage",
);
const ArticlesPage = lazyRouteComponent(() => import("./routes/ArticlesPage.tsx"), "ArticlesPage");
const LoginPage = lazyRouteComponent(() => import("./routes/LoginPage.tsx"), "LoginPage");
const PageEditorPage = lazyRouteComponent(
  () => import("./routes/PageEditorPage.tsx"),
  "PageEditorPage",
);
const PagesPage = lazyRouteComponent(() => import("./routes/PagesPage.tsx"), "PagesPage");
const SiteOverviewPage = lazyRouteComponent(
  () => import("./routes/SiteOverviewPage.tsx"),
  "SiteOverviewPage",
);
const SiteSettingsPage = lazyRouteComponent(
  () => import("./routes/SiteSettingsPage.tsx"),
  "SiteSettingsPage",
);
const SitesPage = lazyRouteComponent(() => import("./routes/SitesPage.tsx"), "SitesPage");
const SkillsPage = lazyRouteComponent(() => import("./routes/SkillsPage.tsx"), "SkillsPage");
const SnapshotsPage = lazyRouteComponent(
  () => import("./routes/SnapshotsPage.tsx"),
  "SnapshotsPage",
);

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

// Site surface
const siteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sites/$siteId",
  beforeLoad: requireSession,
  component: SiteShell,
});
const siteTabsRoute = createRoute({
  getParentRoute: () => siteRoute,
  id: "site-tabs",
  component: SiteTabsLayout,
});
const siteIndexRoute = createRoute({
  getParentRoute: () => siteTabsRoute,
  path: "/",
  component: SiteOverviewPage,
});
const pagesRoute = createRoute({
  getParentRoute: () => siteTabsRoute,
  path: "/pages",
  component: PagesPage,
});
const articlesRoute = createRoute({
  getParentRoute: () => siteTabsRoute,
  path: "/articles",
  component: ArticlesPage,
});
const snapshotsRoute = createRoute({
  getParentRoute: () => siteTabsRoute,
  path: "/snapshots",
  /** `?diff=<snapshotId>` opens that snapshot's changes (linked from Activity). */
  validateSearch: (search: Record<string, unknown>): { diff?: string } =>
    typeof search.diff === "string" && search.diff ? { diff: search.diff } : {},
  component: SnapshotsPage,
});
const activityRoute = createRoute({
  getParentRoute: () => siteTabsRoute,
  path: "/activity",
  component: ActivityPage,
});
const siteSettingsRoute = createRoute({
  getParentRoute: () => siteTabsRoute,
  path: "/settings",
  component: SiteSettingsPage,
});
const pageEditorRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/pages/$pageId",
  component: PageEditorPage,
});
const articleEditorRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/articles/$entryId",
  component: ArticleEditorPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  indexRoute,
  accountRoute.addChildren([sitesRoute, agentsRoute, skillsRoute, accountSettingsRoute]),
  siteRoute.addChildren([
    siteTabsRoute.addChildren([
      siteIndexRoute,
      pagesRoute,
      articlesRoute,
      snapshotsRoute,
      activityRoute,
      siteSettingsRoute,
    ]),
    pageEditorRoute,
    articleEditorRoute,
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
