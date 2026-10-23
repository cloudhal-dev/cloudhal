import type { CollectionSettings, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { FIELD_LIMITS, fieldLabel } from "@cloudhal/core-ts/fields";
import { Banner, Button, SectionEmpty, Text } from "@cloudhal/ui";
import { ArrowsClockwise, Plus, Textbox } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/index.tsx";
import { api } from "../../lib/api.ts";
import { formLocales } from "../../lib/field-form.ts";
import { moveField, runningOperationId, withFields } from "../../lib/fields.ts";
import { ErrorBanner } from "../ErrorBanner.tsx";
import { SettingsSection } from "../Settings.tsx";
import { useToast } from "../Toast.ts";
import { FieldDialog } from "./FieldDialog.tsx";
import {
  FieldOperationDialog,
  type OperationKind,
  type OperationTarget,
} from "./FieldOperationDialog.tsx";
import { FieldRow } from "./FieldRow.tsx";

/** The section's id in the collection settings' table of contents. */
export const COLLECTION_FIELDS_SECTION = "fields";

/** The draft list, its save, and the dialogs it opens. */
function useFieldsBuilder(site: Site, collection: string, settings: CollectionSettings) {
  const { t } = useI18n("fields");
  const qc = useQueryClient();
  const toast = useToast();
  const saved = settings.fields ?? [];
  const [draft, setDraft] = useState<readonly FieldDefinition[]>(saved);
  const savedKey = JSON.stringify(saved);
  useEffect(() => setDraft(saved), [savedKey]);
  const dirty = JSON.stringify(draft) !== savedKey;
  const save = useMutation({
    mutationFn: () => api.collections.save(site, collection, withFields(settings, draft)),
    onSuccess: async ({ site: next }) => {
      qc.setQueryData(["site", site.id], next);
      await qc.invalidateQueries({ queryKey: ["collections", site.id] });
      toast.success(t("fields.builder.saved"), t("common.rev", { rev: next.rev }));
    },
  });
  return { saved, draft, setDraft, dirty, save };
}

/** An operation still rewriting entries: its status, and "Continue". */
function RunningBanner({
  siteId,
  collection,
  operationId,
  onContinue,
}: {
  siteId: string;
  collection: string;
  operationId: string;
  onContinue: (reverting: boolean) => void;
}) {
  const { t } = useI18n("fields");
  const status = useQuery({
    queryKey: ["field-operation", siteId, collection, operationId],
    queryFn: () => api.collections.fieldStatus(siteId, collection, operationId),
    refetchInterval: 5000,
  });
  const reverting = status.data?.state === "reverting";
  return (
    <Banner
      variant="alert"
      icon={<ArrowsClockwise weight="bold" />}
      title={t("fields.builder.runningTitle")}
      description={t("fields.builder.running", { count: status.data?.pending ?? 0 })}
      action={
        <Banner.Action variant="secondary" onClick={() => onContinue(reverting)}>
          {t("fields.builder.continue")}
        </Banner.Action>
      }
    />
  );
}

/**
 * A collection › Settings › Fields (RFC-0041 §7, DESIGN.md §2ah): the typed fields in form order —
 * label, key, type and badges per row, with up/down and a menu. Adding, reordering and editing
 * labels, help, limits and options are free edits saved together (`PUT …/collections/:key` with
 * `fields`). Rename, type, localization and removal of a saved field open an operation dialog
 * (dry run, confirmation, run, revert); a running operation shows its progress. Only people with
 * `site:settings` change anything; others see the list read-only.
 */
export function FieldsSection({
  site,
  collection,
  settings,
  readOnlyReason,
}: {
  site: Site;
  collection: string;
  settings: CollectionSettings;
  /** Why the person may not change definitions (no `site:settings`). */
  readOnlyReason: string | undefined;
}) {
  const { t, locale } = useI18n("fields");
  const { saved, draft, setDraft, dirty, save } = useFieldsBuilder(site, collection, settings);
  const [editing, setEditing] = useState<{ index: number } | undefined>();
  const [adding, setAdding] = useState(false);
  const [operation, setOperation] = useState<OperationTarget>();
  const locales = useMemo(() => formLocales(site.defaultLocale, site.locales), [site]);
  const savedKeys = saved.map((d) => d.key);
  const running = runningOperationId(saved);
  const canEdit = readOnlyReason === undefined && running === undefined;
  const editDef = editing ? draft[editing.index] : undefined;
  const open = (kind: OperationKind, def: FieldDefinition) => setOperation({ kind, def });
  const full = draft.length >= FIELD_LIMITS.fieldsPerCollection;
  return (
    <SettingsSection
      id={COLLECTION_FIELDS_SECTION}
      title={t("fields.builder.title")}
      description={t("fields.builder.description")}
      aside={
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus />}
          onClick={() => setAdding(true)}
          disabled={!canEdit || full}
          title={readOnlyReason}
          data-testid="add-field"
        >
          {t("fields.builder.add")}
        </Button>
      }
      footer={
        draft.length > 0 || dirty ? (
          <>
            {dirty && (
              <Button variant="ghost" onClick={() => setDraft(saved)} disabled={save.isPending}>
                {t("common.discard")}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => save.mutate()}
              loading={save.isPending}
              disabled={!canEdit || !dirty}
              title={readOnlyReason}
              data-testid="save-fields"
            >
              {t("fields.builder.save")}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="grid gap-4">
        <ErrorBanner error={save.error} />
        {running && (
          <RunningBanner
            siteId={site.id}
            collection={collection}
            operationId={running}
            onContinue={(reverting) => {
              const def = saved.find((d) => d.migration?.id === running);
              if (def)
                setOperation({
                  kind: "rename_field",
                  def,
                  resume: { operationId: running, reverting },
                });
            }}
          />
        )}
        {draft.length === 0 ? (
          <SectionEmpty
            icon={<Textbox size={32} className="text-kumo-inactive" />}
            title={t("fields.builder.empty")}
            description={t("fields.builder.emptyDescription")}
          />
        ) : (
          <div className="grid divide-y divide-kumo-hairline" data-testid="field-list">
            {draft.map((def, i) => (
              <FieldRow
                key={def.key}
                def={def}
                label={fieldLabel(def, locale, site.defaultLocale)}
                isNew={!savedKeys.includes(def.key)}
                first={i === 0}
                last={i === draft.length - 1}
                canEdit={canEdit}
                dirty={dirty}
                onMove={(by) => setDraft(moveField(draft, i, by))}
                onEdit={() => setEditing({ index: i })}
                onRemoveNew={() => setDraft(draft.filter((_, j) => j !== i))}
                onOperation={(kind) => open(kind, def)}
              />
            ))}
          </div>
        )}
        {dirty && savedKeys.length > 0 && (
          <Text variant="secondary" size="sm">
            {t("fields.builder.saveFirst")}
          </Text>
        )}
      </div>
      <FieldDialog
        open={adding || editing !== undefined}
        onOpenChange={(o) => {
          if (o) return;
          setAdding(false);
          setEditing(undefined);
        }}
        initial={editDef}
        isNew={!editDef || !savedKeys.includes(editDef.key)}
        taken={draft.filter((d) => d !== editDef).map((d) => d.key)}
        defaultLocale={site.defaultLocale}
        locales={locales}
        onApply={(def) =>
          setDraft(editing ? draft.map((d, j) => (j === editing.index ? def : d)) : [...draft, def])
        }
      />
      <FieldOperationDialog
        open={operation !== undefined}
        onOpenChange={(o) => {
          if (!o) setOperation(undefined);
        }}
        siteId={site.id}
        collection={collection}
        target={operation}
        taken={saved.filter((d) => d.key !== operation?.def.key).map((d) => d.key)}
        defaultLocale={site.defaultLocale}
        locales={locales}
      />
    </SettingsSection>
  );
}
