import { Button, cn, Text } from "@cloudflare/kumo";
import { ArrowUpRight, CaretDown, CaretUp, List } from "@phosphor-icons/react";
import { useState } from "react";

/** A shown menu item as the site renders it (`ActiveNavItem` of `@cloudhal/astro-renderer`). */
export interface NavigationPreviewItem {
  id: string;
  label: string;
  href?: string;
  external?: boolean;
  newTab?: boolean;
  /** `page`: the exact match for the previewed path; `true`: a prefix or context match. */
  current?: "page" | "true";
  /** The active item or one of its ancestors. */
  inTrail?: boolean;
  children: NavigationPreviewItem[];
}

export interface NavigationPreviewLabels {
  /** Accessible names of the two regions ("Header preview", "Footer preview"). */
  header: string;
  footer: string;
  /** The theme's own footer link when the site has no footer menu ("RSS"). */
  defaultFooter: string;
  /** The footer's credit ("Built with Cloudhal"). */
  credit: string;
  /** A menu that shows nothing ("No items are shown"). */
  empty: string;
  /** Mobile header button ("Menu"). */
  menu: string;
  /** Accessible suffix of external links that open in a new tab. */
  newTab: string;
  /** Accessible name of a dropdown toggle: "Show items under {label}". */
  toggle: (label: string) => string;
}

export interface NavigationPreviewProps {
  siteName: string;
  /** The header's shown items (a menu, or the theme's derived header). */
  header: NavigationPreviewItem[];
  /** The footer's shown items; `undefined`: the theme's default footer. */
  footer?: NavigationPreviewItem[] | undefined;
  device?: "desktop" | "mobile";
  labels: NavigationPreviewLabels;
  /** Which part the editor is changing; it is outlined. */
  focus?: "header" | "footer";
  className?: string;
}

/** How deep the blog theme renders (`NavMenu.astro`: three levels). */
const THEME_LEVELS = 3;

function ItemText({
  item,
  labels,
  strong,
}: {
  item: NavigationPreviewItem;
  labels: NavigationPreviewLabels;
  strong?: boolean;
}) {
  const current = item.current !== undefined || item.inTrail;
  return (
    <span
      aria-current={item.current}
      data-nav-item={item.id}
      className={cn(
        "inline-flex min-w-0 items-center gap-1",
        current ? "text-kumo-default" : "text-kumo-subtle",
        item.current === "page" && "underline decoration-2 underline-offset-4",
        strong && "font-medium",
      )}
    >
      <span className="break-words">{item.label}</span>
      {item.external && <ArrowUpRight size={12} aria-hidden className="shrink-0" />}
      {item.newTab && <span className="sr-only">{labels.newTab}</span>}
    </span>
  );
}

