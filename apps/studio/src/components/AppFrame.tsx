import {
  Button,
  CommandPalette,
  DropdownMenu,
  PageCrumbsSlot,
  PageFrameProvider,
  Sidebar,
  Text,
  usePageScrollRootRef,
} from "@cloudhal/ui";
import {
  MagnifyingGlass,
  SignOut,
  SquaresFour,
  Translate,
  UserCircle,
  UserGear,
  UsersThree,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { LOCALES, type Locale, useI18n } from "../i18n/index.tsx";
import { authClient } from "../lib/auth.ts";
import { setThemePreference, THEME_PREFERENCES, useThemePreference } from "../lib/theme.ts";
import { LanguageSwitch } from "./LanguageSwitch.tsx";
import { NotificationsBell } from "./NotificationsBell.tsx";
import { RoleBadge } from "./Roles.tsx";
import { ThemeRadioItems, ThemeSwitch, themeIcon } from "./ThemeSwitch.tsx";
import { useMe } from "./useMe.ts";

export interface PaletteCommand {
  id: string;
  label: string;
  run: () => void | Promise<void>;
}

/**
 * The dashboard shell (DESIGN.md §1, §3), composed the way Kumo's own Sidebar demos do it:
 * switcher in `Sidebar.Header`, nav in `Sidebar.Content` (or `Sidebar.Loading` until data is
 * ready), user menu + `Sidebar.Trigger` in `Sidebar.Footer`, `Sidebar.Rail` for drag/peek, and
 * a slim sticky top bar: the page's breadcrumbs (Kumo `Breadcrumbs` are `h-12`, like the bar),
 * search (⌘K, `/`), the surface's actions (site: Publish), the notification bell and the language.
 */
export function AppFrame(props: AppFrameProps) {
  return (
    <PageFrameProvider>
      <AppFrameShell {...props} />
    </PageFrameProvider>
  );
}

interface AppFrameProps {
  /** Surface-wide actions on the right of the top bar (the site surface's Publish). */
  actions?: ReactNode;
  switcher: ReactNode;
  nav: ReactNode;
  loading?: boolean;
  commands: PaletteCommand[];
  children: ReactNode;
}

function AppFrameShell({
  actions,
  switcher,
  nav,
  loading = false,
  commands,
  children,
}: AppFrameProps) {
  const { t, locale, setLocale } = useI18n();
  const scrollRootRef = usePageScrollRootRef();
  const [theme] = useThemePreference();
  const navigate = useNavigate();
  const me = useMe();
  const role = me.data?.role ?? undefined;
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

  // Every surface can switch the theme from the palette too ("Theme: Dark").
  const allCommands: PaletteCommand[] = [
    ...commands,
    ...THEME_PREFERENCES.filter((p) => p !== theme).map((p) => ({
      id: `theme-${p}`,
      label: `${t("theme.label")}: ${t(`theme.${p}`)}`,
      run: () => setThemePreference(p),
    })),
  ];
  const filtered = allCommands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));
  const signOut = async () => {
    await authClient.signOut();
    await navigate({ to: "/login" });
  };

  return (
    // Kumo's aside element is `h-full`, so the provider needs a definite height; the content column
    // scrolls on its own and the sidebar stays viewport-tall with its footer pinned (DESIGN.md §3).
    // `h-dvh` is the visible viewport (mobile toolbars included), so the document itself never
    // scrolls: no half-hidden top bar and no empty strip once a column reaches its end.
    <Sidebar.Provider
      defaultOpen
      collapsible="icon"
      peekable
      mobileBreakpoint={768}
      className="h-dvh"
    >
      <Sidebar>
        {/* h-12 like the top bar, so the two bottom edges form one line across the window. */}
        <Sidebar.Header className="h-12">{switcher}</Sidebar.Header>
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
                  {/* Who is signed in and their staff role (RFC-0005 §10.3). The trigger keeps
                        the name alone so it never truncates to a few letters. */}
                  {role && (
                    <>
                      <div
                        className="grid min-w-44 gap-1.5 px-2 py-1.5"
                        data-testid="account-menu-role"
                      >
                        <Text size="sm" bold truncate as="span">
                          {me.data?.actor.name ?? t("nav.account")}
                        </Text>
                        <RoleBadge value={role} />
                      </div>
                      <DropdownMenu.Separator />
                    </>
                  )}
                  <DropdownMenu.Item icon={UserGear} onClick={() => navigate({ to: "/account" })}>
                    {t("nav.account")}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item icon={UsersThree} onClick={() => navigate({ to: "/team" })}>
                    {t("nav.team")}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item icon={SquaresFour} onClick={() => navigate({ to: "/sites" })}>
                    {t("nav.allSites")}
                  </DropdownMenu.Item>
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger icon={themeIcon(theme)}>
                      {t("theme.label")}
                    </DropdownMenu.SubTrigger>
                    <DropdownMenu.SubContent>
                      <ThemeRadioItems />
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Sub>
                  {/* The top bar's language select is hidden on phones; this is the way there. */}
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger icon={Translate}>
                      {t("common.language")}
                    </DropdownMenu.SubTrigger>
                    <DropdownMenu.SubContent>
                      <DropdownMenu.RadioGroup
                        value={locale}
                        onValueChange={(v: Locale) => setLocale(v)}
                      >
                        {(Object.keys(LOCALES) as Locale[]).map((l) => (
                          <DropdownMenu.RadioItem key={l} value={l}>
                            {LOCALES[l]}
                            <DropdownMenu.RadioItemIndicator />
                          </DropdownMenu.RadioItem>
                        ))}
                      </DropdownMenu.RadioGroup>
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Sub>
                  <DropdownMenu.Separator />
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
      <div
        ref={scrollRootRef}
        className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain bg-kumo-overlay"
      >
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-3 border-kumo-line border-b bg-kumo-canvas px-4">
          {/* The sidebar is a sheet below the mobile breakpoint; this is its only way in there. */}
          <span className="-ml-1 md:hidden">
            <Sidebar.Trigger />
          </span>
          <PageCrumbsSlot className="hidden flex-1 sm:flex" />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<MagnifyingGlass />}
              onClick={() => setOpen(true)}
              aria-label={t("nav.search")}
              className="justify-start text-kumo-subtle sm:w-40 lg:w-64"
            >
              <span className="hidden min-w-0 flex-1 truncate text-left sm:inline">
                {t("nav.search")}
              </span>
              <kbd className="hidden rounded bg-kumo-recessed px-1 font-mono text-kumo-subtle text-xs sm:inline">
                {t("nav.shortcutHint")}
              </kbd>
            </Button>
            {actions}
            {/* What needs the person: elevations about to end, agents asking (§2n). */}
            <NotificationsBell />
            <ThemeSwitch />
            <span className="hidden sm:flex">
              <LanguageSwitch size="sm" />
            </span>
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
