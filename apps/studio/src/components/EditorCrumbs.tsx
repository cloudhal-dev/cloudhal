import { Breadcrumbs } from "@cloudhal/ui";
import { House } from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";

/** Breadcrumb trail for editors: Sites › site › section › current (with copyable id). */
export function EditorCrumbs({
  siteId,
  siteName,
  section,
  current,
  id,
}: {
  siteId: string;
  siteName: string | undefined;
  section: { label: string; href: string };
  current: string | undefined;
  id: string;
}) {
  const t = useT();
  return (
    <Breadcrumbs>
      <Breadcrumbs.Link href="/sites" icon={<House size={16} />}>
        {t("sites.title")}
      </Breadcrumbs.Link>
      <Breadcrumbs.Separator />
      <Breadcrumbs.Link href={`/sites/${siteId}`}>{siteName ?? "…"}</Breadcrumbs.Link>
      <Breadcrumbs.Separator />
      <Breadcrumbs.Link href={section.href}>{section.label}</Breadcrumbs.Link>
      <Breadcrumbs.Separator />
      <Breadcrumbs.Current loading={current === undefined}>{current}</Breadcrumbs.Current>
      <Breadcrumbs.Clipboard text={id} />
    </Breadcrumbs>
  );
}
