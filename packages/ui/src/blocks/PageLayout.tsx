import { cn, LinkButton, type TabsItem } from "@cloudflare/kumo";
import { BookOpen } from "@phosphor-icons/react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PageHeader } from "./kumo/page-header/page-header.tsx";
import { ResourceHeader, type ResourceMode } from "./ResourceHeader.tsx";

/**
 * The page anatomy every admin screen shares (DESIGN.md §1–2): breadcrumbs in the app's top bar,
 * one content container, Kumo's `PageHeader` (title, description, actions, sub-view tabs), then
 * the body — one column, or main + a sticky side column (the `ResourceListPage` layout). In
 * resource mode (`resource`, DESIGN.md §2 `resource`) a tab bar takes the header's place.
 *
 * Screens never build their own container, header or columns; they pass content to `PageLayout`
 * (and split a body with `Columns`, which reads this container's width).
 */

interface PageFrame {
  crumbsSlot: HTMLElement | null;
  setCrumbsSlot: (el: HTMLElement | null) => void;
  /** The element that scrolls the page (the app shell's content column), for scrollspy and jumps. */
  scrollRoot: HTMLElement | null;
  setScrollRoot: (el: HTMLElement | null) => void;
}

const PageFrameContext = createContext<PageFrame | null>(null);

/** Wraps the app shell so pages can render their breadcrumbs into the top bar. */
export function PageFrameProvider({ children }: { children: ReactNode }) {
  const [crumbsSlot, setSlot] = useState<HTMLElement | null>(null);
  const [scrollRoot, setRoot] = useState<HTMLElement | null>(null);
  const setCrumbsSlot = useCallback((el: HTMLElement | null) => setSlot(el), []);
  const setScrollRoot = useCallback((el: HTMLElement | null) => setRoot(el), []);
  const value = useMemo(
    () => ({ crumbsSlot, setCrumbsSlot, scrollRoot, setScrollRoot }),
    [crumbsSlot, setCrumbsSlot, scrollRoot, setScrollRoot],
  );
  return <PageFrameContext.Provider value={value}>{children}</PageFrameContext.Provider>;
}

/**
 * Ref callback for the element that scrolls the page — the shell's content column, which scrolls on
 * its own while the sidebar and the top bar stay put (DESIGN.md §1).
 */
export function usePageScrollRootRef(): (el: HTMLElement | null) => void {
  const frame = useContext(PageFrameContext);
  return frame?.setScrollRoot ?? noop;
}

/** The element that scrolls the page, or `null` outside the shell (the document scrolls then). */
export function usePageScrollRoot(): HTMLElement | null {
  return useContext(PageFrameContext)?.scrollRoot ?? null;
}

function noop() {}

/** Where the current page's `crumbs` appear: the left side of the top bar (Kumo `Breadcrumbs` are `h-12`, like the bar). */
export function PageCrumbsSlot({ className }: { className?: string }) {
  const frame = useContext(PageFrameContext);
  return <div ref={frame?.setCrumbsSlot} className={cn("flex min-w-0 items-center", className)} />;
}

export type PageWidth = "default" | "narrow";

export interface PageLayoutProps {
  /** Kumo `Breadcrumbs`; rendered in the top bar (inline above the header outside a frame). */
  crumbs?: ReactNode;
  /** Page title; `undefined` with `loading` shows a skeleton. */
  title?: ReactNode;
  description?: ReactNode;
  /** 24px Phosphor icon before the title (top-level list pages). */
  icon?: ReactNode;
  loading?: boolean;
  /** Page-level actions, right of the title (the primary "Create …" button lives here, last). */
  actions?: ReactNode;
  /** A "View docs" pill after the title (list pages): where it links, with `docsLabel`. */
  docsHref?: string;
  /** The pill's word ("View docs"), from the screen's catalog. */
  docsLabel?: string;
  /**
   * Resource mode: one resource's detail page, laid out like the dashboard's Worker page. The
   * crumbs (and an optional environment `switcher`) stay in the top bar, the resource's tabs sit
   * under it with `actions` on the right, and there is no large title: `title` becomes the page's
   * visually hidden `h1`. `tabs` and `description` are not used in this mode.
   */
  resource?: ResourceMode;
  /** Sub-views of this page only — never a copy of the sidebar. */
  tabs?: TabsItem[];
  tab?: string;
  onTabChange?: (value: string) => void;
  /** Side column (usage, help, status): 380px and sticky once the content is ≥ 64rem wide (container query), below the main column before that. */
  aside?: ReactNode;
  /** `narrow` caps the page at 960px (forms, auth-adjacent screens). */
  width?: PageWidth;
  className?: string;
  children?: ReactNode;
}

const WIDTH: Record<PageWidth, string> = {
  default: "max-w-[1400px]",
  narrow: "max-w-[960px]",
};

export function PageLayout({
  crumbs,
  title,
  description,
  icon,
  loading,
  actions,
  docsHref,
  docsLabel,
  resource,
  tabs,
  tab,
  onTabChange,
  aside,
  width = "default",
  className,
  children,
}: PageLayoutProps) {
  const frame = useContext(PageFrameContext);
  // In resource mode the environment switcher follows the crumbs in the top bar.
  const top =
    resource?.switcher && crumbs ? (
      <div className="flex min-w-0 items-center gap-2">
        {crumbs}
        {resource.switcher}
      </div>
    ) : (
      (crumbs ?? resource?.switcher)
    );
  const portaled = top && frame?.crumbsSlot ? createPortal(top, frame.crumbsSlot) : null;
  const hasHeader = title !== undefined || loading || description || actions || tabs;
  const docs =
    docsHref && docsLabel ? (
      <LinkButton
        href={docsHref}
        size="xs"
        variant="outline"
        icon={<BookOpen size={14} />}
        className="rounded-full"
      >
        {docsLabel}
      </LinkButton>
    ) : undefined;
  return (
    <div
      className={cn(
        "@container/page mx-auto flex w-full min-w-0 flex-col gap-6 px-4 py-6 sm:px-6 md:px-8 md:py-8 lg:px-10",
        WIDTH[width],
        className,
      )}
    >
      {portaled}
      {top && !frame && <div className="-mt-2">{top}</div>}
      {resource ? (
        <ResourceHeader title={title} actions={actions} resource={resource} />
      ) : (
        hasHeader && (
          <PageHeader
            title={title}
            description={description}
            icon={icon}
            loading={loading}
            actions={actions}
            docs={docs}
            {...(tabs ? { tabs, tab, onValueChange: onTabChange } : {})}
          />
        )
      )}
      {aside ? (
        <div className="flex flex-col gap-6 @5xl/page:flex-row @5xl/page:items-start @5xl/page:gap-8">
          <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
          <aside className="flex w-full shrink-0 flex-col gap-4 @5xl/page:sticky @5xl/page:top-20 @5xl/page:w-[380px]">
            {aside}
          </aside>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      )}
    </div>
  );
}
