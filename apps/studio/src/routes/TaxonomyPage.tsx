import type { Taxonomy, Term } from "@cloudhal/core-contracts";
import {
  Badge,
  Banner,
  Button,
  DropdownMenu,
  Empty,
  LayerCard,
  Link,
  PageLayout,
  Pagination,
  SectionCard,
  Table,
  Tabs,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import {
  ArrowsMerge,
  Check,
  DotsThree,
  Eye,
  EyeSlash,
  FolderSimple,
  FolderSimplePlus,
  GearSix,
  HandPalm,
  Info,
  PencilSimple,
  Plus,
  Tag,
  TextAa,
  Trash,
  TreeStructure,
  X,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { ActorCell } from "../components/Audit.tsx";
import { CreateTermDialog } from "../components/CreateTermDialog.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ReadOnly, ViewOnlyBanner } from "../components/Gating.tsx";
import { GovernanceDialog, type GovernanceTarget } from "../components/GovernanceDialog.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { SettingRow } from "../components/Settings.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { TagsMigrationBanner, TagsMigrationDialog } from "../components/TagsMigration.tsx";
import {
  IndexBadge,
  invalidateTaxonomy,
  TermNameCell,
  useTaxonomyData,
  VisibilityBadge,
} from "../components/Taxonomy.tsx";
import { TaxonomyHealthCard } from "../components/TaxonomyHealthCard.tsx";
import { TaxonomySettingsDialog } from "../components/TaxonomySettingsDialog.tsx";
import { useToast } from "../components/Toast.ts";
import { useGate } from "../components/useMe.ts";
import { useI18n, useT } from "../i18n/index.tsx";
import { api, type TermListItem } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import {
  archiveCounts,
  foldName,
  indexStatus,
  matchesFilter,
  needsTagsMigration,
  TERM_FILTERS,
  type TermFilter,
  termTree,
} from "../lib/taxonomy.ts";

const PER_PAGE = 50;

/** Taxonomies in tab order: categories, tags, then custom ones by key. */
function ordered(taxonomies: readonly Taxonomy[]): Taxonomy[] {
  const rank = (k: string) => (k === "category" ? 0 : k === "tag" ? 1 : 2);
  return [...taxonomies].sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
}

function matchesSearch(term: Term, q: string): boolean {
  if (!q) return true;
  if (term.slug.includes(q)) return true;
  return Object.values(term.labels).some(
    (l) =>
      l !== undefined &&
      (foldName(l.name).includes(q) || (l.altNames ?? []).some((a) => foldName(a).includes(q))),
  );
}

/**
 * Site › Categories & tags (DESIGN.md §2p): one tab per taxonomy — a tree for categories, a flat
 * table for tags — with status filters, usage, indexing and visibility per term, the proposed
 * review, the governance row menu and the vocabulary health panel. "New taxonomy" and each
 * taxonomy's settings open `TaxonomySettingsDialog`.
 */
export function TaxonomyPage() {
  const t = useT();
  const { locale } = useI18n();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const search = useSearch({ strict: false }) as { taxonomy?: string; filter?: TermFilter };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const data = useTaxonomyData(siteId);
  const entries = useQuery({
    // Every collection, as MCP `taxonomy_report` reads them (a taxonomy may apply to any).
    queryKey: ["entries", siteId, "all"],
    queryFn: () => api.entries.list(siteId),
  });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [governance, setGovernance] = useState<GovernanceTarget | undefined>();
  // The mode outlives `open` so the dialog keeps its title while it closes.
  const [settings, setSettings] = useState<{ open: boolean; mode: "new" | "edit" }>({
    open: false,
    mode: "new",
  });

  const taxonomies = ordered(data.taxonomies.data ?? []);
  const tax = taxonomies.find((x) => x.key === search.taxonomy) ?? taxonomies[0];
  const filter: TermFilter = search.filter ?? "all";
  const setSearch = (next: { taxonomy?: string; filter?: TermFilter }) => {
    setPage(1);
    void navigate({
      to: "/sites/$siteId/taxonomy",
      params: { siteId },
      search: {
        ...((next.taxonomy ?? tax?.key) ? { taxonomy: next.taxonomy ?? tax?.key } : {}),
        ...((next.filter ?? filter) !== "all" ? { filter: next.filter ?? filter } : {}),
      },
      replace: true,
    });
  };

  const all = data.itemsOf(tax);
  const counts = Object.fromEntries(
    TERM_FILTERS.map((f) => [f, all.filter((i) => matchesFilter(i.term, f)).length]),
  ) as Record<TermFilter, number>;
  const q = foldName(query);
  const visible = all.filter((i) => matchesFilter(i.term, filter) && matchesSearch(i.term, q));
  const rows =
    tax?.hierarchical && !q
      ? termTree(visible)
      : visible.map((item) => ({ item, depth: 0, ancestors: [] as Term[], hasChildren: false }));
  const pageRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const published = tax ? archiveCounts(all, tax.hierarchical) : new Map<string, number>();
  const singular = tax ? data.label(tax, "singular") : "";
  const Plural = tax ? data.label(tax, "plural") : "";
  const plural = Plural.toLocaleLowerCase(locale);
  const singularLower = singular.toLocaleLowerCase(locale);
  const names = { plural, Plural, singular: singularLower };

  const approve = useMutation({
    mutationFn: (term: Term) => api.terms.govern(term, { op: "review", decision: "approve" }),
    onSuccess: async (_r, term) => {
      await invalidateTaxonomy(qc, siteId);
      toast.success(
        t("taxonomy.review.approved", { name: data.name(term) }),
        t("governance.oneSnapshot"),
      );
    },
    onError: (e) => toast.error(t("taxonomy.review.failed"), apiErrorText(t, e)),
  });

  const open = (kind: GovernanceTarget["kind"], term: Term, into?: string) =>
    setGovernance({ kind, term, into });
  const editHref = (term: Term) => `/sites/${siteId}/taxonomy/${term.id}`;
  const mergedName = (term: Term) => {
    const target = term.mergedInto ? data.byId.get(term.mergedInto)?.term : undefined;
    return target ? data.name(target) : undefined;
  };
  const noTaxonomies = data.taxonomies.data !== undefined && taxonomies.length === 0;
  // Governing the vocabulary is structure: Editors and above (RFC-0005 §2.2, DESIGN.md §2s).
  const structure = useGate("structure.write");
  const settingsGate = useGate("settings.write");

  const newTaxonomyButton = (
    <Button
      variant="secondary"
      icon={<FolderSimplePlus />}
      onClick={() => setSettings({ open: true, mode: "new" })}
      disabled={structure.reason !== undefined}
      title={structure.reason}
      data-testid="new-taxonomy"
    >
      {t("taxonomySettings.newTaxonomy")}
    </Button>
  );
  const newButton = (
    <Button
      variant="primary"
      icon={<Plus />}
      onClick={() => setCreateOpen(true)}
      disabled={!tax || structure.reason !== undefined}
      title={structure.reason}
      data-testid="new-term"
    >
      {t("taxonomy.newTerm", { singular: singular.toLocaleLowerCase(locale) })}
    </Button>
  );

  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[{ label: t("pageHeaders.taxonomy.title") }]} />}
      icon={<Tag size={24} />}
      title={t("pageHeaders.taxonomy.title")}
      description={t("pageHeaders.taxonomy.description")}
      actions={
        tax ? (
          <>
            <Tooltip
              content={t("taxonomySettings.open", { Singular: singular })}
              render={
                <Button
                  variant="secondary"
                  shape="square"
                  icon={<GearSix />}
                  aria-label={t("taxonomySettings.open", { Singular: singular })}
                  onClick={() => setSettings({ open: true, mode: "edit" })}
                  data-testid="taxonomy-settings-open"
                />
              }
            />
            {newTaxonomyButton}
            {newButton}
          </>
        ) : undefined
      }
      {...(taxonomies.length > 0
        ? {
            tabs: taxonomies.map((x) => ({ value: x.key, label: data.label(x) })),
            tab: tax?.key,
            onTabChange: (key: string) => setSearch({ taxonomy: key, filter: "all" }),
          }
        : {})}
      aside={
        tax ? (
          <>
            <ReadOnly reason={structure.reason}>
              <TaxonomyHealthCard
                tax={tax}
                data={data}
                entries={entries.data}
                onMerge={(source, target) => {
                  const term = data.byId.get(source)?.term;
                  if (term)
                    open(term.status === "proposed" ? "reviewMerge" : "merge", term, target);
                }}
                onReview={() => setSearch({ filter: "proposed" })}
              />
            </ReadOnly>
            <TaxonomyRulesCard
              tax={tax}
              names={names}
              onEdit={() => setSettings({ open: true, mode: "edit" })}
              editReason={structure.reason}
            />
          </>
        ) : undefined
      }
    >
      <ErrorBanner error={data.taxonomies.error ?? data.terms.error} />
      <ViewOnlyBanner reason={structure.reason} />
      {needsTagsMigration(data.taxonomies.data, entries.data) && !noTaxonomies && (
        <TagsMigrationBanner siteId={siteId} />
      )}
      {noTaxonomies ? (
        <Empty
          icon={<Tag size={48} className="text-kumo-inactive" />}
          title={t("taxonomy.empty.noTaxonomies")}
          description={t("taxonomy.empty.noTaxonomiesDescription")}
          commandLine="cloudhal migrate tags-to-terms --dry-run"
          contents={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="primary"
                onClick={() => setMigrationOpen(true)}
                disabled={settingsGate.reason !== undefined}
                title={settingsGate.reason}
              >
                {t("migration.banner.action")}
              </Button>
              {newTaxonomyButton}
            </div>
          }
        />
      ) : (
        <>
          {filter !== "proposed" && counts.proposed > 0 && (
            <Banner
              variant="alert"
              icon={<HandPalm weight="fill" />}
              title={t("taxonomy.review.waiting", { count: counts.proposed })}
              description={t("taxonomy.review.waitingDescription", names)}
              action={
                <Banner.Action
                  variant="secondary"
                  onClick={() => setSearch({ filter: "proposed" })}
                >
                  {t("taxonomy.review.open")}
                </Banner.Action>
              }
              data-testid="proposed-banner"
            />
          )}
          <ListToolbar
            search={query}
            onSearch={(v) => {
              setQuery(v);
              setPage(1);
            }}
            placeholder={tax ? t("taxonomy.search", names) : t("common.loading")}
            actions={
              <div className="max-w-full min-w-0" data-testid="term-filters">
                <Tabs
                  variant="segmented"
                  value={filter}
                  onValueChange={(v) => setSearch({ filter: v as TermFilter })}
                  tabs={TERM_FILTERS.map((f) => ({
                    value: f,
                    label:
                      f === "proposed" && counts.proposed > 0 ? (
                        <span className="flex items-center gap-1.5">
                          {t(`taxonomy.filters.${f}`)}
                          <Badge variant="warning">{counts.proposed}</Badge>
                        </span>
                      ) : (
                        t(`taxonomy.filters.${f}`)
                      ),
                  }))}
                />
              </div>
            }
          />
          {data.terms.isSuccess && rows.length === 0 ? (
            <Empty
              icon={
                tax?.hierarchical ? (
                  <FolderSimple size={48} className="text-kumo-inactive" />
                ) : (
                  <Tag size={48} className="text-kumo-inactive" />
                )
              }
              title={q ? t("taxonomy.empty.search") : t(`taxonomy.empty.${filter}`, names)}
              description={
                filter === "all" && !q
                  ? t("taxonomy.empty.allDescription")
                  : t("taxonomy.empty.filteredDescription")
              }
              contents={filter === "all" && !q ? newButton : undefined}
            />
          ) : (
            <ReadOnly reason={structure.reason} className="min-w-0">
              <LayerCard className="overflow-x-auto p-0">
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.Head>{t("taxonomy.columns.name")}</Table.Head>
                      <Table.Head>{t("taxonomy.columns.usage")}</Table.Head>
                      <Table.Head>{t("taxonomy.columns.index")}</Table.Head>
                      <Table.Head>{t("taxonomy.columns.visibility")}</Table.Head>
                      <Table.Head sticky="right" className="w-0">
                        <span className="sr-only">{t("site.rowMenu")}</span>
                      </Table.Head>
                    </Table.Row>
                  </Table.Header>
                  {!data.terms.isSuccess || !tax ? (
                    <TableSkeleton columns={5} />
                  ) : (
                    <Table.Body>
                      {pageRows.map((row) => {
                        const { term, usage } = row.item as TermListItem;
                        const parent =
                          row.depth === 0 && term.parentId
                            ? data.byId.get(term.parentId)?.term
                            : undefined;
                        return (
                          <Table.Row key={term.id} data-term-id={term.id} data-status={term.status}>
                            <Table.Cell>
                              <TermNameCell
                                term={term}
                                tax={tax}
                                name={data.name(term)}
                                depth={row.depth}
                                href={editHref(term)}
                                mergedInto={mergedName(term)}
                                context={
                                  parent
                                    ? t("pickers.under", { path: data.name(parent) })
                                    : undefined
                                }
                              />
                              {term.status === "proposed" && term.proposedBy && (
                                <div
                                  className="mt-2 flex flex-wrap items-center gap-2"
                                  data-testid="proposed-by"
                                >
                                  <Text variant="secondary" size="sm" as="span">
                                    {t("taxonomy.review.proposedBy")}
                                  </Text>
                                  <ActorCell actor={term.proposedBy} />
                                </div>
                              )}
                              {term.status === "proposed" && (
                                <div
                                  className="mt-2 flex flex-wrap items-center gap-1.5"
                                  data-testid="review-actions"
                                >
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={<Check />}
                                    loading={approve.isPending && approve.variables?.id === term.id}
                                    onClick={() => approve.mutate(term)}
                                    data-testid="approve-term"
                                  >
                                    {t("taxonomy.review.approve")}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    icon={<ArrowsMerge />}
                                    onClick={() => open("reviewMerge", term)}
                                    data-testid="merge-proposal"
                                  >
                                    {t("taxonomy.review.merge")}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    icon={<X />}
                                    aria-label={t("taxonomy.review.rejectNamed", {
                                      name: data.name(term),
                                    })}
                                    onClick={() => open("reject", term)}
                                    data-testid="reject-term"
                                  >
                                    {t("taxonomy.review.reject")}
                                  </Button>
                                </div>
                              )}
                            </Table.Cell>
                            <Table.Cell className="whitespace-nowrap">
                              <span className="grid gap-0.5">
                                {usage.total === 0 ? (
                                  <Text variant="secondary" as="span">
                                    {t("taxonomy.usage.none")}
                                  </Text>
                                ) : (
                                  <Tooltip
                                    content={t("taxonomy.usage.hint", {
                                      published: usage.published,
                                      total: usage.total,
                                    })}
                                  >
                                    <span className="inline-flex" data-testid="usage">
                                      {tax.key === "category" || tax.key === "tag" ? (
                                        <Link
                                          href={`/sites/${siteId}/articles?${tax.key}=${term.slug}`}
                                          variant="plain"
                                        >
                                          <Text as="span">
                                            {t("taxonomy.usage.value", {
                                              published: usage.published,
                                              total: usage.total,
                                            })}
                                          </Text>
                                        </Link>
                                      ) : (
                                        <Text as="span">
                                          {t("taxonomy.usage.value", {
                                            published: usage.published,
                                            total: usage.total,
                                          })}
                                        </Text>
                                      )}
                                    </span>
                                  </Tooltip>
                                )}
                                {usage.lastUsedAt && (
                                  <span className="flex items-center gap-1" data-testid="last-used">
                                    <Text variant="secondary" size="xs" as="span">
                                      {t("taxonomy.columns.lastUsed")}
                                    </Text>
                                    <RelativeTime iso={usage.lastUsedAt} size="xs" />
                                  </span>
                                )}
                              </span>
                            </Table.Cell>
                            <Table.Cell>
                              <IndexBadge
                                status={indexStatus(
                                  term,
                                  tax,
                                  published.get(term.id) ?? 0,
                                  data.defaultLocale,
                                )}
                              />
                            </Table.Cell>
                            <Table.Cell className="whitespace-nowrap">
                              <VisibilityBadge term={term} />
                            </Table.Cell>
                            <Table.Cell sticky="right" className="w-0 text-right">
                              <span className="flex items-center justify-end gap-1.5">
                                <TermRowMenu
                                  term={term}
                                  tax={tax}
                                  onEdit={() =>
                                    navigate({
                                      to: "/sites/$siteId/taxonomy/$termId",
                                      params: { siteId, termId: term.id },
                                    })
                                  }
                                  onOpen={(kind) => open(kind, term)}
                                />
                              </span>
                            </Table.Cell>
                          </Table.Row>
                        );
                      })}
                    </Table.Body>
                  )}
                </Table>
              </LayerCard>
            </ReadOnly>
          )}
          {rows.length > PER_PAGE && (
            <Pagination page={page} perPage={PER_PAGE} totalCount={rows.length} setPage={setPage} />
          )}
        </>
      )}
      <CreateTermDialog open={createOpen} onOpenChange={setCreateOpen} tax={tax} data={data} />
      <GovernanceDialog
        target={governance}
        tax={tax}
        data={data}
        onOpenChange={(o) => !o && setGovernance(undefined)}
      />
      <TagsMigrationDialog siteId={siteId} open={migrationOpen} onOpenChange={setMigrationOpen} />
      <TaxonomySettingsDialog
        open={settings.open}
        onOpenChange={(open) => setSettings((s) => ({ ...s, open }))}
        siteId={siteId}
        taxonomy={settings.mode === "edit" ? tax : undefined}
        data={data}
        onCreated={(created) => setSearch({ taxonomy: created.key, filter: "all" })}
      />
    </PageLayout>
  );
}

