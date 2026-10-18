/**
 * The command palette (DESIGN.md §1 "Top bar"): a click, Enter on the highlighted item, or ↓ then
 * Enter runs the command and closes the palette; matching folds case and Turkish letters.
 */
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaletteCommand } from "../src/components/AppFrame.tsx";
import { CommandMenu } from "../src/components/CommandMenu.tsx";
import { matchCommands } from "../src/lib/command-match.ts";
import { wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function palette(search?: Parameters<typeof CommandMenu>[0]["search"]) {
  const ran: string[] = [];
  const commands: PaletteCommand[] = [
    { id: "articles", label: "Go to articles", run: () => void ran.push("articles") },
    { id: "new-article", label: "New article", run: () => void ran.push("new-article") },
    { id: "media", label: "Go to media", run: () => void ran.push("media") },
  ];
  const onOpenChange = vi.fn();
  render(
    wrap(<CommandMenu open onOpenChange={onOpenChange} commands={commands} search={search} />),
  );
  return { ran, onOpenChange, input: screen.getByRole("combobox") };
}

describe("CommandMenu", () => {
  it("runs a command on click and closes", async () => {
    const { ran, onOpenChange } = palette();
    fireEvent.click(await screen.findByRole("option", { name: "Go to media" }));
    expect(ran).toEqual(["media"]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("runs the highlighted command on Enter", async () => {
    const { ran, onOpenChange, input } = palette();
    fireEvent.change(input, { target: { value: "art" } });
    await waitFor(() => expect(screen.queryByRole("option", { name: "Go to media" })).toBeNull());
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(ran).toEqual(["articles"]));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("moves with ↓ before Enter", async () => {
    const { ran, input } = palette();
    fireEvent.change(input, { target: { value: "art" } });
    await waitFor(() => expect(screen.queryByRole("option", { name: "Go to media" })).toBeNull());
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(ran).toEqual(["new-article"]));
  });
});

describe("CommandMenu on a site (RFC-0029 §7)", () => {
  const hits = [
    {
      kind: "entry",
      id: "entry_000001",
      title: "Articles about art",
      detail: "/posts/art",
      context: "posts",
      status: "draft",
    },
    { kind: "page", id: "page_0000001", title: "Art desk", detail: "/art" },
  ];

  it("groups commands and the site's content, and opens a hit", async () => {
    const fetch = vi.fn(
      async (_url: string) => new Response(JSON.stringify({ query: "art", hits })),
    );
    vi.stubGlobal("fetch", fetch);
    const open = vi.fn();
    const { input, onOpenChange } = palette({ siteId: "site_000001", open });
    fireEvent.change(input, { target: { value: "art" } });
    const page = await screen.findByRole("option", { name: /Art desk/ });
    expect(String(fetch.mock.calls[0]?.[0])).toBe("/api/sites/site_000001/search?q=art");
    // the commands first, then one group per kind, in order
    const groups = screen.getAllByRole("group").map((g) => g.textContent ?? "");
    expect(groups[0]).toMatch(/^Commands/);
    expect(groups[1]).toMatch(/^Articles/);
    expect(groups[2]).toMatch(/^Pages/);
    // a draft says so next to where it lives
    const article = screen.getByRole("option", { name: /Articles about art/ });
    expect(within(article).getByText("Draft")).toBeTruthy();
    fireEvent.click(page);
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "page", id: "page_0000001" }),
      false,
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks the server only from two letters on", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ query: "a", hits: [] })));
    vi.stubGlobal("fetch", fetch);
    const { input } = palette({ siteId: "site_000001", open: vi.fn() });
    fireEvent.change(input, { target: { value: "a" } });
    await new Promise((r) => setTimeout(r, 250));
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Search content or run a command…")).toBeTruthy();
  });
});

describe("the site's palette commands", () => {
  // run from apps/studio, like the rest of the suite
  it("go to every site screen, media and comments included (DESIGN.md §2, §2v)", () => {
    const text = readFileSync("src/components/useSitePalette.ts", "utf8");
    for (const key of ["goMedia", "goComments", "goSchedules", "newSchedule", "goRedirects"])
      expect(text).toContain(`commands.${key}`);
  });
});

describe("matchCommands", () => {
  const commands = [{ label: "Yayınla" }, { label: "İçeriğe git" }, { label: "Go to articles" }];
  it("needs every word, folding case and Turkish letters", () => {
    expect(matchCommands(commands, "yayin")).toEqual([{ label: "Yayınla" }]);
    expect(matchCommands(commands, "ICERIGE")).toEqual([{ label: "İçeriğe git" }]);
    expect(matchCommands(commands, "go art")).toEqual([{ label: "Go to articles" }]);
    expect(matchCommands(commands, "go media")).toEqual([]);
    expect(matchCommands(commands, "  ")).toHaveLength(3);
  });
});
