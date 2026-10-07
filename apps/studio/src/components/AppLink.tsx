import type { LinkComponentProps } from "@cloudhal/ui";
import { Link as RouterLink } from "@tanstack/react-router";
import { forwardRef } from "react";

/** Splits `/a/b?x=1` into TanStack Router's `to` and `search` (Kumo only knows plain hrefs). */
export function splitHref(href: string): { to: string; search?: Record<string, string> } {
  const i = href.indexOf("?");
  if (i === -1) return { to: href };
  return {
    to: href.slice(0, i),
    search: Object.fromEntries(new URLSearchParams(href.slice(i + 1))),
  };
}

/** Bridges Kumo's `href` links (Breadcrumbs, Sidebar.MenuButton, Link) to TanStack Router. */
export const AppLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(
  ({ href, to, ...rest }, ref) => {
    const target = splitHref(String(href ?? to ?? "/"));
    return (
      <RouterLink
        ref={ref}
        to={target.to as "/"}
        {...(target.search ? { search: target.search as never } : {})}
        {...rest}
      />
    );
  },
);
AppLink.displayName = "AppLink";
