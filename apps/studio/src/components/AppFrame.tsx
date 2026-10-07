import { Button, CommandPalette, DropdownMenu, Sidebar, Text } from "@cloudhal/ui";
import {
  CaretUpDown,
  MagnifyingGlass,
  SignOut,
  SquaresFour,
  UserCircle,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { authClient } from "../lib/auth.ts";
import { LanguageSwitch } from "./LanguageSwitch.tsx";

export interface PaletteCommand {
  id: string;
  label: string;
  run: () => void | Promise<void>;
}

/**
 * The dashboard shell (DESIGN.md §1, §3): Kumo Sidebar with a surface switcher in the header,
 * capability-named groups, user menu + trigger in the footer, a slim sticky top bar with search
 * (⌘K, `/`) and the content container. Sidebar contents come from the caller (account vs site).
 */
export function AppFrame({
  title,
  switcher,
  nav,
  commands,
  children,
}: {
  title: string;
  switcher: ReactNode;
  nav: ReactNode;
  commands: PaletteCommand[];
  children: ReactNode;
}) {
  const t = useT();
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));
  const signOut = async () => {
    await authClient.signOut();
    await navigate({ to: "/login" });
  };

  return (
    <Sidebar.Provider defaultOpen collapsible="icon" peekable mobileBreakpoint={768}>
      <Sidebar>
        <Sidebar.Header>{switcher}</Sidebar.Header>
        <Sidebar.Content>{nav}</Sidebar.Content>
        <Sidebar.Footer>
          <Sidebar.Menu>
            <DropdownMenu>
              <DropdownMenu.Trigger
                render={
                  <Sidebar.MenuButton
                    icon={UserCircle}
                    tooltip={me.data?.actor.name ?? t("nav.account")}
                  />
                }
              >
                <span className="truncate">{me.data?.actor.name ?? t("nav.account")}</span>
                <CaretUpDown className="ml-auto size-4 text-kumo-subtle" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content side="top" align="start" className="w-(--anchor-width)">
                <DropdownMenu.Item icon={SignOut} onClick={signOut}>
                  {t("common.signOut")}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          </Sidebar.Menu>
        </Sidebar.Footer>
        <Sidebar.Rail />
      </Sidebar>
      <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-kumo-overlay">
        <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-kumo-hairline border-b bg-kumo-canvas px-3">
          <Sidebar.Trigger aria-label={t("nav.toggleSidebar")} />
          <span className="hidden min-w-0 truncate sm:inline">
            <Text variant="secondary" size="sm" as="span">
              {title}
            </Text>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<MagnifyingGlass />}
              onClick={() => setOpen(true)}
              className="w-64 justify-start text-kumo-subtle"
            >
              <span className="flex-1 text-left">{t("nav.search")}</span>
              <kbd className="rounded bg-kumo-recessed px-1 font-mono text-kumo-subtle text-xs">
                {t("nav.shortcutHint")}
              </kbd>
            </Button>
            <LanguageSwitch size="xs" />
            <DropdownMenu>
              <DropdownMenu.Trigger
                render={
                  <Button variant="ghost" size="sm" shape="square" aria-label={t("nav.account")} />
                }
              >
                <UserCircle size={20} />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                <DropdownMenu.Item icon={SquaresFour} onClick={() => navigate({ to: "/sites" })}>
                  {t("nav.allSites")}
                </DropdownMenu.Item>
                <DropdownMenu.Item icon={SignOut} onClick={signOut}>
                  {t("common.signOut")}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <CommandPalette.Root
        open={open}
        onOpenChange={setOpen}
        items={filtered}
        value={query}
        onValueChange={setQuery}
        itemToStringValue={(c: PaletteCommand) => c.label}
        onSelect={(c: PaletteCommand) => {
          setOpen(false);
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
    </Sidebar.Provider>
  );
}

/** Container for page content (DESIGN.md §1). */
export function Content({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6 md:p-8 lg:px-10 lg:py-9">
      {children}
    </div>
  );
}
