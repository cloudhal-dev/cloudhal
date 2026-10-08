import type { Term } from "@cloudhal/core-contracts";
import {
  Badge,
  Banner,
  Button,
  DropdownMenu,
  InlineCopyText,
  Input,
  InputArea,
  InsetPanel,
  LayerCard,
  PageLayout,
  SectionCard,
  SectionEmpty,
  SkeletonLine,
  Tabs,
  TagInput,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import {
  ArrowRight,
  ArrowsMerge,
  Check,
  ClockCounterClockwise,
  DotsThree,
  Eye,
  EyeSlash,
  MagnifyingGlass,
  Notepad,
  TextAa,
  Trash,
  TreeStructure,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import {
  DangerZoneCard,
  type DetailRow,
  DetailsCard,
  EditorLayout,
} from "../components/EditorLayout.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { GovernanceDialog, type GovernanceTarget } from "../components/GovernanceDialog.tsx";
import { UsedInMenusCard } from "../components/Menus.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { CountedHint, CoverImageCard, SeoFields } from "../components/Seo.tsx";
import {
  IndexBadge,
  invalidateTaxonomy,
  TermStateBadges,
  useTaxonomyData,
  VisibilityBadge,
} from "../components/Taxonomy.tsx";
import { useToast } from "../components/Toast.ts";
import { type MessageKey, useI18n, useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { primaryHostname } from "../lib/site-settings.ts";
import {
  type AltNameError,
  archiveCounts,
  archivePath,
  cleanTerm,
  editLabel,
  hasTermErrors,
  indexStatus,
  TERM_LIMITS,
  validateTerm,
} from "../lib/taxonomy.ts";
import { isDirty } from "../lib/util.ts";

const ALT_ERROR: Record<AltNameError["code"], MessageKey> = {
  tooLong: "termEditor.errors.altTooLong",
  duplicate: "termEditor.errors.altDuplicate",
  collision: "termEditor.errors.altCollision",
};

/**
 * Site › Categories & tags › a term (DESIGN.md §2p): names and synonyms per locale, the archive
 * introduction (markdown), the image (the cover-image card) and search settings per locale (the
 * SEO fields), placement (parent, position), indexing and the read-only slug history with its
 * redirects. Slug, parent, visibility and retirement change only through the governance dialogs.
 */
export function TermEditorPage() {
  const t = useT();
  const { locale: uiLocale } = useI18n();
  const { siteId, termId } = useParams({ from: "/sites/$siteId/taxonomy/$termId" });
  const qc = useQueryClient();
  const toast = useToast();
  const data = useTaxonomyData(siteId);
  const detail = useQuery({
    queryKey: ["term", siteId, termId],
    queryFn: () => api.terms.get(siteId, termId),
  });
  const [draft, setDraft] = useState<Term | undefined>();
  const [showErrors, setShowErrors] = useState(false);
  const [locale, setLocale] = useState<string | undefined>();
  const [governance, setGovernance] = useState<GovernanceTarget | undefined>();
  useEffect(() => {
    if (detail.data) setDraft(detail.data.term);
  }, [detail.data]);
  const saved = detail.data?.term;
  const dirty = isDirty(draft, saved);
  const tax = data.taxonomies.data?.find((x) => x.id === saved?.taxonomyId);
  const siblings = tax ? data.itemsOf(tax) : [];
  const host = primaryHostname(data.site.data?.domains ?? []);
  const defaultLocale = data.defaultLocale;
  const activeLocale = locale ?? defaultLocale;

  const save = useMutation({
    mutationFn: (term: Term) => api.terms.update(cleanTerm(term, defaultLocale)),
    onSuccess: async ({ term }) => {
      setDraft(term);
      setShowErrors(false);
      qc.setQueryData(["term", siteId, termId], (old: typeof detail.data) =>
        old ? { ...old, term } : old,
      );
      await invalidateTaxonomy(qc, siteId);
      toast.success(t("editor.saved"), t("governance.oneSnapshot"));
    },
  });
  const approve = useMutation({
    mutationFn: (term: Term) => api.terms.govern(term, { op: "review", decision: "approve" }),
    onSuccess: async () => {
      await invalidateTaxonomy(qc, siteId);
      toast.success(t("taxonomy.review.approved", { name: saved ? data.name(saved) : "" }));
    },
  });

  const listHref = `/sites/${siteId}/taxonomy${tax ? `?taxonomy=${tax.key}` : ""}`;
  const listCrumb = { label: t("pageHeaders.taxonomy.title"), href: listHref };
  if (!draft || !saved || !tax) {
    return (
      <PageLayout
        crumbs={<SiteCrumbs siteId={siteId} trail={[listCrumb, { label: undefined }]} />}
        title={undefined}
        loading={detail.isPending || data.taxonomies.isPending}
      >
        <ErrorBanner error={detail.error ?? data.taxonomies.error} />
        <LayerCard className="grid gap-3 px-5 py-4">
          <SkeletonLine minWidth={30} maxWidth={45} />
          <SkeletonLine minWidth={70} maxWidth={90} />
          <SkeletonLine minWidth={50} maxWidth={70} />
        </LayerCard>
      </PageLayout>
    );
  }

  const errors = validateTerm(draft, { defaultLocale, terms: siblings.map((i) => i.term) });
  const localeErrors = errors.locales[activeLocale] ?? {};
  const label = draft.labels[activeLocale];
  const name = data.name(saved);
  const retired = saved.status === "retired";
  const mergedInto = saved.mergedInto ? data.byId.get(saved.mergedInto)?.term : undefined;
  const parent = saved.parentId ? data.byId.get(saved.parentId)?.term : undefined;
  const path = archivePath(tax, saved.slug);
  const usage = detail.data?.usage ?? { total: 0, published: 0 };
  const published = archiveCounts(siblings, tax.hierarchical).get(saved.id) ?? usage.published;
  const status = indexStatus(draft, tax, published, defaultLocale);
  const redirects = detail.data?.redirects ?? [];
  const singular = data.label(tax, "singular");

  /** Every save path checks the invariants first; an invalid term never leaves Studio. */
  const valid = () => {
    if (!hasTermErrors(errors)) return true;
    setShowErrors(true);
    toast.error(t("seo.fixErrors"));
    const bad = Object.keys(errors.locales).find((l) => l !== activeLocale);
    if (bad && !errors.locales[activeLocale]) setLocale(bad);
    return false;
  };
  const show = (e: unknown) => showErrors && e !== undefined;
  const nameError = show(localeErrors.name)
    ? localeErrors.name === "required"
      ? t("termEditor.errors.nameRequired")
      : t("termEditor.errors.nameTooLong")
    : undefined;
  const altError = localeErrors.altNames?.[0];
  const open = (kind: GovernanceTarget["kind"]) => setGovernance({ kind, term: saved });
  const details: DetailRow[] = [
    { label: t("editor.id"), value: <InlineCopyText>{saved.id}</InlineCopyText> },
    { label: t("termEditor.details.taxonomy"), value: <Text as="span">{data.label(tax)}</Text> },
    { label: t("termEditor.details.visibility"), value: <VisibilityBadge term={saved} /> },
    {
      label: t("termEditor.details.usage"),
      value: (
        <Text as="span">
          {t("taxonomy.usage.value", { published: usage.published, total: usage.total })}
        </Text>
      ),
    },
    ...(usage.lastUsedAt
      ? [
          {
            label: t("taxonomy.columns.lastUsed"),
            value: <RelativeTime iso={usage.lastUsedAt} size="base" />,
          },
        ]
      : []),
    { label: t("editor.revision"), value: <Text as="span">{saved.rev}</Text> },
    { label: t("editor.updatedAt"), value: <RelativeTime iso={saved.updatedAt} size="base" /> },
  ];

  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[listCrumb, { label: name }]} copy={saved.id} />}
      title={name}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{singular}</Badge>
          <TermStateBadges
            term={saved}
            mergedInto={mergedInto ? data.name(mergedInto) : undefined}
          />
          <Text variant="mono-secondary" as="span">
            {path}
          </Text>
        </span>
      }
      actions={
        retired ? undefined : (
          <>
            {saved.status === "proposed" && (
              <Button
                variant="secondary"
                icon={<Check />}
                loading={approve.isPending}
                onClick={() => approve.mutate(saved)}
              >
                {t("taxonomy.review.approve")}
              </Button>
            )}
            <DropdownMenu>
              <Tooltip
                content={t("editor.moreActions")}
                render={
                  <DropdownMenu.Trigger
                    render={
                      <Button
                        variant="secondary"
                        shape="square"
                        icon={<DotsThree weight="bold" />}
                        aria-label={t("editor.moreActions")}
                        data-testid="term-actions"
                      />
                    }
                  />
                }
              />
              <DropdownMenu.Content align="end">
                {saved.status === "proposed" ? (
                  <>
                    <DropdownMenu.Item icon={ArrowsMerge} onClick={() => open("reviewMerge")}>
                      {t("taxonomy.menu.mergeExisting")}
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item icon={Trash} variant="danger" onClick={() => open("reject")}>
                      {t("taxonomy.review.reject")}
                    </DropdownMenu.Item>
                  </>
                ) : (
                  <>
                    <DropdownMenu.Item icon={TextAa} onClick={() => open("rename")}>
                      {t("taxonomy.menu.rename")}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item icon={ArrowsMerge} onClick={() => open("merge")}>
                      {t("taxonomy.menu.merge")}
                    </DropdownMenu.Item>
                    {tax.hierarchical && (
                      <DropdownMenu.Item icon={TreeStructure} onClick={() => open("move")}>
                        {t("taxonomy.menu.move")}
                      </DropdownMenu.Item>
                    )}
                    <DropdownMenu.Item
                      icon={saved.visibility === "public" ? EyeSlash : Eye}
                      onClick={() => open("visibility")}
                    >
                      {saved.visibility === "public"
                        ? t("taxonomy.menu.makeInternal")
                        : t("taxonomy.menu.makePublic")}
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu>
            <Button
              variant="primary"
              onClick={() => {
                if (valid()) save.mutate(draft);
              }}
              loading={save.isPending}
              disabled={!dirty}
              data-testid="save"
            >
              {t("common.save")}
            </Button>
          </>
        )
      }
    >
      <ErrorBanner error={save.error ?? approve.error} />
      {retired && (
        <Banner
          variant="secondary"
          icon={<ClockCounterClockwise weight="fill" />}
          title={
            mergedInto
              ? t("termEditor.retired.merged", { name: data.name(mergedInto) })
              : t("termEditor.retired.title")
          }
          description={t("termEditor.retired.description")}
        />
      )}
      {data.locales.length > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <Text variant="secondary" as="span">
            {t("termEditor.language")}
          </Text>
          <Tabs
            variant="segmented"
            value={activeLocale}
            onValueChange={setLocale}
            tabs={data.locales.map((l) => ({
              value: l,
              label: (
                <span className="flex items-center gap-1.5">
                  {l}
                  {l === defaultLocale && (
                    <Text variant="secondary" size="sm" as="span">
                      {t("termEditor.default")}
                    </Text>
                  )}
                  {errors.locales[l] && showErrors && <Badge variant="error">!</Badge>}
                </span>
              ),
            }))}
            data-testid="term-locales"
          />
        </div>
      )}
      <EditorLayout
        main={
          <>
            <SectionCard
              id="names"
              title={t("termEditor.names.title")}
              icon={<TextAa size={16} />}
              description={t("termEditor.names.description")}
            >
              <Input
                label={t("termEditor.names.name", { locale: activeLocale })}
                value={label?.name ?? ""}
                onValueChange={(v) => setDraft(editLabel(draft, activeLocale, { name: v }))}
                description={
                  activeLocale === defaultLocale
                    ? t("termEditor.names.nameHintDefault")
                    : t("termEditor.names.nameHint", { locale: defaultLocale })
                }
                error={nameError}
                maxLength={TERM_LIMITS.nameMax}
                required={activeLocale === defaultLocale}
                disabled={retired}
                className="w-full"
                data-testid="term-name"
              />
              <TagInput
                label={t("termEditor.names.altNames")}
                value={label?.altNames ?? []}
                onValueChange={(values: string[]) =>
                  setDraft(
                    editLabel(draft, activeLocale, {
                      ...(label ? {} : { name: "" }),
                      altNames: values.length
                        ? ([...new Set(values.map((v) => v.trim()).filter(Boolean))] as [
                            string,
                            ...string[],
                          ])
                        : undefined,
                    }),
                  )
                }
                maxValues={TERM_LIMITS.altNamesMax}
                description={t("termEditor.names.altNamesHint")}
                error={
                  altError
                    ? t(ALT_ERROR[altError.code], {
                        value: altError.value,
                        other: altError.other ?? "",
                      })
                    : undefined
                }
                labels={{
                  removeValue: (v: string) => t("pickers.remove", { name: v }),
                  maxValuesReached: (max: number) => t("pickers.atMost", { max }),
                }}
                disabled={retired}
                className="w-full"
                data-testid="term-altnames"
              />
            </SectionCard>
            <SectionCard
              id="introduction"
              title={t("termEditor.intro.title")}
              icon={<Notepad size={16} />}
              description={t("termEditor.intro.description", { path })}
            >
              <InputArea
                aria-label={t("termEditor.intro.title")}
                value={label?.description ?? ""}
                onValueChange={(v) =>
                  setDraft(editLabel(draft, activeLocale, { description: v || undefined }))
                }
                description={
                  <CountedHint
                    hint={t("termEditor.intro.hint")}
                    count={label?.description?.length ?? 0}
                    recommended={TERM_LIMITS.descriptionMax}
                  />
                }
                error={
                  show(localeErrors.description) ? t("termEditor.errors.introTooLong") : undefined
                }
                autoResize
                minRows={4}
                maxRows={16}
                disabled={retired}
                className="w-full font-mono"
                data-testid="term-intro"
              />
            </SectionCard>
            <CoverImageCard
              id="term-image"
              title={t("termEditor.image.title")}
              description={t("termEditor.image.description")}
              image={draft.image}
              savedSrc={saved.image?.src}
              host={host}
              errors={errors.image ?? {}}
              showErrors={showErrors}
              onChange={(image) => {
                const { image: _i, ...rest } = draft;
                setDraft(image ? { ...rest, image } : rest);
              }}
            />
            <SectionCard
              id="seo"
              title={t("termEditor.seo.title")}
              icon={<MagnifyingGlass size={16} />}
              description={t("termEditor.seo.description", { locale: activeLocale })}
            >
              <SeoFields
                kind="archive"
                seo={label?.seo}
                onChange={(seo) => setDraft(editLabel(draft, activeLocale, { seo }))}
                fallbackTitle={label?.name || name}
                path={path}
                siteName={data.site.data?.name ?? ""}
                host={host}
                errors={localeErrors.seo ?? {}}
                showErrors={showErrors}
              />
            </SectionCard>
          </>
        }
        aside={
          <>
            <SectionCard
              id="indexing"
              title={t("termEditor.indexing.title")}
              icon={<MagnifyingGlass size={16} />}
              actions={<IndexBadge status={status} />}
            >
              <Text variant="secondary">
                {status.kind === "indexed"
                  ? t("termEditor.indexing.indexed", { count: status.published, path })
                  : status.kind === "thin"
                    ? t("termEditor.indexing.thin", {
                        count: status.published,
                        min: status.min,
                        path,
                      })
                    : status.kind === "empty"
                      ? t("termEditor.indexing.empty", { path })
                      : status.kind === "noindex"
                        ? t("termEditor.indexing.noindex", { path })
                        : t(`taxonomy.index.noneHint.${status.reason}`)}
              </Text>
            </SectionCard>
            <SectionCard
              id="placement"
              title={t("termEditor.placement.title")}
              icon={<TreeStructure size={16} />}
            >
              {tax.hierarchical && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="grid min-w-0 gap-0.5">
                    <Text variant="secondary" size="sm" as="span">
                      {t("governance.move.parent")}
                    </Text>
                    <Text as="span" truncate>
                      {parent ? data.name(parent) : t("governance.move.topLevel")}
                    </Text>
                  </span>
                  {!retired && (
                    <Button variant="secondary" size="sm" onClick={() => open("move")}>
                      {t("taxonomy.menu.move")}
                    </Button>
                  )}
                </div>
              )}
              <Input
                type="number"
                label={t("termEditor.placement.position")}
                value={draft.position === undefined ? "" : String(draft.position)}
                onValueChange={(v) => {
                  const { position: _p, ...rest } = draft;
                  setDraft(v === "" ? rest : { ...rest, position: Number(v) });
                }}
                description={t("termEditor.placement.positionHint")}
                error={
                  show(errors.position)
                    ? t("termEditor.errors.position", { max: TERM_LIMITS.positionMax })
                    : undefined
                }
                min={0}
                max={TERM_LIMITS.positionMax}
                required={false}
                disabled={retired}
                className="w-full"
                data-testid="term-position"
              />
            </SectionCard>
            <SectionCard
              id="slug-history"
              title={t("termEditor.history.title")}
              icon={<ClockCounterClockwise size={16} />}
              actions={
                retired ? undefined : (
                  <Button variant="ghost" size="sm" onClick={() => open("rename")}>
                    {t("taxonomy.menu.rename")}
                  </Button>
                )
              }
              flush={(saved.slugHistory?.length ?? 0) === 0}
            >
              {(saved.slugHistory?.length ?? 0) === 0 ? (
                <SectionEmpty
                  icon={<ClockCounterClockwise size={32} className="text-kumo-inactive" />}
                  title={t("termEditor.history.empty")}
                  description={t("termEditor.history.emptyDescription", { path })}
                />
              ) : (
                <div className="grid gap-3" data-testid="slug-history">
                  <Text variant="secondary" size="sm">
                    {t("termEditor.history.description")}
                  </Text>
                  <InsetPanel>
                    <div className="grid divide-y divide-kumo-hairline">
                      {[...(saved.slugHistory ?? [])].reverse().map((old) => {
                        const from = archivePath(tax, old);
                        const r = redirects.find((x) => x.from === from);
                        return (
                          <div
                            key={old}
                            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-2 first:pt-0 last:pb-0"
                          >
                            <Text variant="mono" as="span">
                              {from}
                            </Text>
                            {r ? (
                              <>
                                <ArrowRight
                                  size={14}
                                  className="shrink-0 text-kumo-subtle"
                                  aria-hidden
                                />
                                <Text variant="mono-secondary" as="span">
                                  {r.to}
                                </Text>
                                <Badge variant="outline">{r.status}</Badge>
                              </>
                            ) : (
                              <Text variant="secondary" size="sm" as="span">
                                {t("termEditor.history.reserved")}
                              </Text>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </InsetPanel>
                </div>
              )}
            </SectionCard>
            <UsedInMenusCard siteId={siteId} kind="term" id={saved.id} />
            <DetailsCard rows={details} />
            {!retired && saved.status === "active" && (
              <DangerZoneCard
                title={t("termEditor.retire.title", {
                  singular: singular.toLocaleLowerCase(uiLocale),
                })}
                description={t("termEditor.retire.description")}
                actionLabel={t("taxonomy.menu.retire")}
                onAction={() => open("retire")}
              />
            )}
          </>
        }
      />
      <GovernanceDialog
        target={governance}
        tax={tax}
        data={data}
        onOpenChange={(o) => !o && setGovernance(undefined)}
        onDone={() => void detail.refetch()}
      />
    </PageLayout>
  );
}
