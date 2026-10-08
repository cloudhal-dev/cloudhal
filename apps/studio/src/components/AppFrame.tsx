import { Button, CommandPalette, DropdownMenu, Sidebar, Text } from "@cloudhal/ui";
import { MagnifyingGlass, SignOut, SquaresFour, UserCircle, UserGear } from "@phosphor-icons/react";
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
 * The dashboard shell (DESIGN.md §1, §3), composed the way Kumo's own Sidebar demos do it:
 * switcher in `Sidebar.Header`, nav in `Sidebar.Content` (or `Sidebar.Loading` until data is
 * ready), user menu + `Sidebar.Trigger` in `Sidebar.Footer`, `Sidebar.Rail` for drag/peek, and
 * a slim sticky top bar with search (⌘K, `/`).
 */
export function AppFrame({
  title,
  switcher,
  nav,
  loading = false,
  commands,
  children,
}: {
  title: string;
  switcher: ReactNode;
  nav: ReactNode;
  loading?: boolean;
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
    // Kumo's aside element is `h-full`, so the provider needs a definite height; the content column
    // scrolls on its own and the sidebar stays viewport-tall with its footer pinned (DESIGN.md §3).
    <Sidebar.Provider
      defaultOpen
      collapsible="icon"
      peekable
      mobileBreakpoint={768}
      className="h-svh"
    >
      <Sidebar>
        <Sidebar.Header>{switcher}</Sidebar.Header>
        {loading ? <Sidebar.Loading /> : <Sidebar.Content>{nav}</Sidebar.Content>}
        <Sidebar.Footer>
          <Sidebar.Menu>
            <Sidebar.MenuItem>
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
                </DropdownMenu.Trigger>
                <DropdownMenu.Content side="top" align="start" className="w-(--anchor-width)">
                  <DropdownMenu.Item icon={UserGear} onClick={() => navigate({ to: "/account" })}>
                    {t("nav.account")}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item icon={SquaresFour} onClick={() => navigate({ to: "/sites" })}>
                    {t("nav.allSites")}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item icon={SignOut} onClick={signOut}>
                    {t("common.signOut")}
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>
            </Sidebar.MenuItem>
          </Sidebar.Menu>
          <Sidebar.Trigger />
        </Sidebar.Footer>
        <Sidebar.Rail />
      </Sidebar>
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-kumo-overlay">
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-3 border-kumo-hairline border-b bg-kumo-canvas px-4">
          {/* The sidebar is a sheet below the mobile breakpoint; this is its only way in there. */}
          <span className="-ml-1 md:hidden">
            <Sidebar.Trigger />
          </span>
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
              className="w-48 justify-start text-kumo-subtle sm:w-64"
            >
              <span className="min-w-0 flex-1 truncate text-left">{t("nav.search")}</span>
              <kbd className="rounded bg-kumo-recessed px-1 font-mono text-kumo-subtle text-xs">
                {t("nav.shortcutHint")}
              </kbd>
            </Button>
            <LanguageSwitch size="xs" />
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
