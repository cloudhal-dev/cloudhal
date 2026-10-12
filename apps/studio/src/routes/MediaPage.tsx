import {
  Button,
  Empty,
  LayerCard,
  Link,
  MediaDropZone,
  MediaGrid,
  MediaTile,
  PageLayout,
  Select,
  SkeletonLine,
  Table,
  Tabs,
  Text,
  Toolbar,
  useFileChooser,
} from "@cloudhal/ui";
import { Images, ListBullets, SquaresFour, UploadSimple } from "@phosphor-icons/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { AssetBadges, AssetFrame, UsageBadge } from "../components/Media.tsx";
import { UploadDialog } from "../components/MediaUpload.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { RowMenu } from "../components/RowMenu.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { useGate } from "../components/useMe.ts";
import { useI18n, useT } from "../i18n/index.tsx";
import { type AssetListQuery, api } from "../lib/api.ts";
import {
  ACCEPT_ALL,
  ASSET_KINDS,
  type AssetKind,
  assetTitle,
  formatSize,
  LIBRARY_PAGE_SIZE,
  typeLabel,
} from "../lib/media.ts";

type KindFilter = "all" | AssetKind;
type ShowFilter = "active" | "unused" | "missingAlt" | "agents" | "retired";
type View = "grid" | "list";

const VIEW_KEY = "cloudhal.studio.media.view";

/** The library filters as API parameters: retired files are hidden unless asked for (§2.1). */
export function libraryQuery(kind: KindFilter, show: ShowFilter, q: string): AssetListQuery {
  return {
    ...(kind !== "all" ? { kind: [kind] } : {}),
    status: show === "retired" ? ["retired"] : ["active"],
    ...(show === "unused" ? { unused: true } : {}),
    ...(show === "missingAlt" ? { missingAlt: true } : {}),
    ...(show === "agents" ? { uploadedBy: "agent" as const } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
  };
}

function useStoredView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  return [
    view,
    (next) => {
      setView(next);
      try {
        localStorage.setItem(VIEW_KEY, next);
      } catch {}
    },
  ];
}

/**
 * Site › Content › Media (DESIGN.md §2u, RFC-0004 §8): every file of the site as a grid of tiles or
 * a table, searchable and filtered by kind and state, with uploads by drop or the header button.
 * Uploading needs `assets.upload`; the gated button says who may.
 */
