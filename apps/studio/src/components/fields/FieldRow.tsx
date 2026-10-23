import type { FieldDefinition } from "@cloudhal/core-contracts";
import { Badge, Button, DropdownMenu, Text, Tooltip } from "@cloudhal/ui";
import {
  ArrowDown,
  ArrowUp,
  DotsThree,
  PencilSimple,
  Shapes,
  TextAa,
  Translate,
  Trash,
} from "@phosphor-icons/react";
import { useI18n } from "../../i18n/index.tsx";
import { type OperationKind, targetTypes } from "./FieldOperationDialog.tsx";

/**
 * One field in the builder: its label, key in mono, type and the Localized / Needed to publish /
 * Not saved / Being changed badges; up and down; and its menu — Edit, then for a saved field the
 * operations (Rename…, Change type…, Localization…, Remove…), for an unsaved one Remove.
 */
export function FieldRow({
  def,
  label,
  isNew,
  first,
  last,
  canEdit,
  dirty,
  onMove,
  onEdit,
  onRemoveNew,
  onOperation,
}: {
  def: FieldDefinition;
  label: string;
  isNew: boolean;
  first: boolean;
  last: boolean;
  canEdit: boolean;
  /** Unsaved free edits: operations wait until they are saved or discarded. */
  dirty: boolean;
  onMove: (by: -1 | 1) => void;
  onEdit: () => void;
  onRemoveNew: () => void;
  onOperation: (kind: OperationKind) => void;
}) {
  const { t } = useI18n("fields");
  const ops = canEdit && !dirty;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
      data-field-row={def.key}
    >
      <div className="grid min-w-0 gap-1">
        <Text as="span" bold truncate>
          {label}
        </Text>
        <span className="flex flex-wrap items-center gap-2">
          <Text as="span" variant="mono-secondary">
            {def.key}
          </Text>
          <Badge variant="secondary">{t(`fields.types.${def.type}`)}</Badge>
          {def.localized && <Badge variant="info">{t("fields.builder.localized")}</Badge>}
          {def.type !== "boolean" && def.requiredToPublish && (
            <Badge variant="outline">{t("fields.editor.neededToPublish")}</Badge>
          )}
          {isNew && <Badge variant="beta">{t("fields.builder.unsaved")}</Badge>}
          {def.migration && <Badge variant="warning">{t("fields.builder.changing")}</Badge>}
        </span>
      </div>
      <span className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<ArrowUp />}
          aria-label={t("fields.builder.moveUp", { name: label })}
          disabled={!canEdit || first}
          onClick={() => onMove(-1)}
        />
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={<ArrowDown />}
          aria-label={t("fields.builder.moveDown", { name: label })}
          disabled={!canEdit || last}
          onClick={() => onMove(1)}
        />
        <DropdownMenu>
          <Tooltip
            content={t("fields.builder.menu")}
            render={
              <DropdownMenu.Trigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    shape="square"
                    icon={<DotsThree weight="bold" />}
                    aria-label={t("fields.builder.menuFor", { name: label })}
                    disabled={!canEdit}
                  />
                }
              />
            }
          />
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item icon={PencilSimple} onClick={onEdit}>
              {t("fields.builder.edit")}
            </DropdownMenu.Item>
            {isNew ? (
              <DropdownMenu.Item icon={Trash} variant="danger" onClick={onRemoveNew}>
                {t("fields.builder.removeNew")}
              </DropdownMenu.Item>
            ) : (
              <>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  icon={TextAa}
                  disabled={!ops}
                  onClick={() => onOperation("rename_field")}
                >
                  {t("fields.builder.rename")}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  icon={Shapes}
                  disabled={!ops || targetTypes(def.type).length === 0}
                  onClick={() => onOperation("change_field_type")}
                >
                  {t("fields.builder.changeType")}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  icon={Translate}
                  disabled={!ops}
                  onClick={() => onOperation("set_field_localized")}
                >
                  {t("fields.builder.localization")}
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  icon={Trash}
                  variant="danger"
                  disabled={!ops}
                  onClick={() => onOperation("remove_field")}
                >
                  {t("fields.builder.remove")}
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu>
      </span>
    </div>
  );
}
