/**
 * Site settings › Collections (RFC-0038 §5): one row per collection with its prefix and an entry's
 * address; saving writes `collections.<key>.permalink`, an empty field removes it, a bad prefix is
 * caught before saving and the server's path conflict shows on the row.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionSettingsSection } from "../src/components/CollectionSettings.tsx";
import {
  changedKeys,
  collectionKeys,
  prefixForm,
  validatePrefix,
  withPrefixes,
} from "../src/lib/collection-permalinks.ts";
import { asRole, bodyOf, on, type Route, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SITE = {
  schemaVersion: 1,
  id: "site_1",
  projectId: "proj_1",
  name: "Site",
  slug: "site",
  defaultLocale: "en",
  locales: ["en"],
  domains: [],
  pageIds: [],
  theme: { name: "blog" },
  rev: 4,
  createdAt: "2026-10-18T10:00:00Z",
  updatedAt: "2026-10-18T10:00:00Z",
} as unknown as Site;

const entry = (collection: string, slug: string, status = "published") =>
  ({
    id: `entry_${slug}`,
    siteId: "site_1",
    collection,
    slug,
    status,
    locale: "en",
    title: slug,
    updatedAt: "2026-10-18T10:00:00Z",
  }) as unknown as ContentEntry;

describe("collection permalinks (lib)", () => {
  it("lists configured and used collections, edits prefixes and validates like the schema", () => {
    const site = { ...SITE, collections: { docs: { permalink: "/handbook/{slug}" } } } as Site;
    const keys = collectionKeys(site, [entry("posts", "a"), entry("posts", "b")]);
    expect(keys).toEqual(["docs", "posts"]);
    expect(prefixForm(site, keys)).toEqual({ docs: "/handbook", posts: "" });
    const next = withPrefixes(site, { docs: "", posts: "/blog" });
    // RFC-0040: docs goes back to the default and stays declared.
    expect(next.collections).toEqual({ docs: {}, posts: { permalink: "/blog/{slug}" } });
    // The default prefix is the same as no setting.
    expect(withPrefixes(SITE, { posts: "/posts" }).collections).toBeUndefined();
    expect(changedKeys(site, { docs: "/handbook", posts: "/blog" })).toEqual(["posts"]);
    expect(validatePrefix("")).toBeUndefined();
    expect(validatePrefix("/docs/guides")).toBeUndefined();
    expect(validatePrefix("blog")).toBe("slash");
    expect(validatePrefix("/blog/")).toBe("trailingSlash");
    expect(validatePrefix("/Blog")).toBe("invalid");
    expect(validatePrefix("/blog/{slug}")).toBe("invalid");
  });
});

describe("Collection settings", () => {
  const routes = (put: Parameters<typeof on>[2]) => {
    const [me] = asRole("owner");
    return serve(
      me as Route,
      on("GET", "/api/sites/site_1", { status: 200, body: SITE }),
      on("GET", "/api/sites/site_1/entries", {
        status: 200,
        body: [entry("posts", "hello-world")],
      }),
      on("PUT", "/api/sites/site_1", put),
    );
  };

  it("previews an entry's address and saves /blog as the posts permalink", async () => {
    const fetch = routes((init) => ({ status: 200, body: JSON.parse(String(init?.body)) }));
    render(wrap(<CollectionSettingsSection siteId="site_1" />));
    const input = await screen.findByRole("textbox", { name: "posts" });
    expect(
      screen.getByText("Entries live at addresses like /posts/hello-world"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/old addresses keep working through a permanent redirect/),
    ).toBeTruthy();
    fireEvent.change(input, { target: { value: "/blog/" } });
    expect(await screen.findByText("Leave out the slash at the end")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "/blog" } });
    expect(
      screen.getByText(
        "Entries will live at addresses like /blog/hello-world. The old address /posts/hello-world redirects there.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", "/api/sites/site_1")).toMatchObject({
        rev: 4,
        collections: { posts: { permalink: "/blog/{slug}" } },
      }),
    );
  });

  it("shows a path conflict on the row, not as a stale-site banner", async () => {
    routes({
      status: 409,
      body: {
        error: "path_conflict",
        message: 'collection "posts" at /about would cover page /about/team',
      },
    });
    render(wrap(<CollectionSettingsSection siteId="site_1" />));
    const input = await screen.findByRole("textbox", { name: "posts" });
    fireEvent.change(input, { target: { value: "/about" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("Another page or article already uses this path."),
    ).toBeInTheDocument();
    expect(screen.queryByText("This site changed somewhere else")).toBeNull();
  });
});
