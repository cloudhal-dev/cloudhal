import type { Snapshot } from "@cloudhal/core-contracts";
import { TooltipProvider } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SnapshotDiffDialog } from "../src/components/SnapshotDiffDialog.tsx";
import { I18nProvider } from "../src/i18n/index.tsx";
import {
  CATEGORY,
  entry,
  JS,
  LLM,
  NEWS,
  redirect,
  serve,
  taxonomyRoutes,
} from "./taxonomy-fixtures.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ref = (id: string, kind: string, rev: number) => ({ id, kind, rev, hash: `h${rev}` });

it("names taxonomies, terms and redirects, and shows each article's term changes", async () => {
  const snap: Snapshot = {
    schemaVersion: 1,
    id: "snap_2",
    siteId: "site_1",
    parentId: "snap_1",
    siteRev: 1,
    reason: "manual",
    label: "merge_terms by Halil",
    actor: { kind: "human", id: "user_1" },
    nodes: [],
    summary: { added: 1, changed: 3, removed: 0 },
    createdAt: "2026-10-08T09:00:00Z",
  } as Snapshot;
  serve(
    taxonomyRoutes({
      "/api/sites/site_1/entries": [entry({ title: "Model roundup" })],
      "/api/sites/site_1/redirects": [redirect()],
      "/api/sites/site_1/snapshots/snap_1/diff/snap_2?assignments=1": {
        added: [ref("redir_1", "redirect", 0)],
        removed: [],
        changed: [
          { before: ref(CATEGORY.id, "taxonomy", 0), after: ref(CATEGORY.id, "taxonomy", 1) },
          { before: ref(JS.id, "term", 1), after: ref(JS.id, "term", 2) },
          { before: ref("entry_1", "contentEntry", 3), after: ref("entry_1", "contentEntry", 4) },
        ],
        assignments: [
          { entryId: "entry_1", taxonomy: "tag", added: [JS.id], removed: [LLM.id] },
          {
            entryId: "entry_1",
            taxonomy: "category",
            added: [],
            removed: [],
            primary: { from: null, to: NEWS.id },
          },
        ],
      },
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <I18nProvider initialLocale="en">
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <SnapshotDiffDialog
            siteId="site_1"
            snapshot={snap}
            publishedSnapshotId={undefined}
            onOpenChange={() => {}}
          />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nProvider>,
  );
  const row = (id: string) => document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;
  await waitFor(() => expect(row(JS.id)).toHaveTextContent("JavaScript"));
  expect(row(JS.id)).toHaveTextContent("/tag/javascript");
  await waitFor(() => expect(row(CATEGORY.id)).toHaveTextContent("Categories"));
  await waitFor(() => expect(row("redir_1")).toHaveTextContent("/tag/js → /tag/javascript"));
  const deltas = await screen.findByTestId("assignment-deltas");
  expect(deltas).toHaveTextContent("+ tag JavaScript");
  expect(deltas).toHaveTextContent("− tag LLM");
  expect(deltas).toHaveTextContent("Primary category → News");
});
