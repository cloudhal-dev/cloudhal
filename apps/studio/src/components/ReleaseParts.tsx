/**
 * Parts of a release shared by its page and the Approvals screen (RFC-0008 §15.1, §10.4): the
 * pinned items (title, path, kind, "pinned version 7 · live version 6", closure, overlaps, locks,
 * Compare) and the versions compared field by field — base → target, and what is live now after a
 * conflict (the three-way view, §6.4).
 */
import {
  Badge,
  Button,
  LayerDialog,
  Link,
  SectionEmpty,
  SkeletonLine,
  Table,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import {
  Article,
  File,
  FileText,
  GitDiff,
  LinkSimple,
  ListBullets,
  LockSimple,
  Minus,
  Package,
  Tag,
  Warning,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReleaseDiff, ReleaseItemView, ReleaseView } from "../lib/api.ts";
import { schedulesApi } from "../lib/schedules-api.ts";
import { TextChange } from "./BodyChanges.tsx";
import { type ST, scheduleKeys, useScheduleWords } from "./Schedules.tsx";

const KIND_ICON: Record<ReleaseItemView["nodeKind"], typeof Article> = {
  contentEntry: Article,
  page: FileText,
  term: Tag,
  taxonomy: Tag,
  redirect: LinkSimple,
  menu: ListBullets,
  asset: File,
};

/** Where an item is edited in Studio, when it has an editor. */
export function itemEditor(siteId: string, item: Pick<ReleaseItemView, "nodeId" | "nodeKind">) {
  const base = `/sites/${siteId}`;
  switch (item.nodeKind) {
    case "contentEntry":
      return `${base}/articles/${item.nodeId}`;
    case "page":
      return `${base}/pages/${item.nodeId}`;
    case "term":
      return `${base}/taxonomy/${item.nodeId}`;
    case "asset":
      return `${base}/media/${item.nodeId}`;
    case "menu":
      return `${base}/navigation`;
    case "redirect":
      return `${base}/redirects`;
    default:
      return undefined;
  }
}

/** "Pinned version 7 · live version 6", "not live yet", or what a removal takes down. */
export function versionsText(t: ST, item: ReleaseItemView): string {
  const r = "schedules.release.items" as const;
  if (item.kind === "remove") return t(`${r}.removes`, { live: item.liveRev ?? "—" });
  return item.liveRev === null
    ? t(`${r}.notLive`, { pinned: item.pinnedRev ?? "—" })
    : t(`${r}.versions`, { pinned: item.pinnedRev ?? "—", live: item.liveRev });
}

/** The pinned items as divided rows (no nested cards); `onCompare` adds a ghost "Compare". */
export function ReleaseItems({
  siteId,
  release,
  onCompare,
  compact,
}: {
  siteId: string;
  release: Pick<ReleaseView, "view">;
  onCompare?: (item: ReleaseItemView) => void;
  /** Approvals: no lock badges, smaller rows. */
  compact?: boolean;
}) {
  const { t } = useScheduleWords();
  const r = "schedules.release.items" as const;
  const locked = new Set(release.view.lockedNodes);
  if (release.view.items.length === 0)
    return <SectionEmpty title={t("schedules.release.noTime")} />;
  return (
    <div className="divide-y divide-kumo-hairline" data-testid="release-items">
      {release.view.items.map((item) => {
        const Icon = KIND_ICON[item.nodeKind] ?? Package;
        const href = itemEditor(siteId, item);
        const title = item.title ?? item.path ?? item.nodeId;
        return (
          <div
            key={item.nodeId}
            className={
              compact
                ? "flex flex-wrap items-start gap-x-3 gap-y-1 py-2"
                : "flex flex-wrap items-start gap-x-3 gap-y-2 px-5 py-3"
            }
            data-release-item={item.nodeId}
          >
            <span className="flex h-lh shrink-0 items-center text-kumo-subtle">
              {item.kind === "remove" ? <Minus size={16} /> : <Icon size={16} />}
            </span>
            <div className="grid min-w-0 flex-1 basis-48 gap-1">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {href ? (
                  <Link href={href}>{title}</Link>
                ) : (
                  <Text as="span" bold>
                    {title}
                  </Text>
                )}
                <Badge variant="outline">{t(`${r}.kinds.${item.nodeKind}`)}</Badge>
                {item.kind === "remove" && <Badge variant="warning">{t(`${r}.remove`)}</Badge>}
              </span>
              {item.path && (
                <Text variant="mono-secondary" as="span" truncate>
                  {item.path}
                </Text>
              )}
              <Text variant="secondary" size="sm" as="span">
                {versionsText(t, item)}
              </Text>
              {(item.closure ||
                item.overlaps.length > 0 ||
                (!compact && locked.has(item.nodeId))) && (
                <span className="flex flex-wrap items-center gap-1.5">
                  {item.closure && <Badge variant="info">{t(`${r}.closure`)}</Badge>}
                  {item.overlaps.length > 0 && (
                    <Tooltip content={t(`${r}.overlapHint`)}>
                      <Badge variant="warning" icon={<Warning />}>
                        {item.overlaps.length === 1
                          ? t(`${r}.overlapOne`)
                          : t(`${r}.overlap`, { count: item.overlaps.length })}
                      </Badge>
                    </Tooltip>
                  )}
                  {!compact && locked.has(item.nodeId) && (
                    <Tooltip content={t(`${r}.lockedHint`)}>
                      <Badge variant="secondary" icon={<LockSimple />}>
                        {t(`${r}.locked`)}
                      </Badge>
                    </Tooltip>
                  )}
                </span>
              )}
            </div>
            {onCompare && (
              <Button variant="ghost" size="sm" icon={<GitDiff />} onClick={() => onCompare(item)}>
                {t(`${r}.compare`)}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const FIELDS = [
  "title",
  "slug",
  "path",
  "status",
  "summary",
  "body",
  "availability",
  "sections",
] as const;
type Field = (typeof FIELDS)[number];
const IGNORED = new Set(["rev", "hash", "updatedAt", "createdAt", "schemaVersion", "id", "siteId"]);

/** A field's value as short plain text for the compare table. */
function show(
  t: ST,
  locale: string,
  field: Field,
  body: Record<string, unknown> | null | undefined,
) {
  if (!body) return undefined;
  const v = body[field];
  if (v === undefined || v === null || v === "") return undefined;
  if (field === "body") {
    const text = typeof v === "object" ? String((v as { value?: unknown }).value ?? "") : String(v);
    return t("schedules.release.diff.chars", { count: text.length.toLocaleString(locale) });
  }
  if (field === "sections" && Array.isArray(v)) return String(v.length);
  if (field === "availability" && typeof v === "object") {
    const a = v as { from?: string; until?: string };
    return [a.from, a.until].filter(Boolean).join(" → ");
  }
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** Fields other than the known ones that differ between two bodies. */
function otherChanges(a: Record<string, unknown> | null, b: Record<string, unknown> | null) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys].filter(
    (k) =>
      !IGNORED.has(k) &&
      !(FIELDS as readonly string[]).includes(k) &&
      JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k]),
  );
}

/** "Compare": one item's live (base) and pinned (target) versions, and the live one after a conflict. */
export function ReleaseDiffDialog({
  siteId,
  releaseId,
  item,
  onOpenChange,
}: {
  siteId: string;
  releaseId: string;
  item: ReleaseItemView | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useScheduleWords();
  const diff = useQuery({
    queryKey: [...scheduleKeys.release(siteId, releaseId), "diff"],
    queryFn: () => schedulesApi.releases.diff(siteId, releaseId),
    enabled: item !== undefined,
  });
  const d = "schedules.release.diff" as const;
  const row: ReleaseDiff["items"][number] | undefined = diff.data?.items.find(
    (i) => i.nodeId === item?.nodeId,
  );
  const threeWay = row ? "live" in row : false;
  const changed = row
    ? FIELDS.filter((f) => {
        const values = [row.base?.[f], row.target?.[f], threeWay ? row.live?.[f] : undefined];
        const shown = values.map((v) => JSON.stringify(v ?? null));
        return shown[0] !== shown[1] || (threeWay && shown[2] !== shown[1]);
      })
    : [];
  const others = row ? otherChanges(row.base, row.target) : [];
  // The body's own changes, live → pinned, block by block (RFC-0014 phase 2).
  const bodyText = (v: unknown) =>
    v && typeof v === "object" ? String((v as { value?: unknown }).value ?? "") : "";
  const bodyChange =
    row && changed.includes("body")
      ? { before: bodyText(row.base?.body), after: bodyText(row.target?.body) }
      : undefined;
  return (
    <LayerDialog.Root open={item !== undefined} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="lg" closeLabel={t(`${d}.close`)}>
        <LayerDialog.Title>{item?.title ?? t(`${d}.title`)}</LayerDialog.Title>
        <LayerDialog.Description>{t(`${d}.description`)}</LayerDialog.Description>
        <LayerDialog.Body>
          {diff.isPending ? (
            <div className="grid gap-3" role="status">
              <span className="sr-only">{t(`${d}.loading`)}</span>
              <SkeletonLine />
              <SkeletonLine />
              <SkeletonLine />
            </div>
          ) : changed.length === 0 && others.length === 0 ? (
            <SectionEmpty title={t(`${d}.noChanges`)} />
          ) : (
            <div className="overflow-x-auto" data-testid="release-diff">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>{t(`${d}.field`)}</Table.Head>
                    <Table.Head>{t("schedules.release.conflict.base")}</Table.Head>
                    {threeWay && <Table.Head>{t("schedules.release.conflict.live")}</Table.Head>}
                    <Table.Head>{t("schedules.release.conflict.target")}</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {changed.map((f) => (
                    <Table.Row key={f}>
                      <Table.Cell>
                        <Text as="span" bold>
                          {t(`${d}.fields.${f}`)}
                        </Text>
                      </Table.Cell>
                      {[row?.base, ...(threeWay ? [row?.live] : []), row?.target].map((body, i) => {
                        const value = show(t, locale, f, body);
                        return (
                          <Table.Cell key={i}>
                            <Text as="span" variant={value ? undefined : "secondary"} size="sm">
                              <span className="line-clamp-3 wrap-anywhere">
                                {value ?? t(`${d}.empty`)}
                              </span>
                            </Text>
                          </Table.Cell>
                        );
                      })}
                    </Table.Row>
                  ))}
                  {others.length > 0 && (
                    <Table.Row>
                      <Table.Cell>
                        <Text as="span" bold>
                          {t(`${d}.fields.other`)}
                        </Text>
                      </Table.Cell>
                      <Table.Cell colSpan={threeWay ? 3 : 2}>
                        <span className="flex flex-wrap gap-1.5">
                          {others.map((k) => (
                            <Badge key={k} variant="outline">
                              <span className="font-mono text-[0.9em]">{k}</span>
                            </Badge>
                          ))}
                        </span>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table>
              {bodyChange && (
                <div className="mt-4" data-testid="release-body-diff">
                  <TextChange
                    title={t(`${d}.fields.body`)}
                    before={bodyChange.before}
                    after={bodyChange.after}
                  />
                </div>
              )}
            </div>
          )}
        </LayerDialog.Body>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
