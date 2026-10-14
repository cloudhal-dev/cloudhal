import type { ContentEntry, Page } from "@cloudhal/core-contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NodeTextChanges } from "../src/components/BodyChanges.tsx";
import { I18nProvider } from "../src/i18n/index.tsx";

afterEach(cleanup);

const entry = (title: string, body: string) =>
  ({
    schemaVersion: 1,
    id: "entry_1",
    siteId: "site_1",
    collection: "posts",
    slug: "one",
    locale: "en",
    status: "draft",
    title,
    body: { format: "markdown", value: body },
    fields: {},
    tags: [],
    rev: 1,
    createdAt: "2026-10-14T00:00:00Z",
    updatedAt: "2026-10-14T00:00:00Z",
  }) as unknown as ContentEntry;

it("shows an article's title and body changes block by block", () => {
  const { container } = render(
    <I18nProvider>
      <NodeTextChanges
        before={entry("Old title", "Intro.\n\nA typo herre.\n")}
        after={entry("New title", "Intro.\n\nA typo here.\n\n## Added section\n")}
      />
    </I18nProvider>,
  );
  expect(screen.getByText("Old title")).toBeInTheDocument();
  expect(screen.getByText("New title")).toBeInTheDocument();
  expect(screen.getByText("Body")).toBeInTheDocument();
  expect(container.querySelector('[data-change="changed"] del')?.textContent).toContain("herre.");
  expect(container.querySelector('ins[data-change="added"]')?.textContent).toContain(
    "## Added section",
  );
  expect(screen.getByRole("button", { name: "1 unchanged block" })).toBeInTheDocument();
});

it("lists a page's section changes and diffs its rich text", () => {
  const page = (sections: Page["sections"]) =>
    ({
      schemaVersion: 1,
      id: "page_1",
      siteId: "site_1",
      path: "/about",
      title: "About",
      locale: "en",
      status: "draft",
      sections,
      rev: 1,
      createdAt: "2026-10-14T00:00:00Z",
      updatedAt: "2026-10-14T00:00:00Z",
    }) as unknown as Page;
  const text = (body: string) =>
    ({ id: "sec_text", kind: "richText", format: "markdown", body }) as Page["sections"][number];
  const hero = { id: "sec_hero", kind: "hero", heading: "Hi" } as Page["sections"][number];
  const { container } = render(
    <I18nProvider>
      <NodeTextChanges
        before={page([text("Old words.")])}
        after={page([hero, text("New words.")])}
      />
    </I18nProvider>,
  );
  expect(screen.getByText("Hero section")).toBeInTheDocument();
  expect(screen.getByText("Added")).toBeInTheDocument();
  expect(screen.getByText("Rich text section")).toBeInTheDocument();
  expect(container.querySelector('[data-change="changed"] ins')?.textContent).toContain("New");
});

it("says when only settings changed", () => {
  render(
    <I18nProvider>
      <NodeTextChanges before={entry("Same", "Same.\n")} after={entry("Same", "Same.\n")} />
    </I18nProvider>,
  );
  expect(screen.getByText("Only settings changed; the text is the same.")).toBeInTheDocument();
});
