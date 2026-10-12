import {
  Button,
  PageCrumbsSlot,
  PageFrameProvider,
  Sidebar,
  usePageScrollRootRef,
  useSidebar,
} from "@cloudhal/ui";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useLocation } from "@tanstack/react-router";
import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { setThemePreference, THEME_PREFERENCES, useThemePreference } from "../lib/theme.ts";
import { LanguageSwitch } from "./LanguageSwitch.tsx";
import { NotificationsBell } from "./NotificationsBell.tsx";
import { ThemeSwitch } from "./ThemeSwitch.tsx";
import { UserMenu } from "./UserMenu.tsx";

const loadCommandMenu = () => import("./CommandMenu.tsx");
const CommandMenu = lazy(() => loadCommandMenu().then((m) => ({ default: m.CommandMenu })));

export interface PaletteCommand {
  id: string;
  label: string;
  run: () => void | Promise<void>;
}

/**
 * The dashboard shell (DESIGN.md §1, §3), composed the way Kumo's own Sidebar demos do it
 * (`SidebarFullDemo`): switcher in `Sidebar.Header`, nav in `Sidebar.Content` (or
 * `Sidebar.Loading` until data is ready), only `Sidebar.Trigger` in `Sidebar.Footer`,
 * `Sidebar.Rail` for click/peek, and a slim sticky top bar: the page's breadcrumbs (Kumo
 * `Breadcrumbs` are `h-12`, like the bar), search (⌘K, `/`), the surface's actions (site:
 * Publish), the notification bell, theme, language and the user menu.
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
  const { t } = useI18n();
  const scrollRootRef = usePageScrollRootRef();
  const [theme] = useThemePreference();
  const [open, setOpenState] = useState(false);
  // The palette's chunk loads with its first opening, then it stays mounted (open/close animate).
  const [wanted, setWanted] = useState(false);
  const setOpen = (next: boolean | ((open: boolean) => boolean)) => {
    setWanted(true);
    setOpenState(next);
  };

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
        {/* Above Sidebar.Rail (z-1, full height, inside the peek zone): it covered the collapse
            button, so hovering the button started a peek, the rail slid away with the widening
            sidebar, the peek stopped, the rail came back — the sidebar flickered under the cursor. */}
        {/* Only the trigger, as in Kumo's demos (the user menu lives in the top bar). `z-2` keeps
            it above Sidebar.Rail (z-1, full height, inside the peek zone): the rail used to cover
            the button, so hovering it started a peek, the rail slid away with the widening
            sidebar, the peek stopped, the rail came back — the sidebar flickered under the cursor. */}
        <Sidebar.Footer className="z-2">
          <Sidebar.Trigger />
        </Sidebar.Footer>
        <Sidebar.Rail />
      </Sidebar>
      <div
        ref={scrollRootRef}
        // `relative`: absolutely positioned bits inside pages (`sr-only` labels in long lists) are
        // contained by the scrolling column; with the provider as their containing block they sat
        // below the list and made the document taller than the window.
        className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain bg-kumo-overlay"
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
              onPointerEnter={() => void loadCommandMenu()}
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
            {/* Phones reach Theme and Language through the user menu. */}
            <span className="hidden sm:flex">
              <ThemeSwitch />
            </span>
            <span className="hidden sm:flex">
              <LanguageSwitch size="sm" />
            </span>
            <UserMenu />
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
        <CloseSheetOnNavigate />
      </div>
      {/* Kumo `CommandPalette` (`CommandMenu.tsx`), loaded on the first ⌘K, `/` or hover. */}
      {wanted ? (
        <Suspense fallback={null}>
          <CommandMenu open={open} onOpenChange={setOpenState} commands={allCommands} />
        </Suspense>
      ) : null}
    </Sidebar.Provider>
  );
}

/** Below the mobile breakpoint the sidebar is a sheet: choosing a page closes it (Kumo's `NavTree` demo). */
function CloseSheetOnNavigate() {
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = useLocation({ select: (l) => l.pathname });
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);
  return null;
}
