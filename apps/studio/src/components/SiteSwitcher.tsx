import { DropdownMenu } from "@cloudhal/ui";
import { SquaresFour } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "../i18n/index.tsx";
import { OpenSiteItem } from "./LiveLinks.tsx";

/** The site switcher's rows after the sites: "Open site" (once live), then "All sites". */
export function SiteSwitcherExtra({ siteId }: { siteId: string }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <>
      <OpenSiteItem siteId={siteId} />
      <DropdownMenu.Item icon={SquaresFour} onClick={() => navigate({ to: "/sites" })}>
        {t("nav.allSites")}
      </DropdownMenu.Item>
    </>
  );
}
