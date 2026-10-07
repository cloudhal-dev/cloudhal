import type { LinkComponentProps } from "@cloudhal/ui";
import { Link as RouterLink } from "@tanstack/react-router";
import { forwardRef } from "react";

/** Bridges Kumo's `href` links (Breadcrumbs, Sidebar.MenuButton, Link) to TanStack Router. */
export const AppLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(
  ({ href, to, ...rest }, ref) => (
    <RouterLink ref={ref} to={(href ?? to ?? "/") as "/"} {...rest} />
  ),
);
AppLink.displayName = "AppLink";
