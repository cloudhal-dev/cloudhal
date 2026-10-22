/** Site › Settings: a save refused by the site's CAS (409 `conflict`). */
import { Banner } from "@cloudhal/ui";
import { ArrowClockwise, Warning } from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";

/** 409 from the CAS: explain and offer the latest version (DESIGN.md §5, Error). */
export function ConflictBanner({
  onReload,
  reloading,
}: {
  onReload: () => void;
  reloading: boolean;
}) {
  const t = useT();
  return (
    <div role="alert">
      <Banner
        variant="alert"
        icon={<Warning weight="fill" />}
        title={t("siteSettings.conflictTitle")}
        description={t("siteSettings.conflictDescription")}
        action={
          <Banner.Action
            variant="secondary"
            icon={<ArrowClockwise />}
            onClick={onReload}
            loading={reloading}
          >
            {t("siteSettings.loadLatest")}
          </Banner.Action>
        }
      />
    </div>
  );
}
