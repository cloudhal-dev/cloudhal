import { Breadcrumbs } from "@cloudhal/ui";
import { House } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";

export interface Crumb {
  label: string | undefined;
  href?: string;
}

/**
 * Breadcrumbs for the top bar (`PageLayout crumbs`, DESIGN.md §1): Studio (home, the sites list) first,
 * then the trail — "Cloudhal Studio › ui-audit › Pages", "Cloudhal Studio › Agents › Skills".
 * The last crumb is the current page (`loading` while its label is unknown); `copy` adds Kumo's
 * clipboard button for the current resource's id.
 */
export function Crumbs({ trail, copy }: { trail: Crumb[]; copy?: string }) {
  const t = useT();
  const last = trail.at(-1);
  return (
    <Breadcrumbs>
      <Breadcrumbs.Link href="/sites" icon={<House size={16} />}>
        {t("app.name")}
      </Breadcrumbs.Link>
      {trail.slice(0, -1).map((c, i) => (
        <Fragment key={i}>
          <Breadcrumbs.Separator />
          <Breadcrumbs.Link href={c.href ?? "/sites"}>{c.label ?? "…"}</Breadcrumbs.Link>
        </Fragment>
      ))}
      {last && (
        <>
          <Breadcrumbs.Separator />
          <Breadcrumbs.Current loading={last.label === undefined}>{last.label}</Breadcrumbs.Current>
        </>
      )}
      {copy && <Breadcrumbs.Clipboard text={copy} />}
    </Breadcrumbs>
  );
}

/**
 * Site surface trail: Sites › {site} › … The site's name comes from the cached site query. Pass
 * no `trail` on the overview (the site is then the current crumb).
 */
export function SiteCrumbs({
  siteId,
  trail = [],
  copy,
}: {
  siteId: string;
  trail?: Crumb[];
  copy?: string;
}) {
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  return (
    <Crumbs
      trail={[{ label: site.data?.name, href: `/sites/${siteId}` }, ...trail]}
      copy={copy ?? (trail.length === 0 ? siteId : undefined)}
    />
  );
}
