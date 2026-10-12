import type { LinkComponentProps } from "@cloudhal/ui";
import { Link as RouterLink } from "@tanstack/react-router";
import { forwardRef } from "react";

/**
 * Splits `/a/b?x=1#part` into TanStack Router's `to`, `search` and `hash` (Kumo only knows plain
 * hrefs).
 */
export function splitHref(href: string): {
  to: string;
  search?: Record<string, string>;
  hash?: string;
} {
  const h = href.indexOf("#");
  const hash = h === -1 ? undefined : href.slice(h + 1);
  const path = h === -1 ? href : href.slice(0, h);
  const i = path.indexOf("?");
  const withHash = hash ? { hash } : {};
  if (i === -1) return { to: path, ...withHash };
  return {
    to: path.slice(0, i),
    search: Object.fromEntries(new URLSearchParams(path.slice(i + 1))),
    ...withHash,
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
        {...(target.hash ? { hash: target.hash } : {})}
        {...rest}
      />
    );
  },
);
AppLink.displayName = "AppLink";
