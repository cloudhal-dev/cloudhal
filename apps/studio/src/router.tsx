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

/**
 * Screens load on demand (one chunk each); the shells above stay in the main bundle so the frame
 * renders immediately. `defaultPreload: "intent"` fetches a screen's chunk on hover/focus.
 */
const AccountPage = lazyRouteComponent(() => import("./routes/AccountPage.tsx"), "AccountPage");
const ActivityPage = lazyRouteComponent(() => import("./routes/ActivityPage.tsx"), "ActivityPage");
const AgentsPage = lazyRouteComponent(() => import("./routes/AgentsPage.tsx"), "AgentsPage");
const ApprovalsPage = lazyRouteComponent(
  () => import("./routes/ApprovalsPage.tsx"),
  "ApprovalsPage",
);
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
const TaxonomyPage = lazyRouteComponent(() => import("./routes/TaxonomyPage.tsx"), "TaxonomyPage");
const TermEditorPage = lazyRouteComponent(
  () => import("./routes/TermEditorPage.tsx"),
  "TermEditorPage",
);
const NavigationPage = lazyRouteComponent(
  () => import("./routes/NavigationPage.tsx"),
  "NavigationPage",
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
const siteIndexRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/",
  component: SiteOverviewPage,
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
/** Site › Settings › Redirects. */
const redirectsRoute = createRoute({
  getParentRoute: () => siteRoute,
  path: "/redirects",
  component: RedirectsPage,
});
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
    siteIndexRoute,
    pagesRoute,
    articlesRoute,
    snapshotsRoute,
    activityRoute,
    approvalsRoute,
    siteSettingsRoute,
    pageEditorRoute,
    articleEditorRoute,
    taxonomyRoute,
    termEditorRoute,
    redirectsRoute,
    navigationRoute,
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
