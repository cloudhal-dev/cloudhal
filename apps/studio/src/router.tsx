import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { authClient } from "./lib/auth.ts";
import { ArticleEditorPage } from "./routes/ArticleEditorPage.tsx";
import { ArticlesPage } from "./routes/ArticlesPage.tsx";
import { LoginPage } from "./routes/LoginPage.tsx";
import { PageEditorPage } from "./routes/PageEditorPage.tsx";
import { SiteOverviewPage } from "./routes/SiteOverviewPage.tsx";
import { SiteShell } from "./routes/SiteShell.tsx";
import { SitesPage } from "./routes/SitesPage.tsx";
import { SnapshotsPage } from "./routes/SnapshotsPage.tsx";

export interface RouterContext {
  queryClient: QueryClient;
}

async function requireSession() {
  const { data } = await authClient.getSession();
  if (!data) throw redirect({ to: "/login" });
  return data;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});

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

const sitesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sites",
  beforeLoad: requireSession,
  component: SitesPage,
});

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
const pageEditorRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/pages/$pageId",
  component: PageEditorPage,
});
const articlesRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/articles",
  component: ArticlesPage,
});
const articleEditorRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/articles/$entryId",
  component: ArticleEditorPage,
});
const snapshotsRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/snapshots",
  component: SnapshotsPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  indexRoute,
  sitesRoute,
  siteRoute.addChildren([
    siteIndexRoute,
    pageEditorRoute,
    articlesRoute,
    articleEditorRoute,
    snapshotsRoute,
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
