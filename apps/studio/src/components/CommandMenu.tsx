import { CommandPalette } from "@cloudhal/ui";
import { useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import type { PaletteCommand } from "./AppFrame.tsx";

/**
 * The command palette (⌘K, `/`; DESIGN.md §1 "Top bar"): Kumo's `CommandPalette` over the surface's
 * commands, filtered as the person types. Loaded with its first opening (or a hover on the search
 * button), so the shell's chunk carries only the shortcut and the button.
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
  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <CommandPalette.Root
      open={open}
      onOpenChange={onOpenChange}
      items={filtered}
      value={query}
      onValueChange={setQuery}
      itemToStringValue={(c: PaletteCommand) => c.label}
      onSelect={(c: PaletteCommand) => {
        onOpenChange(false);
        setQuery("");
        void c.run();
      }}
    >
      <CommandPalette.Input placeholder={t("commands.placeholder")} />
      <CommandPalette.List>
        {filtered.map((c) => (
          <CommandPalette.Item key={c.id} value={c}>
            {c.label}
          </CommandPalette.Item>
        ))}
        <CommandPalette.Empty>{t("commands.empty")}</CommandPalette.Empty>
      </CommandPalette.List>
    </CommandPalette.Root>
  );
}
