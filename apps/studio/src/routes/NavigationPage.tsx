import type { Menu, MenuItem, Site } from "@cloudhal/core-contracts";
import {
  Badge,
  Banner,
  Button,
  DropdownMenu,
  InlineCopyText,
  Input,
  MenuTree,
  type MenuTreeEvent,
  type MenuTreeItem,
  type MenuTreeRowContext,
  NavigationPreview,
  PageLayout,
  SectionCard,
  SectionEmpty,
  Select,
  SkeletonLine,
  Tabs,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import {
  ArrowDown,
  ArrowsClockwise,
  ArrowUp,
  DeviceMobile,
  DotsThree,
  Eye,
  EyeSlash,
  GearSix,
  Info,
  Lock,
  Monitor,
  PencilSimple,
  Plus,
  TextIndent,
  TextOutdent,
  Trash,
  TreeStructure,
  WarningCircle,
  Wrench,
} from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import {
  DangerZoneCard,
  DetailsCard,
  EditorLayout,
  PreviewToggle,
  usePreviewVisible,
} from "../components/EditorLayout.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { CreateMenuDialog, FromPagesDialog } from "../components/MenuDialogs.tsx";
import { MenuItemDialog, type ParentOption } from "../components/MenuItemDialog.tsx";
import { MenuSaveDialog } from "../components/MenuSaveDialog.tsx";
import {
  HiddenBadge,
  menuKeys,
  TargetChip,
  useMenuName,
  useMenuTitle,
} from "../components/Menus.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { SettingRow } from "../components/Settings.tsx";
import { useTaxonomyData } from "../components/Taxonomy.tsx";
import { useToast } from "../components/Toast.ts";
import { useGate } from "../components/useMe.ts";
import { useT } from "../i18n/index.tsx";
import { ApiRequestError, api } from "../lib/api.ts";
import {
  type DraftProblem,
  deltaLines,
  draftProblem,
  findItem,
  hiddenRoots,
  insertItem,
  itemDepth,
  MENU_LIMITS,
  type MenuDraft,
  type MenuWrite,
  menuUsage,
  moveItem,
  type NavItemView,
  nearLimit,
  orderedKeys,
  removeItem,
  replaceItem,
  resolvedById,
  sameDraft,
  saveBody,
  shownLabel,
  summarizeTarget,
  type TargetData,
} from "../lib/menus.ts";

/** Waits until `value` has been stable for `ms` (the preview is resolved on the server). */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

type Device = "desktop" | "mobile";

/** Until the site loads (the item dialog is always rendered, closed). */
const NO_SITE: Pick<Site, "defaultLocale" | "locales"> = { defaultLocale: "en", locales: ["en"] };
const NO_DATA: TargetData = { site: NO_SITE, pages: [], entries: [], taxonomies: [], terms: [] };

/** One menu of the preview: shown items as `NavigationPreview` takes them. */
function previewItems(items: NavItemView[] | undefined): NavItemView[] {
  return items ?? [];
}

/**
 * Site › Settings › Navigation (RFC-0003 §8, DESIGN.md §2t): one tab per menu — the header
 * (`primary`), the footer, then custom keys — with the `MenuTree` editor, the target picker,
 * hidden-item badges with a fix, limits, a live header/footer preview and a save that shows the
 * §6.3 delta before its one `PUT`. A key without a menu shows the theme's derived default and
 * "Create menu from current pages".
 */
export function NavigationPage() {
  const t = useT("menus");
  const { siteId } = useParams({ from: "/sites/$siteId" });
  const search = useSearch({ strict: false }) as { menu?: string; item?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const name = useMenuName();
  const title = useMenuTitle();
  // Menus are structure: Editors and above (RFC-0005 §2.2). Cosmetic; the API refuses anyway.
  const can = useGate("structure.write").allowed;
  const [previewVisible, setPreviewVisible] = usePreviewVisible();

  const overview = useQuery({
    queryKey: menuKeys.overview(siteId),
    queryFn: () => api.menus.list(siteId),
  });
  const taxonomy = useTaxonomyData(siteId);
  const pages = useQuery({ queryKey: ["pages", siteId], queryFn: () => api.pages.list(siteId) });
  const entries = useQuery({
    queryKey: ["entries", siteId, "all"],
    queryFn: () => api.entries.list(siteId),
  });
  const site = taxonomy.site.data;
  const terms = useMemo(() => taxonomy.items.map((i) => i.term), [taxonomy.items]);
  const data: TargetData | undefined = useMemo(
    () =>
      site
        ? {
            site,
            pages: pages.data ?? [],
            entries: entries.data ?? [],
            taxonomies: taxonomy.taxonomies.data ?? [],
            terms,
          }
        : undefined,
    [site, pages.data, entries.data, taxonomy.taxonomies.data, terms],
  );
  const taxonomyName = (key: string) => {
    const tax = taxonomy.taxonomies.data?.find((x) => x.key === key);
    return tax ? taxonomy.label(tax, "singular") : key;
  };
  const taxonomyGroup = (key: string) => {
    const tax = taxonomy.taxonomies.data?.find((x) => x.key === key);
    return tax ? taxonomy.label(tax, "plural") : key;
  };

  const o = overview.data;
  const keys = orderedKeys([
    ...(o?.menus ?? []).map((m) => m.menu.key),
    ...(o?.derived ?? []).map((d) => d.key),
  ]);
  const activeKey =
    search.menu && keys.includes(search.menu) ? search.menu : (keys[0] ?? "primary");
  const summary = o?.menus.find((m) => m.menu.key === activeKey);
  const menu = summary?.menu;
  const derived = o?.derived.find((d) => d.key === activeKey);
  const limits = o?.limits ?? { ...MENU_LIMITS, ops: 50 };
  const defaultDepth = (key: string) => o?.defaultDepth[key] ?? o?.defaultDepth.other ?? 3;

  // ---- the draft: the menu as the person is shaping it ----
  const [base, setBase] = useState<Menu | undefined>();
  const [draft, setDraft] = useState<MenuDraft | undefined>();
  const dirty = Boolean(
    base && draft && !sameDraft(draft, { maxDepth: base.maxDepth, items: base.items }),
  );
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!menu) {
      setBase(undefined);
      setDraft(undefined);
      return;
    }
    // A save elsewhere replaces an untouched draft; edits stay until the person decides (409).
    if (!base || base.id !== menu.id || (!dirtyRef.current && base.rev !== menu.rev)) {
      setBase(menu);
      setDraft({ maxDepth: menu.maxDepth, items: menu.items });
    }
  }, [menu?.id, menu?.rev]);
  const changedElsewhere = Boolean(dirty && menu && base && menu.rev !== base.rev);

  const [conflict, setConflict] = useState<Menu | undefined>();
  const [problem, setProblem] = useState<DraftProblem | undefined>();
  const [focusItem, setFocusItem] = useState<string | undefined>(search.item);
  const [itemDialog, setItemDialog] = useState<
    { item?: MenuItem; parent?: string | null } | undefined
  >();
  const [toRemove, setToRemove] = useState<MenuItem | undefined>();
  const [saveOpen, setSaveOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [fromPagesOpen, setFromPagesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | undefined>();
  const [device, setDevice] = useState<Device>("desktop");
  const [path, setPath] = useState("");
  const [previewLocale, setPreviewLocale] = useState<string | undefined>();

  useEffect(() => {
    setProblem(undefined);
    setConflict(undefined);
  }, [activeKey]);

  const update = (next: MenuDraft) => {
    setDraft(next);
    setProblem(undefined);
  };

  // ---- the preview (resolved on the server with the renderer's own rules) ----
  const settledItems = useDebounced(draft?.items, 250);
  const settledPath = useDebounced(path.trim(), 300);
  const previewKeys =
    activeKey === "primary" || activeKey === "footer"
      ? ["primary", "footer"]
      : ["primary", "footer", activeKey];
  const preview = useQuery({
    queryKey: [
      "menu-preview",
      siteId,
      activeKey,
      previewLocale ?? "",
      settledPath,
      menu ? JSON.stringify(settledItems ?? null) : "derived",
    ],
    queryFn: () =>
      api.menus.preview(siteId, {
        ...(previewLocale ? { locale: previewLocale } : {}),
        ...(settledPath.startsWith("/") ? { path: settledPath } : {}),
        menus: previewKeys.map((key) =>
          key === activeKey && menu && settledItems ? { key, items: settledItems } : { key },
        ),
      }),
    placeholderData: keepPreviousData,
    enabled: overview.isSuccess,
  });
  const previewOf = (key: string) => preview.data?.menus.find((m) => m.key === key);
  const resolved = previewOf(activeKey)?.resolved;
  const byId = resolvedById(resolved);
  const hidden = menu ? hiddenRoots(resolved) : [];

  // ---- saving ----
  const save = useMutation({
    mutationFn: () => {
      if (!base || !draft) throw new Error("nothing to save");
      return api.menus.save(siteId, base.id, saveBody(base, draft));
    },
    onSuccess: async (r: MenuWrite) => {
      setBase(r.menu);
      setDraft({ maxDepth: r.menu.maxDepth, items: r.menu.items });
      setSaveOpen(false);
      setConflict(undefined);
      toast.success(t("menus.saved", { name: name(r.menu.key) }), t("governance.oneSnapshot"));
      await invalidate();
    },
    onError: (e) => {
      if (e instanceof ApiRequestError && e.status === 409 && e.body.error === "conflict") {
        const current = (e.body.details as { current?: Menu | null } | undefined)?.current;
        setSaveOpen(false);
        setConflict(current ?? undefined);
        void qc.invalidateQueries({ queryKey: menuKeys.overview(siteId) });
      }
    },
  });
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: menuKeys.overview(siteId) }),
      qc.invalidateQueries({ queryKey: ["menu-references", siteId] }),
      qc.invalidateQueries({ queryKey: ["snapshots", siteId] }),
    ]);
  const removeMenu = useMutation({
    mutationFn: () => api.menus.remove(base as Menu),
    onSuccess: async () => {
      setDeleteOpen(false);
      toast.success(t("menus.deleted", { name: name(activeKey) }), t("governance.oneSnapshot"));
      await invalidate();
    },
  });
  const created = async (r: MenuWrite) => {
    toast.success(t("menus.created", { name: name(r.menu.key) }), t("governance.oneSnapshot"));
    await invalidate();
    void navigate({
      to: "/sites/$siteId/navigation",
      params: { siteId },
      search: { menu: r.menu.key },
      replace: true,
    });
  };
  const startEmpty = useMutation({
    mutationFn: () =>
      api.menus.create(siteId, { key: activeKey, maxDepth: defaultDepth(activeKey), items: [] }),
    onSuccess: created,
  });

  const lines = useMemo(
    () => (base && draft && data ? deltaLines(base, draft, data, resolved) : undefined),
    [base, draft, data, resolved],
  );

  const startSave = () => {
    if (!draft || !site) return;
    const p = draftProblem(draft, site);
    if (p) {
      setProblem(p);
      if ("itemId" in p) setFocusItem(p.itemId);
      return;
    }
    save.reset();
    setSaveOpen(true);
  };

  const goTab = (key: string) =>
    void navigate({
      to: "/sites/$siteId/navigation",
      params: { siteId },
      search: { menu: key },
      replace: true,
    });
  const requestTab = (key: string) => {
    if (key === activeKey) return;
    if (dirty) setPendingTab(key);
    else goTab(key);
  };

  // ---- the tree ----
  const labelOf = (item: MenuItem) =>
    data ? shownLabel(item, data) : { text: "", fallback: true };
  const treeItems = (items: MenuItem[]): MenuTreeItem[] =>
    items.map((item) => {
      const label = labelOf(item);
      const target = data ? summarizeTarget(item, data) : { kind: item.kind };
      const r = byId.get(item.id);
      return {
        id: item.id,
        label: label.text || r?.label || t("menus.row.noLabel"),
        muted: label.fallback,
        ...(label.fallback && label.text
          ? { hint: t(`menus.hint.${item.kind as "page" | "contentEntry" | "term"}`) }
          : {}),
        meta: (
          <TargetChip
            target={target}
            taxonomyName={target.taxonomy ? taxonomyName(target.taxonomy) : undefined}
          />
        ),
        ...(r?.state === "hidden" && r.reason
          ? { status: <HiddenBadge reason={r.reason} kind={item.kind} /> }
          : {}),
        ...(item.children?.length ? { children: treeItems(item.children) } : {}),
      };
    });
  const derivedTree = (items: NavItemView[]): MenuTreeItem[] =>
    items.map((i) => ({
      id: i.id,
      label: i.label,
      meta: (
        <TargetChip
          target={
            i.kind === "term"
              ? { kind: "term", title: i.label, ...(i.href ? { where: i.href } : {}) }
              : { kind: i.kind, ...(i.href ? { where: i.href } : {}) }
          }
          taxonomyName={taxonomyName("category")}
        />
      ),
      ...(i.children.length ? { children: derivedTree(i.children) } : {}),
    }));

  const announce = (e: MenuTreeEvent): string => {
    if (e.type === "blocked")
      return t(`menus.tree.blocked.${e.reason}`, { label: e.label, max: e.maxDepth });
    if (e.type === "drop-refused")
      return t(`menus.tree.refused.${e.reason}`, { label: e.label, max: e.maxDepth });
    const where = e.parentLabel
      ? t("menus.tree.under", { parent: e.parentLabel, level: e.level })
      : t("menus.tree.topLevel");
    return t(`menus.tree.${e.type}`, {
      label: e.label,
      position: e.position,
      total: e.total,
      where,
    });
  };

  const parentsFor = (items: MenuItem[], maxDepth: number): ParentOption[] => {
    const out: ParentOption[] = [];
    const walk = (list: MenuItem[], depth: number) => {
      for (const item of list) {
        if (depth < maxDepth)
          out.push({ id: item.id, label: labelOf(item).text || item.id, depth });
        if (item.children) walk(item.children, depth + 1);
      }
    };
    walk(items, 1);
    return out;
  };

  const rowActions = (ctx: MenuTreeRowContext): ReactNode => {
    if (!can || !draft) return null;
    const item = findItem(draft.items, ctx.item.id);
    if (!item) return null;
    const r = byId.get(item.id);
    const fixable = r?.state === "hidden" && r.reason && r.reason !== "parent-hidden";
    const depth = ctx.depth;
    const canNest = depth < draft.maxDepth;
    const disabledItem = (label: string, hint: string, icon: typeof Plus) => (
      <Tooltip content={hint} side="left" render={<div />}>
        <DropdownMenu.Item icon={icon} disabled>
          {label}
        </DropdownMenu.Item>
      </Tooltip>
    );
    return (
      <>
        {fixable && (
          <DropdownMenu>
            <DropdownMenu.Trigger
              render={
                <Button variant="secondary" size="xs" icon={<Wrench />} data-testid="fix-item">
                  {t("menus.row.fix")}
                </Button>
              }
            />
            <DropdownMenu.Content align="end">
              {r?.reason === "empty-group" ? (
                <DropdownMenu.Item icon={Plus} onClick={() => setItemDialog({ parent: item.id })}>
                  {t("menus.row.addInside")}
                </DropdownMenu.Item>
              ) : (
                <DropdownMenu.Item icon={PencilSimple} onClick={() => setItemDialog({ item })}>
                  {t("menus.row.retarget")}
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Item icon={Trash} variant="danger" onClick={() => askRemove(item)}>
                {t("menus.row.remove")}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
        )}
        <Tooltip
          content={t("menus.row.edit")}
          render={
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              icon={<PencilSimple />}
              aria-label={t("menus.row.editLabel", { label: ctx.item.label })}
              onClick={() => setItemDialog({ item })}
            />
          }
        />
        <DropdownMenu>
          <Tooltip
            content={t("menus.row.menu")}
            render={
              <DropdownMenu.Trigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    shape="square"
                    icon={<DotsThree weight="bold" />}
                    aria-label={t("menus.row.menuLabel", { label: ctx.item.label })}
                  />
                }
              />
            }
          />
          <DropdownMenu.Content align="end">
            {canNest ? (
              <DropdownMenu.Item icon={Plus} onClick={() => setItemDialog({ parent: item.id })}>
                {t("menus.row.addInside")}
              </DropdownMenu.Item>
            ) : (
              disabledItem(
                t("menus.row.addInside"),
                t("menus.row.addInsideLimit", { max: draft.maxDepth }),
                Plus,
              )
            )}
            <DropdownMenu.Separator />
            <DropdownMenu.Item icon={ArrowUp} disabled={!ctx.canMoveUp} onClick={ctx.moveUp}>
              {t("menus.row.moveUp")}
            </DropdownMenu.Item>
            <DropdownMenu.Item icon={ArrowDown} disabled={!ctx.canMoveDown} onClick={ctx.moveDown}>
              {t("menus.row.moveDown")}
            </DropdownMenu.Item>
            {ctx.canIndent ? (
              <DropdownMenu.Item icon={TextIndent} onClick={ctx.indent}>
                {t("menus.row.indent")}
              </DropdownMenu.Item>
            ) : (
              disabledItem(
                t("menus.row.indent"),
                ctx.indentBlocked === "depth"
                  ? t("menus.row.indentLimit", { max: draft.maxDepth })
                  : ctx.indentBlocked === "size"
                    ? t("menus.row.indentFull", { max: limits.perLevel })
                    : t("menus.row.indentNoPrevious"),
                TextIndent,
              )
            )}
            <DropdownMenu.Item icon={TextOutdent} disabled={!ctx.canOutdent} onClick={ctx.outdent}>
              {t("menus.row.outdent")}
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item icon={Trash} variant="danger" onClick={() => askRemove(item)}>
              {t("menus.row.remove")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </>
    );
  };

  const askRemove = (item: MenuItem) => {
    if (item.children?.length) setToRemove(item);
    else if (draft) update(removeItem(draft, item.id));
  };

  // ---- page anatomy ----
  const usage = draft ? menuUsage(draft.items) : undefined;
  const loading = overview.isPending || !data;
  const place = name(activeKey);
  const editing = Boolean(menu && draft && base);
  const problemText = (p: DraftProblem): string => {
    const item = "itemId" in p && draft ? findItem(draft.items, p.itemId) : undefined;
    const label = item ? labelOf(item).text : "";
    return t(`menus.problems.${p.code}`, { label, max: "max" in p ? p.max : 0 });
  };

  const header = (
    <>
      {editing && <PreviewToggle visible={previewVisible} onChange={setPreviewVisible} />}
      {can && (
        <Button
          variant="secondary"
          icon={<Plus />}
          onClick={() => setCreateOpen(true)}
          data-testid="new-menu"
        >
          {t("menus.newMenu")}
        </Button>
      )}
      {editing && can && dirty && (
        <Button
          variant="ghost"
          onClick={() => base && update({ maxDepth: base.maxDepth, items: base.items })}
        >
          {t("common.discard")}
        </Button>
      )}
      {editing && can && (
        <Button
          variant="primary"
          disabled={!dirty}
          loading={save.isPending}
          onClick={startSave}
          data-testid="save-menu"
        >
          {t("menus.save.button")}
        </Button>
      )}
    </>
  );

  const previewCard = (
    <SectionCard
      title={t("menus.preview.title")}
      icon={<Eye size={16} />}
      actions={
        <>
          {dirty && (
            <Badge variant="warning" appearance="dot">
              {t("common.unsaved")}
            </Badge>
          )}
          <Tabs
            variant="segmented"
            size="sm"
            value={device}
            onValueChange={(v) => setDevice(v as Device)}
            tabs={[
              {
                value: "desktop",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Monitor size={14} />
                    <span className="max-sm:sr-only">{t("preview.desktop")}</span>
                  </span>
                ),
              },
              {
                value: "mobile",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <DeviceMobile size={14} />
                    <span className="max-sm:sr-only">{t("preview.mobile")}</span>
                  </span>
                ),
              },
            ]}
          />
        </>
      }
      description={t("menus.preview.description")}
    >
      <div className="grid gap-4" data-testid="menu-preview">
        <div className="@container">
          <div className="grid items-start gap-x-4 gap-y-3 @lg:grid-cols-2">
            <Input
              label={t("menus.preview.path")}
              description={t("menus.preview.pathHint")}
              value={path}
              placeholder="/about"
              spellCheck={false}
              className="w-full font-mono"
              onValueChange={setPath}
              data-testid="preview-path"
            />
            {site && site.locales.length > 1 && (
              <Select
                label={t("menus.preview.locale")}
                value={previewLocale ?? site.defaultLocale}
                onValueChange={(v) => setPreviewLocale(String(v))}
                items={Object.fromEntries(
                  [site.defaultLocale, ...site.locales.filter((l) => l !== site.defaultLocale)].map(
                    (l) => [l, l],
                  ),
                )}
              />
            )}
          </div>
        </div>
        {!isPlaced(activeKey) && (
          <Banner
            variant="secondary"
            size="sm"
            icon={<Info weight="fill" />}
            title={t("menus.preview.customTitle")}
            description={t("menus.preview.customDescription", { key: activeKey })}
          />
        )}
        {preview.error ? (
          <ErrorBanner error={preview.error} onRetry={() => preview.refetch()} />
        ) : !preview.data || !site ? (
          <div className="grid gap-3" role="status" aria-label={t("common.loading")}>
            <SkeletonLine />
            <SkeletonLine />
            <SkeletonLine />
          </div>
        ) : (
          <NavigationPreview
            siteName={site.name}
            device={device}
            header={previewItems(
              isPlaced(activeKey)
                ? previewOf("primary")?.navigation
                : previewOf(activeKey)?.navigation,
            )}
            footer={
              previewOf("footer")?.derived
                ? undefined
                : previewItems(previewOf("footer")?.navigation)
            }
            focus={activeKey === "footer" ? "footer" : "header"}
            labels={{
              header: t("menus.preview.header"),
              footer: t("menus.preview.footer"),
              defaultFooter: t("menus.preview.defaultFooter"),
              credit: t("menus.preview.credit"),
              empty: t("menus.preview.empty"),
              menu: t("menus.preview.menu"),
              newTab: t("menus.chips.newTab"),
              toggle: (label) => t("menus.tree.expand", { label }),
            }}
          />
        )}
        {previewOf(activeKey)?.active && (
          <Text variant="secondary" size="sm">
            {t(`menus.preview.match.${previewOf(activeKey)?.active?.match ?? "exact"}`)}
          </Text>
        )}
      </div>
    </SectionCard>
  );

  const readOnlyBanner = !can && (
    <Banner
      variant="secondary"
      icon={<Lock weight="fill" />}
      title={t("menus.readOnly.title")}
      description={t("menus.readOnly.description")}
      data-testid="menus-read-only"
    />
  );

  const editor = editing && draft && base && usage && (
    <EditorLayout
      previewVisible={previewVisible}
      preview={previewCard}
      main={
        <>
          {readOnlyBanner}
          {(conflict || changedElsewhere) && (
            <Banner
              variant="alert"
              icon={<WarningCircle weight="fill" />}
              title={t("menus.conflict.title")}
              description={t("menus.conflict.description", { name: place })}
              data-testid="menu-conflict"
              action={
                <>
                  <Banner.Action
                    variant="secondary"
                    onClick={() => {
                      const latest = conflict ?? menu;
                      if (!latest) return;
                      setBase(latest);
                      setConflict(undefined);
                    }}
                  >
                    {t("menus.conflict.keep")}
                  </Banner.Action>
                  <Banner.Action
                    variant="secondary"
                    icon={<ArrowsClockwise />}
                    onClick={() => {
                      const latest = conflict ?? menu;
                      if (!latest) return;
                      setBase(latest);
                      setDraft({ maxDepth: latest.maxDepth, items: latest.items });
                      setConflict(undefined);
                    }}
                  >
                    {t("menus.conflict.reload")}
                  </Banner.Action>
                </>
              }
            />
          )}
          {problem && (
            <Banner
              variant="error"
              icon={<WarningCircle weight="fill" />}
              title={t("menus.problems.title")}
              description={problemText(problem)}
              data-testid="menu-problem"
            />
          )}
          {hidden.length > 0 && (
            <Banner
              variant="alert"
              icon={<EyeSlash weight="fill" />}
              title={
                hidden.length === 1
                  ? t("menus.hidden.bannerOne")
                  : t("menus.hidden.banner", { count: hidden.length })
              }
              description={t("menus.hidden.bannerDescription")}
              data-testid="hidden-banner"
            />
          )}
          <SectionCard
            title={t("menus.items.title", { place })}
            icon={<TreeStructure size={16} />}
            actions={
              <>
                <Tooltip
                  content={t("menus.items.countHint", { limit: limits.total })}
                  render={
                    <span className="inline-flex" data-testid="menu-count">
                      <Badge
                        variant={nearLimit(usage.total, limits.total) ? "warning" : "secondary"}
                      >
                        {t("menus.items.count", { count: usage.total, limit: limits.total })}
                      </Badge>
                    </span>
                  }
                />
                {can && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Plus />}
                    onClick={() => setItemDialog({ parent: null })}
                    disabled={usage.total >= limits.total}
                    data-testid="add-menu-item"
                  >
                    {t("menus.items.add")}
                  </Button>
                )}
              </>
            }
            description={
              can
                ? t("menus.items.description", { max: draft.maxDepth })
                : t("menus.items.descriptionReadOnly")
            }
            flush
          >
            {draft.items.length === 0 ? (
              <SectionEmpty
                icon={<TreeStructure size={32} className="text-kumo-inactive" />}
                title={t("menus.items.empty")}
                description={t(
                  `menus.items.emptyDescription.${isPlaced(activeKey) ? (activeKey as "primary" | "footer") : "custom"}`,
                )}
                contents={
                  can ? (
                    <Button
                      variant="secondary"
                      icon={<Plus />}
                      onClick={() => setItemDialog({ parent: null })}
                    >
                      {t("menus.items.add")}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <MenuTree
                items={treeItems(draft.items)}
                maxDepth={draft.maxDepth}
                perLevel={limits.perLevel}
                readOnly={!can}
                focusId={focusItem}
                onMove={(m) => update(moveItem(draft, m))}
                onEdit={(id) => {
                  const item = findItem(draft.items, id);
                  if (item && can) setItemDialog({ item });
                }}
                onRemove={(id) => {
                  const item = findItem(draft.items, id);
                  if (item) askRemove(item);
                }}
                actions={rowActions}
                labels={{
                  tree: t("menus.tree.label", { place }),
                  instructions: t("menus.tree.instructions"),
                  expand: (label) => t("menus.tree.expand", { label }),
                  collapse: (label) => t("menus.tree.collapse", { label }),
                }}
                announce={announce}
              />
            )}
          </SectionCard>
        </>
      }
      aside={
        <>
          <SectionCard title={t("menus.settings.title")} icon={<GearSix size={16} />}>
            <div className="grid gap-4">
              <Select
                label={t("menus.settings.depth")}
                description={
                  usage.depth > draft.maxDepth
                    ? undefined
                    : t(
                        `menus.settings.depthHint.${isPlaced(activeKey) ? (activeKey as "primary" | "footer") : "custom"}`,
                      )
                }
                error={
                  usage.depth > draft.maxDepth
                    ? t("menus.settings.depthTooLow", { depth: usage.depth })
                    : undefined
                }
                value={String(draft.maxDepth)}
                disabled={!can}
                onValueChange={(v) => update({ ...draft, maxDepth: Number(v) })}
                items={Object.fromEntries(
                  Array.from({ length: limits.maxDepth }, (_, i) => [
                    String(i + 1),
                    t(i === 0 ? "menus.depthOne" : "menus.depthMany", { count: i + 1 }),
                  ]),
                )}
              />
              <dl className="-mb-3 divide-y divide-kumo-hairline border-t border-kumo-hairline">
                <SettingRow label={t("menus.settings.items")} hint={t("menus.settings.itemsHint")}>
                  <Badge variant={nearLimit(usage.total, limits.total) ? "warning" : "secondary"}>
                    {t("menus.items.count", { count: usage.total, limit: limits.total })}
                  </Badge>
                </SettingRow>
                <SettingRow
                  label={t("menus.settings.levels")}
                  hint={t("menus.settings.levelsHint")}
                >
                  <Badge variant={usage.depth >= draft.maxDepth ? "warning" : "secondary"}>
                    {t("menus.settings.levelsValue", { depth: usage.depth, max: draft.maxDepth })}
                  </Badge>
                </SettingRow>
                <SettingRow
                  label={t("menus.settings.fullest")}
                  hint={t("menus.settings.fullestHint", { limit: limits.perLevel })}
                >
                  <span data-testid="menu-fullest" className="inline-flex">
                    <Badge
                      variant={
                        nearLimit(usage.fullest.count, limits.perLevel) ? "warning" : "secondary"
                      }
                    >
                      {t("menus.items.count", {
                        count: usage.fullest.count,
                        limit: limits.perLevel,
                      })}
                    </Badge>
                  </span>
                </SettingRow>
              </dl>
            </div>
          </SectionCard>
          <DetailsCard
            rows={[
              { label: t("menus.details.key"), value: <InlineCopyText>{base.key}</InlineCopyText> },
              { label: t("editor.id"), value: <InlineCopyText>{base.id}</InlineCopyText> },
              { label: t("editor.revision"), value: <Text as="span">{base.rev}</Text> },
              {
                label: t("editor.updatedAt"),
                value: <RelativeTime iso={base.updatedAt} size="base" />,
              },
            ]}
          />
          {can && (
            <DangerZoneCard
              title={t("menus.delete.title", { name: place })}
              description={t(
                `menus.delete.hint.${isPlaced(activeKey) ? (activeKey as "primary" | "footer") : "custom"}`,
              )}
              actionLabel={t("menus.delete.action")}
              onAction={() => {
                removeMenu.reset();
                setDeleteOpen(true);
              }}
            />
          )}
        </>
      }
    />
  );

  const emptyState = !menu && derived && (
    <EditorLayout
      previewVisible={previewVisible}
      preview={previewCard}
      main={
        <>
          {readOnlyBanner}
          <ErrorBanner error={startEmpty.error} />
          <SectionCard
            title={t(`menus.derived.title.${activeKey === "footer" ? "footer" : "primary"}`)}
            icon={<TreeStructure size={16} />}
            description={t(
              `menus.derived.description.${activeKey === "footer" ? "footer" : "primary"}`,
            )}
            flush
            footer={
              can ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="secondary"
                    loading={startEmpty.isPending}
                    onClick={() => startEmpty.mutate()}
                    data-testid="start-empty"
                  >
                    {t("menus.derived.startEmpty")}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => setFromPagesOpen(true)}
                    data-testid="from-pages"
                  >
                    {t("menus.derived.fromPages")}
                  </Button>
                </div>
              ) : undefined
            }
          >
            {derived.items.length === 0 ? (
              <SectionEmpty
                icon={<TreeStructure size={32} className="text-kumo-inactive" />}
                title={t(`menus.derived.empty.${activeKey === "footer" ? "footer" : "primary"}`)}
              />
            ) : (
              <MenuTree
                items={derivedTree(derived.items)}
                maxDepth={1}
                readOnly
                onMove={() => {}}
                labels={{
                  tree: t("menus.derived.treeLabel", { place }),
                  instructions: t("menus.derived.treeHint"),
                  expand: (label) => t("menus.tree.expand", { label }),
                  collapse: (label) => t("menus.tree.collapse", { label }),
                }}
                announce={() => ""}
              />
            )}
          </SectionCard>
        </>
      }
      aside={
        <SectionCard title={t("menus.how.title")} icon={<Info size={16} />}>
          <dl className="-my-3 divide-y divide-kumo-hairline">
            <SettingRow label={t("menus.how.ids")} hint={t("menus.how.idsHint")}>
              {null}
            </SettingRow>
            <SettingRow label={t("menus.how.hidden")} hint={t("menus.how.hiddenHint")}>
              {null}
            </SettingRow>
            <SettingRow label={t("menus.how.agents")} hint={t("menus.how.agentsHint")}>
              {null}
            </SettingRow>
            <SettingRow label={t("menus.how.snapshot")} hint={t("governance.oneSnapshot")}>
              {null}
            </SettingRow>
          </dl>
        </SectionCard>
      }
    />
  );

  const deltaTitle = title(activeKey);
  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[{ label: t("pageHeaders.navigation.title") }]} />}
      icon={<TreeStructure size={24} />}
      title={t("pageHeaders.navigation.title")}
      description={t("pageHeaders.navigation.description")}
      actions={loading ? undefined : header}
      {...(keys.length > 0
        ? {
            tabs: keys.map((k) => ({ value: k, label: name(k) })),
            tab: activeKey,
            onTabChange: requestTab,
          }
        : {})}
    >
      <ErrorBanner error={overview.error} onRetry={() => overview.refetch()} />
      {loading ? (
        <SectionCard title={t("menus.items.titleLoading")} icon={<TreeStructure size={16} />}>
          <div className="grid gap-3" role="status" aria-label={t("common.loading")}>
            <SkeletonLine />
            <SkeletonLine />
            <SkeletonLine />
          </div>
        </SectionCard>
      ) : (
        editor || emptyState
      )}
      <MenuItemDialog
        open={itemDialog !== undefined}
        onOpenChange={(open) => {
          if (!open) setItemDialog(undefined);
        }}
        item={itemDialog?.item}
        site={site ?? NO_SITE}
        data={data ?? NO_DATA}
        taxonomyName={taxonomyGroup}
        parents={draft ? parentsFor(draft.items, draft.maxDepth) : []}
        defaultParent={itemDialog?.parent ?? null}
        onApply={(item, parentId) => {
          if (!draft) return;
          if (itemDialog?.item) update(replaceItem(draft, item.id, item));
          else {
            const depth = parentId ? itemDepth(draft.items, parentId) + 1 : 1;
            if (depth <= draft.maxDepth) update(insertItem(draft, item, parentId));
          }
          setFocusItem(item.id);
        }}
      />
      <MenuSaveDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title={deltaTitle}
        delta={lines?.delta}
        lines={lines?.lines ?? []}
        busy={save.isPending}
        error={
          save.error && !(save.error instanceof ApiRequestError && save.error.status === 409)
            ? save.error
            : undefined
        }
        onConfirm={() => save.mutate()}
        taxonomyName={taxonomyName}
      />
      <ConfirmDialog
        open={toRemove !== undefined}
        onOpenChange={(open) => {
          if (!open) setToRemove(undefined);
        }}
        title={t("menus.removeTree.title", { label: toRemove ? labelOf(toRemove).text : "" })}
        description={t("menus.removeTree.description", {
          count: toRemove ? menuUsage(toRemove.children ?? []).total : 0,
        })}
        confirmLabel={t("menus.row.remove")}
        onConfirm={() => {
          if (toRemove && draft) update(removeItem(draft, toRemove.id));
          setToRemove(undefined);
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("menus.delete.confirmTitle", { name: place })}
        description={t(
          `menus.delete.hint.${isPlaced(activeKey) ? (activeKey as "primary" | "footer") : "custom"}`,
        )}
        detail={t("menus.delete.detail")}
        confirmLabel={t("menus.delete.action")}
        busy={removeMenu.isPending}
        error={removeMenu.error ? (removeMenu.error as Error).message : undefined}
        onConfirm={() => removeMenu.mutate()}
      />
      <ConfirmDialog
        open={pendingTab !== undefined}
        onOpenChange={(open) => {
          if (!open) setPendingTab(undefined);
        }}
        title={t("menus.leave.title", { name: place })}
        description={t("menus.leave.description")}
        confirmLabel={t("menus.leave.confirm")}
        onConfirm={() => {
          const next = pendingTab;
          setPendingTab(undefined);
          if (base) setDraft({ maxDepth: base.maxDepth, items: base.items });
          if (next) goTab(next);
        }}
      />
      <CreateMenuDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        siteId={siteId}
        taken={(o?.menus ?? []).map((m) => m.menu.key)}
        missing={(o?.derived ?? [])
          .map((d) => d.key)
          .filter((k) => k === "primary" || k === "footer")}
        defaultDepth={defaultDepth}
        onCreated={created}
      />
      <FromPagesDialog
        open={fromPagesOpen}
        onOpenChange={setFromPagesOpen}
        siteId={siteId}
        menuKey={activeKey}
        onCreated={created}
      />
    </PageLayout>
  );
}

/** Keys the blog theme places: the header and the footer. */
function isPlaced(key: string): key is "primary" | "footer" {
  return key === "primary" || key === "footer";
}
