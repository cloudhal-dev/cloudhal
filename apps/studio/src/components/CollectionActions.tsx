import { LinkButton } from "@cloudhal/ui";
import { GearSix } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useT } from "../i18n/index.tsx";
import { useCan } from "./useMe.ts";

/** A collection list's header actions: its settings (people who may change them), then "New". */
export function CollectionActions({
  siteId,
  collection,
  add,
}: {
  siteId: string;
  collection: string;
  add: ReactNode;
}) {
  const t = useT();
  const settings = useCan("settings.write");
  return (
    <div className="flex items-center gap-2">
      {settings && (
        <LinkButton
          href={`/sites/${siteId}/collections/${collection}/settings`}
          variant="secondary"
          icon={GearSix}
          data-testid="collection-settings"
        >
          {t("collectionList.settings")}
        </LinkButton>
      )}
      {add}
    </div>
  );
}