export function MediaPage() {
  const t = useT();
  const { locale } = useI18n();
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const navigate = useNavigate();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const defaultLocale = site.data?.defaultLocale ?? "en";
  const upload = useGate("assets.upload");
  const [kind, setKind] = useState<KindFilter>("all");
  const [show, setShow] = useState<ShowFilter>("active");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useStoredView();
  const [dialog, setDialog] = useState<{ open: boolean; files: File[] }>({
    open: false,
    files: [],
  });
  // Search waits for a pause in typing.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const filters = libraryQuery(kind, show, q);
  const assets = useInfiniteQuery({
    queryKey: ["assets", siteId, "library", filters],
    queryFn: ({ pageParam }) =>
      api.assets.list(siteId, { ...filters, cursor: pageParam, limit: LIBRARY_PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = assets.data?.pages.flatMap((p) => p.assets) ?? [];
  const filtered = kind !== "all" || show !== "active" || q.trim() !== "";
  const openUpload = (files: File[]) => setDialog({ open: true, files });
  const chooser = useFileChooser(openUpload, { accept: ACCEPT_ALL });
  const href = (id: string) => `/sites/${siteId}/media/${id}`;

  const uploadButton = (
    <Button
      variant="primary"
      icon={<UploadSimple />}
      onClick={chooser.open}
      disabled={!upload.allowed}
      title={upload.reason}
      data-testid="media-upload"
    >
      {t("media.upload.button")}
    </Button>
  );

  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[{ label: t("pageHeaders.media.title") }]} />}
      icon={<Images size={24} />}
      title={t("pageHeaders.media.title")}
      description={t("pageHeaders.media.description")}
      actions={
        <>
          {chooser.input}
          {uploadButton}
        </>
      }
    >
      <ErrorBanner error={assets.error} onRetry={() => void assets.refetch()} />
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder={t("media.search")}
        actions={
          <>
            {filtered && (
              <Button
                variant="ghost"
                onClick={() => {
                  setKind("all");
                  setShow("active");
                  setSearch("");
                }}
              >
                {t("media.filters.clear")}
              </Button>
            )}
            <Toolbar aria-label={t("media.filters.label")}>
              <Select
                aria-label={t("media.filters.kind")}
                value={kind}
                onValueChange={(v) => setKind(v as KindFilter)}
                items={{
                  all: t("media.filters.allKinds"),
                  ...Object.fromEntries(ASSET_KINDS.map((k) => [k, t(`media.kindsPlural.${k}`)])),
                }}
                render={<Toolbar.Button />}
                data-testid="media-kind"
              />
              <Select
                aria-label={t("media.filters.show")}
                value={show}
                onValueChange={(v) => setShow(v as ShowFilter)}
                items={{
                  active: t("media.filters.active"),
                  unused: t("media.filters.unused"),
                  missingAlt: t("media.filters.missingAlt"),
                  agents: t("media.filters.agents"),
                  retired: t("media.filters.retired"),
                }}
                render={<Toolbar.Button />}
                data-testid="media-show"
              />
            </Toolbar>
            <Tabs
              variant="segmented"
              value={view}
              onValueChange={(v) => setView(v as View)}
              tabs={[
                {
                  value: "grid",
                  label: (
                    <span className="flex items-center gap-1.5" title={t("media.views.grid")}>
                      <SquaresFour size={16} aria-hidden />
                      <span className="sr-only sm:not-sr-only">{t("media.views.grid")}</span>
                    </span>
                  ),
                },
                {
                  value: "list",
                  label: (
                    <span className="flex items-center gap-1.5" title={t("media.views.list")}>
                      <ListBullets size={16} aria-hidden />
                      <span className="sr-only sm:not-sr-only">{t("media.views.list")}</span>
                    </span>
                  ),
                },
              ]}
            />
          </>
        }
      />
      <MediaDropZone
        variant="overlay"
        onFiles={openUpload}
        disabledReason={upload.reason}
        labels={{
          title: t("media.drop.title"),
          choose: t("media.drop.choose"),
          release: t("media.drop.release"),
        }}
        data-testid="media-library"
      >
        {assets.data && items.length === 0 ? (
          <Empty
            icon={<Images size={48} className="text-kumo-inactive" />}
            title={filtered ? t("media.empty.filteredTitle") : t("media.empty.title")}
            description={
              filtered ? t("media.empty.filteredDescription") : t("media.empty.description")
            }
            contents={filtered ? undefined : uploadButton}
          />
        ) : view === "grid" ? (
          assets.isPending ? (
            <div className="grid gap-3" role="status" aria-label={t("common.loading")}>
              <SkeletonLine />
              <SkeletonLine />
              <SkeletonLine />
            </div>
          ) : (
            <MediaGrid label={t("pageHeaders.media.title")}>
              {items.map(({ asset, usage }) => (
                <MediaTile
                  key={asset.id}
                  href={href(asset.id)}
                  preview={<AssetFrame siteId={siteId} asset={asset} size="tile" />}
                  title={assetTitle(asset, locale, defaultLocale)}
                  meta={`${typeLabel(asset.mediaType)} · ${formatSize(asset.bytes, locale)}`}
                  badges={
                    <>
                      <UsageBadge count={usage} overlay />
                      <AssetBadges asset={asset} defaultLocale={defaultLocale} compact />
                    </>
                  }
                  data-testid="media-tile"
                />
              ))}
            </MediaGrid>
          )
        ) : (
          <LayerCard className="overflow-x-auto p-0">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{t("media.columns.file")}</Table.Head>
                  <Table.Head>{t("media.columns.type")}</Table.Head>
                  <Table.Head>{t("media.columns.size")}</Table.Head>
                  <Table.Head>{t("media.columns.usage")}</Table.Head>
                  <Table.Head>{t("media.columns.added")}</Table.Head>
                  <Table.Head sticky="right" className="w-0">
                    <span className="sr-only">{t("site.rowMenu")}</span>
                  </Table.Head>
                </Table.Row>
              </Table.Header>
              {assets.isPending ? (
                <TableSkeleton columns={6} />
              ) : (
                <Table.Body>
                  {items.map(({ asset, usage }) => (
                    <Table.Row key={asset.id} data-asset-id={asset.id}>
                      <Table.Cell>
                        <span className="flex min-w-64 items-center gap-3">
                          <AssetFrame siteId={siteId} asset={asset} size="thumb" />
                          <span className="grid min-w-0 gap-1">
                            <Link href={href(asset.id)} variant="plain">
                              <Text as="span" truncate>
                                {assetTitle(asset, locale, defaultLocale)}
                              </Text>
                            </Link>
                            <span className="flex flex-wrap items-center gap-1">
                              <AssetBadges asset={asset} defaultLocale={defaultLocale} />
                            </span>
                          </span>
                        </span>
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap">
                        <Text as="span">{typeLabel(asset.mediaType)}</Text>
                        {asset.image && (
                          <Text as="span" variant="secondary" size="sm">
                            {` · ${asset.image.width} × ${asset.image.height}`}
                          </Text>
                        )}
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap">
                        <Text as="span">{formatSize(asset.bytes, locale)}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <UsageBadge count={usage} />
                      </Table.Cell>
                      <Table.Cell>
                        <span className="grid min-w-32 gap-0.5">
                          <Text as="span" truncate>
                            {asset.uploadedBy.name ?? asset.uploadedBy.id}
                          </Text>
                          <RelativeTime iso={asset.createdAt} />
                        </span>
                      </Table.Cell>
                      <Table.Cell sticky="right" className="w-0 text-right">
                        <RowMenu
                          onOpen={() =>
                            navigate({
                              to: "/sites/$siteId/media/$assetId",
                              params: { siteId, assetId: asset.id },
                            })
                          }
                        />
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              )}
            </Table>
          </LayerCard>
        )}
      </MediaDropZone>
      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Text variant="secondary" size="sm" as="span">
            {t("media.loaded", { count: items.length })}
          </Text>
          {assets.hasNextPage ? (
            <Button
              variant="secondary"
              loading={assets.isFetchingNextPage}
              onClick={() => void assets.fetchNextPage()}
            >
              {t("media.loadMore")}
            </Button>
          ) : (
            <Text variant="secondary" size="sm" as="span">
              {t("media.allLoaded")}
            </Text>
          )}
        </div>
      )}
      <UploadDialog
        siteId={siteId}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ open, files: open ? d.files : [] }))}
        initialFiles={dialog.files}
        accept={ACCEPT_ALL}
        disabledReason={upload.reason}
      />
    </PageLayout>
  );
}
