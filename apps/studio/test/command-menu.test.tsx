/**
 * The command palette (DESIGN.md §1 "Top bar"): a click, Enter on the highlighted item, or ↓ then
 * Enter runs the command and closes the palette; matching folds case and Turkish letters.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaletteCommand } from "../src/components/AppFrame.tsx";
import { CommandMenu } from "../src/components/CommandMenu.tsx";
import { matchCommands } from "../src/lib/command-match.ts";
import { wrap } from "./roles-fixtures.tsx";

afterEach(cleanup);

function palette() {
  const ran: string[] = [];
  const commands: PaletteCommand[] = [
    { id: "articles", label: "Go to articles", run: () => void ran.push("articles") },
    { id: "new-article", label: "New article", run: () => void ran.push("new-article") },
    { id: "media", label: "Go to media", run: () => void ran.push("media") },
  ];
  const onOpenChange = vi.fn();
  render(wrap(<CommandMenu open onOpenChange={onOpenChange} commands={commands} />));
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
