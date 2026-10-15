/** RFC-0019 §2: the article editor's "Corrections" card. */
import type { ContentEntry } from "@cloudhal/core-contracts";
import { TooltipProvider } from "@cloudhal/ui";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleCorrectionsCard } from "../src/components/ArticleCorrections.tsx";
import { I18nProvider } from "../src/i18n/index.tsx";
import { entry } from "./taxonomy-fixtures.ts";

afterEach(cleanup);

const published = entry({
  status: "published",
  publishedAt: "2026-10-08T08:00:00Z",
  corrections: [
    { id: "crx_old000001", kind: "correction", at: "2026-10-09T08:00:00Z", note: "Old note." },
    { id: "crx_new000001", kind: "update", at: "2026-10-10T08:00:00Z", note: "Newer note." },
  ],
});

function Harness({ start, spy }: { start: ContentEntry; spy: (e: ContentEntry) => void }) {
  const [draft, setDraft] = useState(start);
  return (
    <ArticleCorrectionsCard
      entry={draft}
      onChange={(next) => {
        spy(next);
        setDraft(next);
      }}
    />
  );
}

const mount = (start: ContentEntry, spy = vi.fn()) =>
  render(
    <I18nProvider initialLocale="en">
      <TooltipProvider>
        <Harness start={start} spy={spy} />
      </TooltipProvider>
    </I18nProvider>,
  );

describe("ArticleCorrectionsCard", () => {
  it("is absent for an article that was never published", () => {
    mount(entry());
    expect(screen.queryByTestId("article-corrections-card")).toBeNull();
  });

  it("lists saved corrections newest first, without a remove button", () => {
    mount(published);
    const list = screen.getByRole("list", { name: "Corrections" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Newer note."),
      expect.stringContaining("Old note."),
    ]);
    expect(within(list).queryByRole("button", { name: "Remove correction" })).toBeNull();
  });

  it("appends a new one to the draft without an id or time, and can take it out again", () => {
    const spy = vi.fn();
    mount(published, spy);
    const add = screen.getByRole("button", { name: "Add correction" });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("What changed"), {
      target: { value: "  The mayor's name was misspelled.  " },
    });
    fireEvent.click(add);
    const sent = spy.mock.calls.at(-1)?.[0] as ContentEntry;
    expect(sent.corrections?.at(-1)).toEqual({
      kind: "correction",
      note: "The mayor's name was misspelled.",
    });
    const list = screen.getByRole("list", { name: "Corrections" });
    expect(within(list).getAllByRole("listitem")[0]?.textContent).toContain("Not saved");
    expect(screen.getByText(/goes live with the next publish/)).toBeTruthy();
    fireEvent.click(within(list).getByRole("button", { name: "Remove correction" }));
    const last = spy.mock.calls.at(-1)?.[0] as ContentEntry | undefined;
    expect(last?.corrections).toHaveLength(2);
  });
});
