import type { CollectionSettings, Site } from "@cloudhal/core-contracts";
import { checkPreset, PRESET_TYPES, type PresetType } from "@cloudhal/core-ts/structured-data";
import { Button, Select, Text } from "@cloudhal/ui";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/index.tsx";
import {
  issuesOf,
  liveFields,
  type MappingDraft,
  mappingDraft,
  presetOf,
  presetRows,
  suggestRequired,
} from "../../lib/listings.ts";
import { ErrorBanner } from "../ErrorBanner.tsx";
import { SettingsSection } from "../Settings.tsx";
import { MappingRow } from "./MappingRow.tsx";
import { StructuredDataPreview } from "./StructuredDataPreview.tsx";
import { LISTING_SECTIONS } from "./sections.ts";
import { same, useSaveSetting } from "./useSaveSetting.ts";

const NONE = "__none";

/** The row an issue belongs to: `…/properties/<path>[/…]`, or a group's prefix (its first row). */
function rowOf(issuePath: string, paths: readonly string[]): string | undefined {
  const at = issuePath.indexOf("properties/");
  if (at < 0) return undefined;
  const rest = issuePath.slice(at + "properties/".length).split("/")[0] ?? "";
  return paths.includes(rest) ? rest : paths.find((p) => p.startsWith(`${rest}.`));
}

/**
 * A collection › Settings › Structured data (RFC-0042 §2, §7): a type (Event, Job posting, Product,
 * Recipe, or none for today's blog post), then each of its properties — required first — with only
 * the sources that fit it. The same check the server runs (`checkPreset`) marks problems while
 * editing; a refused save (`structured_data_invalid`) shows its issues on their rows. Below, the
 * JSON-LD a chosen entry's page emits with the saved settings.
 */
export function StructuredDataSection({
  site,
  collection,
  settings,
  readOnlyReason,
}: {
  site: Site;
  collection: string;
  settings: CollectionSettings;
  readOnlyReason: string | undefined;
}) {
  const { t } = useI18n("listings");
  const sd = "listings.structuredData";
  const saved = settings.structuredData;
  const [type, setType] = useState<PresetType | undefined>(saved?.type);
  const [draft, setDraft] = useState<MappingDraft>(() => mappingDraft(saved));
  const savedKey = JSON.stringify(saved ?? null);
  useEffect(() => {
    setType(saved?.type);
    setDraft(mappingDraft(saved));
  }, [savedKey]);
  const save = useSaveSetting(site, collection, "structuredData", t(`${sd}.saved`));
  const defs = liveFields(settings);
  const preset = presetOf(type, draft);
  const dirty = !same(preset, saved);
  const canEdit = readOnlyReason === undefined;
  const rows = type ? presetRows(type) : [];
  const paths = rows.map((r) => r.path);
  const issues = useMemo(() => {
    const live = preset ? checkPreset(preset, defs, "preset") : [];
    const all = [...live, ...issuesOf(save.error)];
    const byRow = new Map<string, string[]>();
    for (const i of all) {
      const row = rowOf(i.path, paths);
      if (!row) continue;
      const text = t(`${sd}.issues.${i.code}` as `${typeof sd}.issues.required_value_missing`, {
        path: row,
      });
      const list = byRow.get(row) ?? [];
      if (!list.includes(text)) byRow.set(row, [...list, text]);
    }
    return byRow;
  }, [preset, defs, save.error, paths.join()]);
  const suggest = suggestRequired(preset, defs);
  return (
    <SettingsSection
      id={LISTING_SECTIONS.structuredData}
      title={t(`${sd}.title`)}
      description={t(`${sd}.description`)}
      footer={
        <>
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setType(saved?.type);
                setDraft(mappingDraft(saved));
              }}
              disabled={save.isPending}
            >
              {t("common.discard")}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => save.mutate(preset)}
            loading={save.isPending}
            disabled={!canEdit || !dirty}
            title={readOnlyReason}
            data-testid="save-structured-data"
          >
            {t(`${sd}.save`)}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <ErrorBanner error={save.error} />
        <Select
          className="w-full"
          label={t(`${sd}.type`)}
          value={type ?? NONE}
          onValueChange={(v) => setType(v === NONE ? undefined : (v as PresetType))}
          items={{
            [NONE]: t(`${sd}.none`),
            ...Object.fromEntries(PRESET_TYPES.map((p) => [p, t(`${sd}.types.${p}`)])),
          }}
          data-testid="preset-type"
        />
        {type && (
          <div className="grid divide-y divide-kumo-hairline" data-testid="preset-rows">
            {rows.map(({ path, spec }) => (
              <MappingRow
                key={path}
                path={path}
                spec={spec}
                defs={defs}
                defaultLocale={site.defaultLocale}
                choice={draft[path]?.choice ?? (spec.default ? "default" : "none")}
                constant={draft[path]?.constant ?? ""}
                issues={issues.get(path) ?? []}
                disabled={!canEdit}
                onChange={(choice, constant) =>
                  setDraft((d) => ({ ...d, [path]: { choice, constant } }))
                }
              />
            ))}
          </div>
        )}
        {type && (
          <div className="grid gap-1.5">
            {suggest.length > 0 && <Text variant="secondary">{t(`${sd}.suggestRequired`)}</Text>}
            <Text variant="secondary">{t(`${sd}.themeReminder`)}</Text>
          </div>
        )}
        {saved && <StructuredDataPreview site={site} collection={collection} />}
      </div>
    </SettingsSection>
  );
}