/** The row's actions: edit, the governance operations a term's state allows, retire last. */
function TermRowMenu({
  term,
  tax,
  onEdit,
  onOpen,
}: {
  term: Term;
  tax: Taxonomy;
  onEdit: () => void;
  onOpen: (kind: GovernanceTarget["kind"]) => void;
}) {
  const t = useT();
  return (
    <DropdownMenu>
      <Tooltip
        content={t("site.rowMenu")}
        render={
          <DropdownMenu.Trigger
            render={
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                icon={<DotsThree weight="bold" />}
                aria-label={t("taxonomy.menu.label")}
                data-testid="term-menu"
              />
            }
          />
        }
      />
      <DropdownMenu.Content align="end">
        <DropdownMenu.Item icon={PencilSimple} onClick={onEdit}>
          {term.status === "retired" ? t("taxonomy.menu.view") : t("taxonomy.menu.edit")}
        </DropdownMenu.Item>
        {term.status === "proposed" && (
          <DropdownMenu.Item icon={ArrowsMerge} onClick={() => onOpen("reviewMerge")}>
            {t("taxonomy.menu.mergeExisting")}
          </DropdownMenu.Item>
        )}
        {term.status === "active" && (
          <>
            <DropdownMenu.Item icon={TextAa} onClick={() => onOpen("rename")}>
              {t("taxonomy.menu.rename")}
            </DropdownMenu.Item>
            <DropdownMenu.Item icon={ArrowsMerge} onClick={() => onOpen("merge")}>
              {t("taxonomy.menu.merge")}
            </DropdownMenu.Item>
            {tax.hierarchical && (
              <DropdownMenu.Item icon={TreeStructure} onClick={() => onOpen("move")}>
                {t("taxonomy.menu.move")}
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item
              icon={term.visibility === "public" ? EyeSlash : Eye}
              onClick={() => onOpen("visibility")}
            >
              {term.visibility === "public"
                ? t("taxonomy.menu.makeInternal")
                : t("taxonomy.menu.makePublic")}
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item icon={Trash} variant="danger" onClick={() => onOpen("retire")}>
              {t("taxonomy.menu.retire")}
            </DropdownMenu.Item>
          </>
        )}
        {term.status === "proposed" && (
          <>
            <DropdownMenu.Separator />
            <DropdownMenu.Item icon={X} variant="danger" onClick={() => onOpen("reject")}>
              {t("taxonomy.review.reject")}
            </DropdownMenu.Item>
          </>
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

/** How the taxonomy works: who adds terms, required, per-article limit, archives and indexing. */
function TaxonomyRulesCard({
  tax,
  names,
  onEdit,
  editReason,
}: {
  tax: Taxonomy;
  names: { plural: string; Plural: string; singular: string };
  onEdit: () => void;
  /** Why the person may not change the taxonomy's settings (structure.write), if they may not. */
  editReason?: string | undefined;
}) {
  const t = useT();
  return (
    <SectionCard
      id="rules"
      title={t("taxonomy.rules.title", names)}
      icon={<Info size={16} />}
      description={t("taxonomy.rules.description")}
      actions={
        <Button
          variant="ghost"
          size="sm"
          icon={<GearSix />}
          onClick={onEdit}
          disabled={editReason !== undefined}
          title={editReason}
          data-testid="rules-edit"
        >
          {t("taxonomySettings.edit")}
        </Button>
      }
    >
      <dl className="-my-3 grid divide-y divide-kumo-hairline">
        <SettingRow
          label={t("taxonomy.rules.structure")}
          hint={tax.hierarchical ? t("taxonomy.rules.treeHint") : t("taxonomy.rules.flatHint")}
        >
          <Badge variant="outline">
            {tax.hierarchical ? t("taxonomy.rules.tree") : t("taxonomy.rules.flat")}
          </Badge>
        </SettingRow>
        <SettingRow
          label={t("taxonomy.rules.newTerms")}
          hint={t(`taxonomy.rules.newTermsHint.${tax.allowNewTerms}`)}
        >
          <Badge variant="outline">{t(`taxonomy.rules.newTermsValue.${tax.allowNewTerms}`)}</Badge>
        </SettingRow>
        <SettingRow
          label={t("taxonomy.rules.perArticle")}
          hint={tax.required ? t("taxonomy.rules.requiredHint") : t("taxonomy.rules.optionalHint")}
        >
          <Badge variant={tax.required ? "info" : "secondary"}>
            {tax.required
              ? t("taxonomy.rules.required", { max: tax.maxPerEntry ?? 50 })
              : t("taxonomy.rules.optional", { max: tax.maxPerEntry ?? 50 })}
          </Badge>
        </SettingRow>
        <SettingRow
          label={t("taxonomy.rules.archive")}
          hint={
            tax.archive.enabled
              ? t("taxonomy.rules.archiveHint", { min: tax.minEntriesToIndex })
              : t("taxonomy.rules.archiveOff")
          }
        >
          <Text variant="mono-secondary" as="span">
            {tax.archive.enabled ? `${tax.archive.basePath}/…` : t("common.off")}
          </Text>
        </SettingRow>
      </dl>
    </SectionCard>
  );
}
