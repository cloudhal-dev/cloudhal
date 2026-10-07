import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { authClient } from "./lib/auth.ts";
import { AccountShell } from "./routes/AccountShell.tsx";
import { ArticleEditorPage } from "./routes/ArticleEditorPage.tsx";
import { ArticlesPage } from "./routes/ArticlesPage.tsx";
import { LoginPage } from "./routes/LoginPage.tsx";
import { PageEditorPage } from "./routes/PageEditorPage.tsx";
import { PagesPage } from "./routes/PagesPage.tsx";
import { SiteOverviewPage } from "./routes/SiteOverviewPage.tsx";
import { SiteShell } from "./routes/SiteShell.tsx";
import { SitesPage } from "./routes/SitesPage.tsx";
import { SiteTabsLayout } from "./routes/SiteTabsLayout.tsx";
import { SnapshotsPage } from "./routes/SnapshotsPage.tsx";

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
  component: SnapshotsPage,
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
  accountRoute.addChildren([sitesRoute]),
  siteRoute.addChildren([
    siteTabsRoute.addChildren([siteIndexRoute, pagesRoute, articlesRoute, snapshotsRoute]),
    pageEditorRoute,
    articleEditorRoute,
  ]),
]);

export function createStudioRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient }, defaultPreload: "intent" });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createStudioRouter>;
  }
}
