import { Button, DropdownMenu, Tooltip } from "@cloudhal/ui";
import { ArrowSquareOut, DotsThree, Trash } from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";

/** The "…" menu at the end of a table row (DESIGN.md §2a). */
export function RowMenu({
  onOpen,
  onDelete,
}: {
  onOpen: () => void;
  onDelete?: (() => void) | undefined;
}) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Tooltip
            content={t("site.rowMenu")}
            render={
              <Button
                variant="ghost"
                size="xs"
                shape="square"
                icon={<DotsThree weight="bold" />}
                aria-label={t("site.rowMenu")}
              />
            }
          />
        }
      />
      <DropdownMenu.Content align="end">
        <DropdownMenu.Item icon={ArrowSquareOut} onClick={onOpen}>
          {t("sites.open")}
        </DropdownMenu.Item>
        {onDelete && (
          <DropdownMenu.Item icon={Trash} variant="danger" onClick={onDelete}>
            {t("common.delete")}
          </DropdownMenu.Item>
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