function Children({
  items,
  labels,
  level,
}: {
  items: NavigationPreviewItem[];
  labels: NavigationPreviewLabels;
  level: number;
}) {
  return (
    <div className="grid gap-1.5">
      {items.map((child) => (
        <div key={child.id} className="grid gap-1.5">
          <ItemText item={child} labels={labels} />
          {child.children.length > 0 && level + 1 <= THEME_LEVELS && (
            <div className="border-l border-kumo-hairline pl-3">
              <Children items={child.children} labels={labels} level={level + 1} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * A neutral sketch of the visitor-facing header and footer built from the menus being edited
 * (DESIGN.md §2q): top-level items in the header with dropdowns for their children (three levels,
 * as the blog theme renders), the current item underlined for the previewed path, external links
 * marked, and the footer's links next to the credit. Desktop or a phone's stacked menu. Plain
 * text only; nothing links anywhere.
 */
export function NavigationPreview({
  siteName,
  header,
  footer,
  device = "desktop",
  labels,
  focus,
  className,
}: NavigationPreviewProps) {
  const trailOpen = header.find((i) => i.inTrail && i.children.length > 0)?.id;
  const [open, setOpen] = useState<string | undefined>(undefined);
  const openId = open ?? trailOpen;
  const mobile = device === "mobile";
  const opened = header.find((i) => i.id === openId && i.children.length > 0);
  return (
    <div
      data-testid="navigation-preview"
      data-device={device}
      className={cn(
        "mx-auto grid w-full min-w-0 overflow-hidden rounded-lg bg-kumo-base ring ring-kumo-line",
        mobile && "max-w-sm",
        className,
      )}
    >
      <section
        aria-label={labels.header}
        className={cn(
          "grid gap-3 border-b border-kumo-hairline px-5 py-4",
          focus === "header" && "bg-kumo-tint",
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <Text as="span" bold>
            {siteName}
          </Text>
          {mobile ? (
            <span className="inline-flex items-center gap-1.5 text-kumo-subtle">
              <List size={16} aria-hidden />
              <Text as="span" size="sm" variant="secondary">
                {labels.menu}
              </Text>
            </span>
          ) : header.length === 0 ? (
            <Text as="span" size="sm" variant="secondary">
              {labels.empty}
            </Text>
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {header.map((item) =>
                item.children.length > 0 ? (
                  <span key={item.id} className="inline-flex items-center gap-0.5">
                    <ItemText item={item} labels={labels} />
                    <Button
                      variant="ghost"
                      size="xs"
                      shape="square"
                      aria-expanded={openId === item.id}
                      aria-label={labels.toggle(item.label)}
                      icon={openId === item.id ? <CaretUp size={10} /> : <CaretDown size={10} />}
                      onClick={() => setOpen(openId === item.id ? "" : item.id)}
                    />
                  </span>
                ) : (
                  <ItemText key={item.id} item={item} labels={labels} />
                ),
              )}
            </div>
          )}
        </div>
        {!mobile && opened && (
          <div className="flex justify-end text-sm" data-testid="navigation-preview-dropdown">
            <div className="grid min-w-44 max-w-full gap-1.5 rounded-md bg-kumo-elevated px-4 py-3 ring ring-kumo-line">
              <Children items={opened.children} labels={labels} level={2} />
            </div>
          </div>
        )}
        {mobile &&
          (header.length === 0 ? (
            <Text as="span" size="sm" variant="secondary">
              {labels.empty}
            </Text>
          ) : (
            <div className="grid gap-2 border-t border-kumo-hairline pt-3 text-sm">
              <Children items={header} labels={labels} level={1} />
            </div>
          ))}
      </section>
      <div aria-hidden className="grid gap-2.5 px-5 py-6">
        <span className="h-3 w-2/5 rounded-sm bg-kumo-recessed" />
        <span className="h-2 w-full rounded-sm bg-kumo-recessed" />
        <span className="h-2 w-11/12 rounded-sm bg-kumo-recessed" />
        <span className="h-2 w-3/4 rounded-sm bg-kumo-recessed" />
      </div>
      <section
        aria-label={labels.footer}
        className={cn(
          "flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t border-kumo-hairline px-5 py-4 text-xs",
          focus === "footer" && "bg-kumo-tint",
        )}
      >
        <Text as="span" size="xs" variant="secondary">
          {labels.credit}
        </Text>
        {footer === undefined ? (
          <Text as="span" size="xs" variant="secondary">
            {labels.defaultFooter}
          </Text>
        ) : footer.length === 0 ? (
          <Text as="span" size="xs" variant="secondary">
            {labels.empty}
          </Text>
        ) : (
          <div className="flex min-w-0 flex-wrap items-start gap-x-5 gap-y-2">
            {footer.map((item) =>
              item.children.length > 0 ? (
                <div key={item.id} className="grid gap-1.5">
                  <ItemText item={item} labels={labels} strong />
                  <Children items={item.children} labels={labels} level={2} />
                </div>
              ) : (
                <ItemText key={item.id} item={item} labels={labels} />
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}
