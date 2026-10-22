/**
 * RFC-0040 §4 in Studio: a collection's Comments section (saved in `comment_settings`), the
 * overview's recent content across collections, and the entry editor's address under its
 * collection (with `/articles/$entryId` redirecting there).
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CollectionCommentsSection,
  collectionCommentsPatch,
  commentsOf,
} from "../src/components/CollectionCommentsSection.tsx";
import {
  RecentContentCard,
  recentEntries,
} from "../src/components/site-overview/RecentContentCard.tsx";
import { useEntryCollectionUrl } from "../src/components/useCollectionView.ts";
import type { CommentSettings } from "../src/lib/api.ts";
import { entryHref } from "../src/lib/entry-href.ts";
import { createStudioRouter } from "../src/router.tsx";
import { asRole, bodyOf, on, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const S = "/api/sites/site_1";

const SETTINGS = {
  siteId: "site_1",
  enabled: true,
  showWhenOff: true,
  collections: { posts: { enabled: true } },
  closeAfterDays: 90,
  protection: "pow",
  turnstileSiteKey: null,
  allowWithoutScript: true,
  allowWithoutScriptWithTurnstile: false,
  linkLimit: 2,
  watchWords: [],
  blockedWords: [],
  dailyCap: 1000,
  aiLabels: "off",
  retention: {
    pendingDays: 30,
    spamDays: 30,
    deletedDays: 30,
    hiddenDays: null,
    clientDataDays: 30,
    resolvedReportDays: 183,
  },
  planHint: null,
  rev: 4,
  updatedAt: null,
  updatedBy: null,
} as CommentSettings;

describe("a collection's Comments section", () => {
  const server = (role: "administrator" | "editor") =>
    serve(
      ...asRole(role),
      on("GET", `${S}/comments/settings`, {
        status: 200,
        body: { settings: SETTINGS, secrets: { "turnstile-secret": null }, canStoreSecrets: true },
      }),
      on("PUT", `${S}/comments/settings`, (init) => {
        const patch = JSON.parse(String(init?.body));
        return {
          status: 200,
          body: { settings: { ...SETTINGS, ...patch, rev: 5 }, purge: "none" },
        };
      }),
    );

  it("keeps the other collections and closes after its own days", () => {
    expect(commentsOf(SETTINGS, "events")).toEqual({ enabled: false });
    expect(
      collectionCommentsPatch(SETTINGS, "events", { enabled: true, closeAfterDays: 30 }),
    ).toEqual({
      collections: { posts: { enabled: true }, events: { enabled: true, closeAfterDays: 30 } },
    });
  });

  it("turns comments on for the collection through comment_settings, with rev", async () => {
    const fetch = server("administrator");
    render(wrap(<CollectionCommentsSection siteId="site_1" collection="events" />));
    const toggle = await screen.findByRole("switch", { name: "Accept comments" });
    expect(toggle).not.toBeChecked();
    expect(screen.getByTestId("collection-comments-save")).toBeDisabled();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId("collection-comments-save"));
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", `${S}/comments/settings`)).toEqual({
        rev: 4,
        collections: { posts: { enabled: true }, events: { enabled: true } },
      }),
    );
    expect(await screen.findByText("Comment settings saved")).toBeInTheDocument();
    // Nothing is written on the collection (the site's collections PUT).
    expect(fetch.mock.calls.some(([u]) => String(u).includes("/collections/"))).toBe(false);
  });

  it("is read-only for someone who may not change comment settings", async () => {
    server("editor");
    render(wrap(<CollectionCommentsSection siteId="site_1" collection="posts" />));
    const toggle = await screen.findByRole("switch", { name: "Accept comments" });
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();
    expect(screen.getByTestId("collection-comments-save")).toBeDisabled();
  });
});

const entry = (collection: string, id: string, updatedAt: string) =>
  ({
    id,
    siteId: "site_1",
    collection,
    slug: id,
    status: "draft",
    locale: "en",
    title: `Title ${id}`,
    updatedAt,
  }) as unknown as ContentEntry;

describe("overview: recent content", () => {
  const SITE = {
    id: "site_1",
    defaultLocale: "en",
    locales: ["en"],
    collections: { events: { labels: { en: { singular: "Event", plural: "Events" } } } },
  } as unknown as Site;

  it("lists the newest entries of every collection, with the collection and its editor", async () => {
    const fetch = serve(
      on("GET", `${S}/collections`, {
        status: 200,
        body: [
          { key: "posts", declared: false, settings: {}, counts: { draft: 1 } },
          { key: "events", declared: true, settings: {}, counts: { draft: 1 } },
        ],
      }),
      on("GET", `${S}/entries`, {
        status: 200,
        body: [
          entry("posts", "entry_p", "2026-10-20T10:00:00Z"),
          entry("events", "entry_e", "2026-10-21T10:00:00Z"),
        ],
      }),
    );
    render(wrap(<RecentContentCard siteId="site_1" site={SITE} />));
    const event = await screen.findByRole("link", { name: "Title entry_e" });
    expect(event).toHaveAttribute("href", "/sites/site_1/collections/events/entry_e");
    expect(screen.getByRole("link", { name: "Title entry_p" })).toHaveAttribute(
      "href",
      "/sites/site_1/collections/posts/entry_p",
    );
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => r.getAttribute("data-collection"))).toEqual(["events", "posts"]);
    expect(within(rows[0] as HTMLElement).getByText("Events")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("Articles")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute(
      "href",
      "/sites/site_1/collections",
    );
    // One request for every collection's entries, not one per collection.
    const listed = fetch.mock.calls.filter(([u]) => String(u).includes("/entries"));
    expect(listed).toHaveLength(1);
    expect(String(listed[0]?.[0])).not.toContain("collection=");
  });

  it("keeps the newest five", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      entry(i % 2 ? "events" : "posts", `entry_${i}`, `2026-10-1${i}T00:00:00Z`),
    );
    expect(recentEntries(many).map((e) => e.id)).toEqual([
      "entry_7",
      "entry_6",
      "entry_5",
      "entry_4",
      "entry_3",
    ]);
  });
});

describe("the entry editor's address", () => {
  it("lives under the collection; /articles/$entryId redirects to posts", async () => {
    expect(entryHref("s", "entry_1")).toBe("/sites/s/collections/posts/entry_1");
    expect(entryHref("s", "entry_1", "events")).toBe("/sites/s/collections/events/entry_1");
    const router = createStudioRouter(undefined as never);
    const ids = (path: string) => router.matchRoutes(path).map((m) => m.routeId);
    expect(ids("/sites/s/collections/events/entry_1").at(-1)).toBe(
      "/sites/$siteId/collections/$collection/$entryId",
    );
    expect(ids("/sites/s/collections/events/settings").at(-1)).toBe(
      "/sites/$siteId/collections/$collection/settings",
    );
    const old = router.routesById["/sites/$siteId/articles/$entryId"];
    let thrown: unknown;
    try {
      await old.options.beforeLoad?.({ params: { siteId: "s", entryId: "entry_1" } } as never);
    } catch (e) {
      thrown = e;
    }
    expect((thrown as { options?: unknown }).options).toMatchObject({
      to: "/sites/$siteId/collections/$collection/$entryId",
      params: { siteId: "s", collection: "posts", entryId: "entry_1" },
      replace: true,
    });
  });

  it("moves to the entry's own collection once it has loaded", async () => {
    function Probe() {
      const p = useParams({ strict: false }) as Record<string, string>;
      useEntryCollectionUrl(p.siteId ?? "", p.entryId ?? "", p.collection ?? "", "events");
      return <span>{p.collection}</span>;
    }
    const root = createRootRoute();
    const editor = createRoute({
      getParentRoute: () => root,
      path: "/sites/$siteId/collections/$collection/$entryId",
      component: Probe,
    });
    const router = createRouter({
      routeTree: root.addChildren([editor]),
      history: createMemoryHistory({ initialEntries: ["/sites/s/collections/posts/entry_1"] }),
    });
    render(<RouterProvider router={router as never} />);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/sites/s/collections/events/entry_1"),
    );
    expect(await screen.findByText("events")).toBeInTheDocument();
  });
});
