import {
  Badge,
  Checkbox,
  Input,
  InsetPanel,
  LayerDialog,
  Radio,
  Select,
  SkeletonLine,
  Text,
} from "@cloudhal/ui";
import { Camera } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { MENU_LIMITS, type MenuWrite, validateMenuKey } from "../lib/menus.ts";
import { ErrorBanner } from "./ErrorBanner.tsx";
import { HiddenBadge, useMenuName } from "./Menus.tsx";

function OneSnapshot() {
  const t = useT();
  return (
    <div className="flex items-start gap-2" data-testid="one-snapshot">
      <span className="flex h-lh items-center text-kumo-subtle">
        <Camera size={16} />
      </span>
      <Text variant="secondary" size="sm" as="span">
        {t("governance.oneSnapshot")}
      </Text>
    </div>
  );
}

const CUSTOM = "__custom__";

/**
 * "New menu" (RFC-0003 §8): a well-known place the site has no menu for yet, or a custom key
 * (a slug, unique per site, immutable once created), and how deep it may go. The menu starts empty.
 */
export function CreateMenuDialog({
  open,
  onOpenChange,
  siteId,
  taken,
  missing,
  defaultDepth,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  /** Keys the site already has a menu for. */
  taken: string[];
  /** Well-known keys without a menu (offered as cards). */
  missing: string[];
  defaultDepth: (key: string) => number;
  onCreated: (result: MenuWrite) => void;
}) {
  const t = useT();
  const name = useMenuName();
  const [place, setPlace] = useState<string>(CUSTOM);
  const [key, setKey] = useState("");
  const [depth, setDepth] = useState(3);
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (!open) return;
    const first = missing[0] ?? CUSTOM;
    setPlace(first);
    setKey("");
    setDepth(defaultDepth(first === CUSTOM ? "" : first));
    setAttempted(false);
  }, [open]);
  const finalKey = place === CUSTOM ? key.trim() : place;
  const keyError = place === CUSTOM ? validateMenuKey(finalKey, taken) : undefined;
  const create = useMutation({
    mutationFn: () => api.menus.create(siteId, { key: finalKey, maxDepth: depth, items: [] }),
    onSuccess: (r) => {
      onCreated(r);
      onOpenChange(false);
    },
  });
  useEffect(() => {
    if (open) create.reset();
  }, [open]);
  const submit = () => {
    setAttempted(true);
    if (keyError) return;
    create.mutate();
  };
  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={create.isPending}>
      <LayerDialog.Content closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("menus.create.title")}</LayerDialog.Title>
        <LayerDialog.Description>{t("menus.create.description")}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-testid="create-menu-dialog">
            {missing.length > 0 && (
              <Radio.Group
                appearance="card"
                legend={t("menus.create.place")}
                value={place}
                onValueChange={(v) => {
                  setPlace(String(v));
                  setDepth(defaultDepth(String(v) === CUSTOM ? key : String(v)));
                }}
              >
                {missing.map((k) => (
                  <Radio.Item
                    key={k}
                    value={k}
                    label={t("menus.placeWithKey", { place: name(k), key: k })}
                    description={t(`menus.create.placeHint.${k as "primary" | "footer"}`)}
                  />
                ))}
                <Radio.Item
                  value={CUSTOM}
                  label={t("menus.create.custom")}
                  description={t("menus.create.customHint")}
                />
              </Radio.Group>
            )}
            {place === CUSTOM && (
              <Input
                label={t("menus.create.key")}
                description={t("menus.create.keyHint")}
                value={key}
                placeholder="social-links"
                spellCheck={false}
                autoFocus
                className="w-full font-mono"
                onValueChange={(v) => setKey(v.toLowerCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                error={attempted && keyError ? t(`menus.create.errors.${keyError}`) : undefined}
                data-testid="menu-key"
              />
            )}
            <Select
              label={t("menus.create.depth")}
              description={t("menus.create.depthHint")}
              value={String(depth)}
              onValueChange={(v) => setDepth(Number(v))}
              items={Object.fromEntries(
                Array.from({ length: MENU_LIMITS.maxDepth }, (_, i) => [
                  String(i + 1),
                  t(i === 0 ? "menus.depthOne" : "menus.depthMany", { count: i + 1 }),
                ]),
              )}
            />
            <ErrorBanner error={create.error} />
            <OneSnapshot />
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            loading={create.isPending}
            onClick={submit}
            data-testid="create-menu-submit"
          >
            {t("menus.create.confirm")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

/**
 * "Create menu from current pages" (RFC-0003 §8, compatibility): a dry run lists the items first —
 * the pages today's derived header shows, without labels so renames keep flowing in — with an
 * option to add the top-level categories. Nothing is written until the person confirms.
 */
export function FromPagesDialog({
  open,
  onOpenChange,
  siteId,
  menuKey,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  menuKey: string;
  onCreated: (result: MenuWrite) => void;
}) {
  const t = useT();
  const name = useMenuName();
  const [categories, setCategories] = useState(false);
  useEffect(() => {
    if (open) setCategories(false);
  }, [open]);
  const preview = useQuery({
    queryKey: ["menu-from-pages", siteId, menuKey, categories],
    queryFn: () => api.menus.fromPagesPreview(siteId, { key: menuKey, categories }),
    enabled: open,
    staleTime: 0,
  });
  const create = useMutation({
    mutationFn: () => api.menus.fromPages(siteId, { key: menuKey, categories }),
    onSuccess: (r) => {
      onCreated(r);
      onOpenChange(false);
    },
  });
  useEffect(() => {
    if (open) create.reset();
  }, [open]);
  const p = preview.data;
  const items = p?.resolved.items ?? [];
  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={create.isPending}>
      <LayerDialog.Content size="lg" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("menus.fromPages.title", { name: name(menuKey) })}</LayerDialog.Title>
        <LayerDialog.Description>{t("menus.fromPages.description")}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-4" data-testid="from-pages-dialog">
            {preview.error ? (
              <ErrorBanner error={preview.error} onRetry={() => preview.refetch()} />
            ) : !p ? (
              <InsetPanel className="gap-3" label={t("common.loading")}>
                <SkeletonLine />
                <SkeletonLine />
              </InsetPanel>
            ) : (
              <InsetPanel label={t("menus.fromPages.items")}>
                {items.length === 0 ? (
                  <Text variant="secondary" size="sm">
                    {t("menus.fromPages.none")}
                  </Text>
                ) : (
                  <div
                    className="grid divide-y divide-kumo-hairline"
                    data-testid="from-pages-items"
                  >
                    {items.map((i) => (
                      <div
                        key={i.id}
                        className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0"
                        data-kind={i.kind}
                      >
                        <span className="grid min-w-0 gap-0.5">
                          <Text as="span" truncate>
                            {i.label}
                          </Text>
                          {i.href && (
                            <Text variant="mono-secondary" as="span" truncate>
                              {i.href}
                            </Text>
                          )}
                        </span>
                        {i.state === "hidden" && i.reason ? (
                          <HiddenBadge reason={i.reason} kind={i.kind} />
                        ) : (
                          <Badge variant="outline">
                            {i.kind === "term"
                              ? t("menus.fromPages.category")
                              : t("menus.fromPages.page")}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </InsetPanel>
            )}
            <Checkbox
              label={t("menus.fromPages.categories", { count: p?.categories ?? 0 })}
              checked={categories}
              disabled={!p || p.categories === 0}
              onCheckedChange={(on) => setCategories(on === true)}
            />
            <Text variant="secondary" size="sm">
              {t("menus.fromPages.labelsHint")}
            </Text>
            <ErrorBanner error={create.error} />
            <OneSnapshot />
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            loading={create.isPending}
            disabled={!p || preview.isFetching}
            onClick={() => create.mutate()}
            data-testid="from-pages-confirm"
          >
            {t("menus.fromPages.confirm")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
