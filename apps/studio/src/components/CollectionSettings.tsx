/**
 * Site › Settings › Collections (RFC-0038 §5, ADR-0040): where each collection's entries live.
 * One row per collection with the prefix before `/{slug}` and the address of one of its entries.
 * Saved on the Site (PUT, CAS on `rev`); the store leaves a permanent redirect from the old
 * addresses and refuses a prefix that overlaps a page, an archive or another collection.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { Banner, Button, InputGroup, SectionEmpty, SkeletonLine } from "@cloudhal/ui";
import { FolderSimple, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { apiErrorText, isConflict } from "../lib/api-errors.ts";
import {
  changedKeys,
  collectionKeys,
  isPathRefusal,
  type PrefixForm,
  prefixForm,
  previewUrls,
  refusedKey,
  sampleEntry,
  validatePrefix,
  withPrefixes,
} from "../lib/collection-permalinks.ts";
import { ConflictBanner } from "./ConflictBanner.tsx";
import { SettingsSection } from "./Settings.tsx";
import { useToast } from "./Toast.ts";
import { useGate } from "./useMe.ts";

export const COLLECTION_SETTINGS_SECTION = "collections";

export function CollectionSettingsSection({ siteId }: { siteId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const gate = useGate("settings.write");
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const entries = useQuery({
    queryKey: ["entries", siteId, "all"],
    queryFn: () => api.entries.list(siteId),
  });
  const keys = site.data ? collectionKeys(site.data, entries.data ?? []) : [];
  const keysId = keys.join(",");
  const [form, setForm] = useState<PrefixForm>({});
  const [attempted, setAttempted] = useState(false);
  // The form follows the saved site (our save, or a reload after a conflict).
  useEffect(() => {
    if (site.data) setForm(prefixForm(site.data, keysId ? keysId.split(",") : []));
  }, [site.data, keysId]);
  const save = useMutation({
    mutationFn: (f: PrefixForm) => api.sites.update(withPrefixes(site.data as Site, f)),
    onSuccess: async (saved) => {
      setAttempted(false);
      qc.setQueryData(["site", siteId], saved);
      await qc.invalidateQueries({ queryKey: ["sites"] });
      toast.success(t("siteSettings.collections.saved"), t("common.rev", { rev: saved.rev }));
    },
  });
  const title = t("siteSettings.sections.collections");
  if (!site.data || entries.isPending)
    return (
      <SettingsSection id={COLLECTION_SETTINGS_SECTION} title={title}>
        <SkeletonLine />
      </SettingsSection>
    );
  const current = site.data;
  const changed = changedKeys(current, form);
  const dirty = changed.length > 0;
  const invalid = keys.some((k) => validatePrefix(form[k] ?? ""));
  const refused = refusedKey(save.error, changed);
  const submit = () => {
    setAttempted(true);
    if (!dirty || invalid) return;
    save.mutate(form);
  };
  const discard = () => {
    setForm(prefixForm(current, keys));
    setAttempted(false);
    save.reset();
  };
  return (
    <SettingsSection
      id={COLLECTION_SETTINGS_SECTION}
      title={title}
      description={t("siteSettings.collections.description")}
      footer={
        <>
          {dirty && (
            <Button variant="ghost" onClick={discard} disabled={save.isPending}>
              {t("common.discard")}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!dirty || !gate.allowed}
            title={gate.reason}
            loading={save.isPending}
            onClick={submit}
          >
            {t("common.saveChanges")}
          </Button>
        </>
      }
    >
      <SaveProblem
        error={isPathRefusal(save.error) ? undefined : save.error}
        onReload={() => {
          save.reset();
          void site.refetch();
        }}
        reloading={site.isFetching}
      />
      {keys.length === 0 ? (
        <SectionEmpty
          icon={<FolderSimple size={32} className="text-kumo-inactive" />}
          title={t("siteSettings.collections.empty")}
          description={t("siteSettings.collections.emptyDescription")}
        />
      ) : (
        keys.map((key) => (
          <CollectionRow
            key={key}
            collection={key}
            site={current}
            form={form}
            entries={entries.data ?? []}
            disabled={!gate.allowed || save.isPending}
            title={gate.reason}
            showInvalid={attempted || (form[key] ?? "") !== prefixForm(current, [key])[key]}
            serverError={refused === key ? apiErrorText(t, save.error) : undefined}
            onChange={(value) => {
              if (refused) save.reset();
              setForm((f) => ({ ...f, [key]: value }));
            }}
            onSubmit={submit}
          />
        ))
      )}
    </SettingsSection>
  );
}

/** A failed save that is not about a path: the CAS conflict (reload) or the API's sentence. */
function SaveProblem({
  error,
  onReload,
  reloading,
}: {
  error: unknown;
  onReload: () => void;
  reloading: boolean;
}) {
  const t = useT();
  if (!error) return null;
  if (isConflict(error)) return <ConflictBanner onReload={onReload} reloading={reloading} />;
  return (
    <Banner
      variant="error"
      size="sm"
      icon={<WarningCircle weight="fill" />}
      title={t("siteSettings.collections.failed")}
      description={apiErrorText(t, error)}
    />
  );
}

/** One collection: its prefix before `/{slug}` and where one of its entries lives. */
function CollectionRow({
  collection,
  site,
  form,
  entries,
  disabled,
  title,
  showInvalid,
  serverError,
  onChange,
  onSubmit,
}: {
  collection: string;
  site: Site;
  form: PrefixForm;
  entries: readonly ContentEntry[];
  disabled: boolean;
  /** Why the field is read-only (the gate's reason). */
  title: string | undefined;
  showInvalid: boolean;
  serverError: string | undefined;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const t = useT();
  const value = form[collection] ?? "";
  const problem = showInvalid ? validatePrefix(value) : undefined;
  const error = problem ? t(`siteSettings.collections.errors.${problem}`) : serverError;
  const sample = sampleEntry(entries, collection, site.defaultLocale) ?? {
    collection,
    slug: t("siteSettings.collections.exampleSlug"),
  };
  const urls = previewUrls(site, problem ? { ...form, [collection]: "" } : form, sample);
  const description =
    urls.now === urls.next
      ? t("siteSettings.collections.preview", { url: urls.next })
      : t("siteSettings.collections.previewMoved", { url: urls.next, old: urls.now });
  return (
    <InputGroup
      label={collection}
      description={description}
      error={error ? { message: error, match: true } : undefined}
      disabled={disabled}
      title={title}
    >
      <InputGroup.Input
        value={value}
        placeholder={`/${collection}`}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <InputGroup.Addon align="end">{"/{slug}"}</InputGroup.Addon>
    </InputGroup>
  );
}
