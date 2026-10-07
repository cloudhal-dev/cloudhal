import { Breadcrumbs } from "@cloudhal/ui";
import { Fragment } from "react";

export interface Crumb {
  label: string;
  href?: string;
}

/** Kumo breadcrumbs; links route through LinkProvider → TanStack Router. */
export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <Breadcrumbs size="sm">
      {items.map((c, i) => (
        <Fragment key={`${c.label}-${i}`}>
          {i > 0 && <Breadcrumbs.Separator />}
          {c.href && i < items.length - 1 ? (
            <Breadcrumbs.Link href={c.href}>{c.label}</Breadcrumbs.Link>
          ) : (
            <Breadcrumbs.Current>{c.label}</Breadcrumbs.Current>
          )}
        </Fragment>
      ))}
    </Breadcrumbs>
  );
}
