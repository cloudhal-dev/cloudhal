import { CommandPalette } from "@cloudhal/ui";
import { useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { matchCommands } from "../lib/command-match.ts";
import type { PaletteCommand } from "./AppFrame.tsx";

/**
 * The command palette (⌘K, `/`; DESIGN.md §1 "Top bar"): Kumo's `CommandPalette` over the surface's
 * commands, filtered as the person types. Loaded with its first opening (or a hover on the search
 * button), so the shell's chunk carries only the shortcut and the button.
 *
 * Kumo selects through each item's `onClick` (a click, or Enter on the highlighted item); the
 * root's `onSelect` fires only for ⌘/Ctrl+Enter and needs `getSelectableItems`. Items render
 * through `CommandPalette.Results`, the autocomplete list that highlights and moves with ↑↓.
 */
export function CommandMenu({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: PaletteCommand[];
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const filtered = matchCommands(commands, query);
  // Every way out clears the query, so the next opening starts empty.
  const setOpen = (next: boolean) => {
    if (!next) setQuery("");
    onOpenChange(next);
  };
  const run = (c: PaletteCommand) => {
    setOpen(false);
    void c.run();
  };
  return (
    <CommandPalette.Root
      open={open}
      onOpenChange={setOpen}
      items={filtered}
      value={query}
      onValueChange={setQuery}
      itemToStringValue={(c: PaletteCommand) => c.label}
      getSelectableItems={(items: PaletteCommand[]) => items}
      onSelect={(c: PaletteCommand) => run(c)}
    >
      <CommandPalette.Input placeholder={t("commands.placeholder")} />
      <CommandPalette.List>
        <CommandPalette.Results>
          {(c: PaletteCommand) => (
            <CommandPalette.Item key={c.id} value={c} onClick={() => run(c)}>
              {c.label}
            </CommandPalette.Item>
          )}
        </CommandPalette.Results>
        <CommandPalette.Empty>{t("commands.empty")}</CommandPalette.Empty>
      </CommandPalette.List>
      <CommandPalette.Footer>
        <span className="flex items-center gap-3">
          <KeyHint keys="↑↓" label={t("commands.hintNavigate")} />
          <KeyHint keys="↵" label={t("commands.hintSelect")} />
        </span>
        <KeyHint keys="esc" label={t("commands.hintClose")} />
      </CommandPalette.Footer>
    </CommandPalette.Root>
  );
}

function KeyHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="rounded bg-kumo-recessed px-1 font-mono text-kumo-subtle text-xs">{keys}</kbd>
      <span>{label}</span>
    </span>
  );
}
