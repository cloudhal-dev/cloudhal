import type { Taxonomy } from "@cloudhal/core-contracts";
import {
  Badge,
  Banner,
  Checkbox,
  Field,
  Input,
  InputGroup,
  InsetPanel,
  LayerDialog,
  Radio,
  Switch,
  Text,
} from "@cloudhal/ui";
import {
  ArrowRight,
  Camera,
  Info,
  ShieldCheck,
  Star,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { type MessageKey, useI18n, useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { primaryHostname } from "../lib/site-settings.ts";
import {
  archiveChange,
  type BasePathError,
  draftOf,
  effectiveBasePath,
  hasTaxonomyErrors,
  type KeyError,
  knownCollections,
  type LabelError,
  newTaxonomyDraft,
  TAXONOMY_LIMITS,
  type TaxonomyDraft,
  taxonomyFromDraft,
  validateTaxonomy,
} from "../lib/taxonomy-settings.ts";
import { isDirty } from "../lib/util.ts";
import { ErrorBanner } from "./ErrorBanner.tsx";
import { invalidateTaxonomy, type TaxonomyData, taxonomyKeys } from "./Taxonomy.tsx";
import { useToast } from "./Toast.ts";

const KEY_ERROR: Record<KeyError, MessageKey> = {
  required: "taxonomySettings.errors.keyRequired",
  invalid: "taxonomySettings.errors.keyInvalid",
  tooLong: "taxonomySettings.errors.keyTooLong",
  reserved: "taxonomySettings.errors.keyReserved",
  taken: "taxonomySettings.errors.keyTaken",
};
const LABEL_ERROR: Record<LabelError, MessageKey> = {
  required: "taxonomySettings.errors.labelRequired",
  tooLong: "taxonomySettings.errors.labelTooLong",
  pair: "taxonomySettings.errors.labelPair",
};
const PATH_ERROR: Record<BasePathError, MessageKey> = {
  required: "taxonomySettings.errors.pathRequired",
  invalid: "taxonomySettings.errors.pathInvalid",
  tooLong: "taxonomySettings.errors.pathTooLong",
  root: "taxonomySettings.errors.pathRoot",
  taxonomy: "taxonomySettings.errors.pathTaxonomy",
  page: "taxonomySettings.errors.pathPage",
  collection: "taxonomySettings.errors.pathCollection",
};
const NEW_TERMS = ["none", "propose", "free"] as const;

/** A `Switch` with its explanation underneath (related text close together). */
function SwitchField({
  label,
  hint,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  hint: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Switch
        label={label}
        checked={checked}
        onCheckedChange={(v: boolean) => onChange(v)}
        disabled={disabled}
        data-testid={testId}
      />
      <Text variant="secondary" size="sm">
        {hint}
      </Text>
    </div>
  );
}

/** One titled group of the form; groups are separated by hairlines. */
function FormSection({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section
      className="@container grid gap-5 py-6 first:pt-0 last:pb-0"
      aria-label={title}
      data-testid={testId}
    >
      <div className="grid gap-1.5">
        <Text variant="heading" as="h3">
          {title}
        </Text>
        {description && (
          <Text variant="secondary" size="sm">
            {description}
          </Text>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Create a taxonomy (custom ones such as `series` or `region`) or edit one's settings (DESIGN.md
 * §2p): the key (immutable once created; reserved words refused), labels per locale, structure,
 * who adds terms — spelled out for agents —, the per-article rule (required, maximum,
 * collections), archive pages and their address, feeds and the indexing threshold. Validated like
 * core-ts before anything is sent; moving an enabled archive previews the redirect the core leaves
 * behind. One save, one snapshot.
 */
export function TaxonomySettingsDialog({
  open,
  onOpenChange,
  siteId,
  taxonomy,
  data,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  /** The taxonomy to edit; absent: create a new one. */
  taxonomy?: Taxonomy | undefined;
  data: TaxonomyData;
  onCreated?: (taxonomy: Taxonomy) => void;
}) {
  const t = useT();
  const { locale: uiLocale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const defaultLocale = data.defaultLocale;
  const [draft, setDraft] = useState<TaxonomyDraft>(() => newTaxonomyDraft(defaultLocale));
  const [submitted, setSubmitted] = useState(false);
  const pages = useQuery({
    queryKey: ["pages", siteId],
    queryFn: () => api.pages.list(siteId),
    enabled: open,
  });
  const entries = useQuery({
    queryKey: ["entries", siteId, "all"],
    queryFn: () => api.entries.list(siteId),
    enabled: open,
  });
  const redirects = useQuery({
    queryKey: taxonomyKeys.redirects(siteId),
    queryFn: () => api.redirects.list(siteId),
    enabled: open && taxonomy !== undefined,
  });
  useEffect(() => {
    if (!open) return;
    setDraft(taxonomy ? draftOf(taxonomy) : newTaxonomyDraft(defaultLocale));
    setSubmitted(false);
  }, [open, taxonomy?.id, taxonomy?.rev]);

  const editing = taxonomy !== undefined;
  const set = (patch: Partial<TaxonomyDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const collections = knownCollections(entries.data ?? [], draft);
  const errors = validateTaxonomy(draft, {
    defaultLocale,
    taxonomies: data.taxonomies.data ?? [],
    pages: pages.data ?? [],
    collections: [...new Set((entries.data ?? []).map((e) => e.collection))],
    terms: taxonomy ? data.itemsOf(taxonomy).map((i) => i.term) : [],
    selfId: taxonomy?.id,
  });
  const base = effectiveBasePath(draft);
  const example = `${base || "/…"}/${t("taxonomySettings.exampleSlug")}`;
  const change = archiveChange(taxonomy, draft, redirects.data ?? []);
  const dirty = !editing || isDirty(draft, taxonomy ? draftOf(taxonomy) : undefined);
  const host = primaryHostname(data.site.data?.domains ?? []);
  const plural = taxonomy ? data.label(taxonomy) : "";
  const singularLabel = taxonomy ? data.label(taxonomy, "singular") : "";
  const shown = (e: unknown) => (submitted || editing) && e !== undefined;
  // A taken or reserved key, or a colliding address, is worth knowing while typing.
  const keyError =
    errors.key && (shown(errors.key) || (draft.key !== "" && errors.key !== "required"))
      ? errors.key
      : undefined;
  const pathError =
    errors.basePath && (shown(errors.basePath) || (base !== "" && errors.basePath !== "required"))
      ? errors.basePath
      : undefined;

  const save = useMutation({
    mutationFn: async () => {
      const next = taxonomyFromDraft(draft);
      if (!taxonomy) return (await api.taxonomies.create(siteId, next)).taxonomy;
      const { maxPerEntry: _m, collections: _c, ...stored } = taxonomy;
      return (await api.taxonomies.update({ ...stored, ...next, key: taxonomy.key })).taxonomy;
    },
    onSuccess: async (saved) => {
      await invalidateTaxonomy(qc, siteId);
      const name = saved.labels[defaultLocale]?.plural ?? saved.key;
      toast.success(
        editing ? t("taxonomySettings.saved", { name }) : t("taxonomySettings.created", { name }),
        t("governance.oneSnapshot"),
      );
      if (!editing) onCreated?.(saved);
      onOpenChange(false);
    },
  });
  const submit = () => {
    setSubmitted(true);
    if (hasTaxonomyErrors(errors)) return;
    save.mutate();
  };

  const labelLocales = [...new Set([defaultLocale, ...data.locales])];
  const labelError = (l: string, form: "singular" | "plural") => {
    const e = errors.labels?.[l]?.[form];
    return shown(e) && e ? t(LABEL_ERROR[e], { max: TAXONOMY_LIMITS.labelMax }) : undefined;
  };

  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={save.isPending}>
      <LayerDialog.Content size="lg" closeLabel={t("common.close")}>
        <LayerDialog.Title>
          {editing
            ? t("taxonomySettings.titleEdit", { Singular: singularLabel })
            : t("taxonomySettings.titleNew")}
        </LayerDialog.Title>
        <LayerDialog.Description>
          {editing
            ? t("taxonomySettings.descriptionEdit", {
                plural: plural.toLocaleLowerCase(uiLocale),
              })
            : t("taxonomySettings.descriptionNew")}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div
            className="grid divide-y divide-kumo-hairline"
            data-testid="taxonomy-settings"
            data-mode={editing ? "edit" : "create"}
          >
            <FormSection title={t("taxonomySettings.sections.name")} testId="settings-name">
              <Input
                label={t("taxonomySettings.key")}
                value={draft.key}
                onValueChange={(v) => set({ key: v.trim().toLowerCase() })}
                description={
                  editing ? t("taxonomySettings.keyFixed") : t("taxonomySettings.keyHint")
                }
                error={keyError ? t(KEY_ERROR[keyError], { key: draft.key }) : undefined}
                disabled={editing}
                maxLength={TAXONOMY_LIMITS.keyMax}
                spellCheck={false}
                className="w-full font-mono"
                autoFocus={!editing}
                data-testid="taxonomy-key"
              />
              {labelLocales.map((l) => {
                const label = draft.labels[l] ?? { singular: "", plural: "" };
                const edit = (patch: Partial<typeof label>) =>
                  set({ labels: { ...draft.labels, [l]: { ...label, ...patch } } });
                return (
                  <div key={l} className="grid gap-1.5" data-label-locale={l}>
                    <div className="grid items-start gap-x-4 gap-y-5 @lg:grid-cols-2">
                      <Input
                        label={t("taxonomySettings.singular", { locale: l })}
                        value={label.singular}
                        onValueChange={(v) => edit({ singular: v })}
                        placeholder={t("taxonomySettings.singularPlaceholder")}
                        error={labelError(l, "singular")}
                        maxLength={TAXONOMY_LIMITS.labelMax}
                        required={l === defaultLocale}
                        className="w-full"
                        data-testid={`label-singular-${l}`}
                      />
                      <Input
                        label={t("taxonomySettings.plural", { locale: l })}
                        value={label.plural}
                        onValueChange={(v) => edit({ plural: v })}
                        placeholder={t("taxonomySettings.pluralPlaceholder")}
                        error={labelError(l, "plural")}
                        maxLength={TAXONOMY_LIMITS.labelMax}
                        required={l === defaultLocale}
                        className="w-full"
                        data-testid={`label-plural-${l}`}
                      />
                    </div>
                    <Text variant="secondary" size="sm">
                      {l === defaultLocale
                        ? t("taxonomySettings.labelsHint")
                        : t("taxonomySettings.labelsOptional", { locale: defaultLocale })}
                    </Text>
                  </div>
                );
              })}
            </FormSection>

            <FormSection
              title={t("taxonomySettings.sections.terms")}
              description={t("taxonomySettings.sections.termsHint")}
              testId="settings-terms"
            >
              <SwitchField
                label={t("taxonomySettings.hierarchical")}
                hint={t("taxonomySettings.hierarchicalHint")}
                checked={draft.hierarchical}
                onChange={(v) => set({ hierarchical: v })}
                testId="taxonomy-hierarchical"
              />
              {errors.hierarchical !== undefined && (
                <Banner
                  variant="error"
                  size="sm"
                  icon={<WarningCircle weight="fill" />}
                  title={t("taxonomySettings.errors.hasParents", { count: errors.hierarchical })}
                />
              )}
              <div data-testid="taxonomy-new-terms">
                <Radio.Group
                  appearance="card"
                  legend={t("taxonomySettings.newTerms")}
                  value={draft.allowNewTerms}
                  onValueChange={(v) => set({ allowNewTerms: v as Taxonomy["allowNewTerms"] })}
                >
                  {NEW_TERMS.map((value) => (
                    <Radio.Item
                      key={value}
                      value={value}
                      label={
                        <span
                          className="flex flex-wrap items-center gap-x-2 gap-y-1"
                          data-new-terms={value}
                        >
                          <span>{t(`taxonomySettings.newTermsOptions.${value}`)}</span>
                          {value === "none" && (
                            <Badge variant="success" icon={<ShieldCheck />}>
                              {t("taxonomySettings.badges.safest")}
                            </Badge>
                          )}
                          {value === "propose" && (
                            <Badge variant="info" icon={<Star />}>
                              {t("taxonomySettings.badges.recommended")}
                            </Badge>
                          )}
                          {value === "free" && (
                            <Badge variant="warning" icon={<Warning />}>
                              {t("taxonomySettings.badges.careful")}
                            </Badge>
                          )}
                        </span>
                      }
                      description={t(`taxonomySettings.newTermsHints.${value}`)}
                    />
                  ))}
                </Radio.Group>
              </div>
              {errors.allowNewTerms !== undefined && (
                <Banner
                  variant="error"
                  size="sm"
                  icon={<WarningCircle weight="fill" />}
                  title={t("taxonomySettings.errors.hasProposals", { count: errors.allowNewTerms })}
                />
              )}
            </FormSection>

            <FormSection title={t("taxonomySettings.sections.articles")} testId="settings-articles">
              <SwitchField
                label={t("taxonomySettings.required")}
                hint={t("taxonomySettings.requiredHint")}
                checked={draft.required}
                onChange={(v) => set({ required: v })}
                testId="taxonomy-required"
              />
              <Input
                type="number"
                label={t("taxonomySettings.maxPerEntry")}
                value={draft.maxPerEntry}
                onValueChange={(v) => set({ maxPerEntry: v })}
                placeholder={String(TAXONOMY_LIMITS.perEntryMax)}
                description={t("taxonomySettings.maxPerEntryHint", {
                  max: TAXONOMY_LIMITS.perEntryMax,
                })}
                error={
                  shown(errors.maxPerEntry)
                    ? t("taxonomySettings.errors.range", {
                        min: 1,
                        max: TAXONOMY_LIMITS.perEntryMax,
                      })
                    : undefined
                }
                min={1}
                max={TAXONOMY_LIMITS.perEntryMax}
                required={false}
                className="w-full"
                data-testid="taxonomy-max"
              />
              <SwitchField
                label={t("taxonomySettings.allCollections")}
                hint={t("taxonomySettings.allCollectionsHint")}
                checked={draft.collections === undefined}
                onChange={(v) => set({ collections: v ? undefined : collections.slice(0, 1) })}
                testId="taxonomy-all-collections"
              />
              {draft.collections !== undefined && (
                <Field
                  label={t("taxonomySettings.collections")}
                  error={
                    shown(errors.collections)
                      ? { message: t("taxonomySettings.errors.collections"), match: true }
                      : undefined
                  }
                >
                  <InsetPanel className="gap-2.5" data-testid="taxonomy-collections">
                    {collections.map((c) => (
                      <Checkbox
                        key={c}
                        label={<Text variant="mono" as="span">{`/${c}`}</Text>}
                        checked={draft.collections?.includes(c) ?? false}
                        onCheckedChange={(v: boolean) =>
                          set({
                            collections: v
                              ? [...(draft.collections ?? []), c].sort()
                              : (draft.collections ?? []).filter((x) => x !== c),
                          })
                        }
                      />
                    ))}
                  </InsetPanel>
                </Field>
              )}
            </FormSection>

            <FormSection title={t("taxonomySettings.sections.archive")} testId="settings-archive">
              <SwitchField
                label={t("taxonomySettings.archiveEnabled")}
                hint={t("taxonomySettings.archiveEnabledHint")}
                checked={draft.archiveEnabled}
                onChange={(v) => set({ archiveEnabled: v })}
                testId="taxonomy-archive"
              />
              <Field
                label={t("taxonomySettings.basePath")}
                description={t("taxonomySettings.basePathHint", { example })}
                error={
                  pathError
                    ? {
                        message: t(PATH_ERROR[pathError], {
                          conflict: errors.basePathConflict ?? "",
                        }),
                        match: true,
                      }
                    : undefined
                }
              >
                <InputGroup className="w-full">
                  {host && <InputGroup.Addon>{host}</InputGroup.Addon>}
                  <InputGroup.Input
                    aria-label={t("taxonomySettings.basePath")}
                    value={draft.basePath}
                    placeholder={draft.key ? `/${draft.key}` : "/series"}
                    onChange={(e) =>
                      set({ basePath: (e.target as HTMLInputElement).value.trim().toLowerCase() })
                    }
                    spellCheck={false}
                    className="font-mono"
                    data-testid="taxonomy-base-path"
                  />
                </InputGroup>
              </Field>
              <ArchiveChangePreview change={change} />
              <SwitchField
                label={t("taxonomySettings.feed")}
                hint={
                  draft.archiveEnabled
                    ? t("taxonomySettings.feedHint", { example })
                    : t("taxonomySettings.feedNeedsArchive")
                }
                checked={draft.archiveEnabled && draft.feed}
                onChange={(v) => set({ feed: v })}
                disabled={!draft.archiveEnabled}
                testId="taxonomy-feed"
              />
              <Input
                type="number"
                label={t("taxonomySettings.minEntries")}
                value={draft.minEntriesToIndex}
                onValueChange={(v) => set({ minEntriesToIndex: v })}
                description={t("taxonomySettings.minEntriesHint")}
                error={
                  shown(errors.minEntriesToIndex)
                    ? t("taxonomySettings.errors.range", { min: 0, max: TAXONOMY_LIMITS.indexMax })
                    : undefined
                }
                min={0}
                max={TAXONOMY_LIMITS.indexMax}
                className="w-full"
                data-testid="taxonomy-min-entries"
              />
            </FormSection>
          </div>
          <div className="mt-6 grid gap-4">
            <ErrorBanner error={save.error} />
            <div className="flex items-start gap-2" data-testid="one-snapshot">
              <span className="flex h-lh items-center text-kumo-subtle">
                <Camera size={16} />
              </span>
              <Text variant="secondary" size="sm" as="span">
                {t("governance.oneSnapshot")}
              </Text>
            </div>
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            loading={save.isPending}
            disabled={!dirty}
            onClick={submit}
            data-testid="taxonomy-submit"
          >
            {editing ? t("taxonomySettings.save") : t("taxonomySettings.create")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

/** What saving does to public addresses: the redirect a moved archive leaves, or archives that stop or start. */
function ArchiveChangePreview({ change }: { change: ReturnType<typeof archiveChange> }) {
  const t = useT();
  if (change.redirect)
    return (
      <section
        className="grid gap-2"
        aria-label={t("taxonomySettings.move.title")}
        data-testid="archive-move"
      >
        <div className="flex items-center gap-2">
          <Text bold as="span">
            {t("governance.preview.redirects")}
          </Text>
          <Badge variant="secondary">1</Badge>
        </div>
        <Text variant="secondary" size="sm">
          {t("taxonomySettings.move.description")}
        </Text>
        <InsetPanel className="gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Text variant="mono" as="span">
              {change.redirect.from}
            </Text>
            <ArrowRight size={14} className="shrink-0 text-kumo-subtle" aria-hidden />
            <Text variant="mono" as="span">
              {change.redirect.to}
            </Text>
            <Badge variant="outline">{t("governance.preview.permanent")}</Badge>
          </div>
          <Text variant="secondary" size="sm">
            {t("governance.preview.prefix")}
          </Text>
        </InsetPanel>
        {change.follow > 0 && (
          <Text variant="secondary" size="sm">
            {t("governance.preview.repointed", { count: change.follow })}
          </Text>
        )}
      </section>
    );
  if (change.disabled)
    return (
      <Banner
        variant="alert"
        icon={<WarningCircle weight="fill" />}
        title={t("taxonomySettings.move.offTitle")}
        description={t("taxonomySettings.move.offDescription", { path: change.disabled })}
        data-testid="archive-off"
      />
    );
  if (change.enabled)
    return (
      <Banner
        icon={<Info weight="fill" />}
        title={t("taxonomySettings.move.onTitle", { path: change.enabled })}
        description={t("taxonomySettings.move.onDescription")}
        data-testid="archive-on"
      />
    );
  return null;
}
