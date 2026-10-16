import type { Asset } from "@cloudhal/core-contracts";
import {
  Badge,
  Banner,
  Button,
  DeleteResource,
  InlineCopyText,
  Input,
  InputArea,
  InputGroup,
  Link,
  LinkButton,
  PageLayout,
  SectionCard,
  SectionEmpty,
  Select,
  SkeletonLine,
  Switch,
  Table,
  Tabs,
  Text,
} from "@cloudhal/ui";
import {
  Archive,
  ArrowCounterClockwise,
  ArrowSquareOut,
  DownloadSimple,
  FileText,
  Fingerprint,
  Images,
  LinkSimple,
  ProhibitInset,
  TextAa,
  Trash,
  UserCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ActorCell } from "../components/Audit.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { DangerZoneCard, DetailsCard, EditorLayout } from "../components/EditorLayout.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ReadOnly, ViewOnlyBanner } from "../components/Gating.tsx";
import { AssetBadges, AssetFrame, UsageBadge } from "../components/Media.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { CharacterCount } from "../components/Seo.tsx";
import { SettingRow } from "../components/Settings.tsx";
import { TakedownDialog } from "../components/TakedownDialog.tsx";
import { useToast } from "../components/Toast.ts";
import { useCan, useGate } from "../components/useMe.ts";
import { type KeyIn, useI18n, useT } from "../i18n/index.tsx";
import { type AssetDetail, type AssetUse, api } from "../lib/api.ts";
import {
  ASSET_LIMITS,
  type AssetForm,
  type AssetFormErrors,
  assetForm,
  assetPatch,
  assetTitle,
  COMMON_LICENSES,
  formatSize,
  type LicenseChoice,
  slugify,
  typeLabel,
  validateAssetForm,
} from "../lib/media.ts";
import { isDirty } from "../lib/util.ts";

const ALT_ERROR: Record<NonNullable<AssetFormErrors["alt"]>, KeyIn<"media">> = {
  required: "media.detail.errors.altRequired",
  tooLong: "media.detail.errors.altTooLong",
};

type LicenseOption = "none" | (typeof COMMON_LICENSES)[number] | "spdx" | "url";

function licenseOption(l: LicenseChoice): LicenseOption {
  if (l.kind === "none") return "none";
  if (l.kind === "url") return "url";
  return (COMMON_LICENSES as readonly string[]).includes(l.id) ? (l.id as LicenseOption) : "spdx";
}

/** "Cover image", "Image section", "Text" — the slot an asset fills, from `asset_refs.field`. */
function slotKey(field: string): KeyIn<"media"> {
  if (field === "coverImage") return "media.uses.slots.cover";
  // RFC-0025: the site's logo.
  if (field.startsWith("brand.")) return "media.uses.slots.logo";
  if (field === "image") return "media.uses.slots.termImage";
  if (field === "seo.ogImage" || /\.seo\.ogImage$/.test(field)) return "media.uses.slots.social";
  if (/^sections\..+\.image$/.test(field)) return "media.uses.slots.section";
  return "media.uses.slots.text";
}

function useHref(siteId: string) {
  return (use: AssetUse): string | undefined =>
    use.nodeKind === "contentEntry"
      ? `/sites/${siteId}/articles/${use.nodeId}`
      : use.nodeKind === "page"
        ? `/sites/${siteId}/pages/${use.nodeId}`
        : use.nodeKind === "term"
          ? `/sites/${siteId}/taxonomy/${use.nodeId}`
          : use.nodeKind === "site"
            ? `/sites/${siteId}/settings#chrome`
            : undefined;
}

/**
 * Site › Media › a file (DESIGN.md §2u, RFC-0004 §8; editor template): the preview, the details
 * per locale — alt text required for images unless decorative —, where it is used, the file's
 * facts (type, size, SHA-256) and its source; retire, delete and take down in the danger zone.
 * Edits are the uploader's (asset:upload) or any Editor's (asset:manage); the server decides.
 */
export function AssetPage() {
  const t = useT("media");
  const { locale: uiLocale } = useI18n("media");
  const { siteId, assetId } = useParams({ from: "/sites/$siteId/media/$assetId" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const detail = useQuery({
    queryKey: ["asset", siteId, assetId],
    queryFn: () => api.assets.get(siteId, assetId),
  });
  const manage = useGate("assets.manage");
  const upload = useGate("assets.upload");
  const isOwner = useCan("ownership.transfer");
  const takedownGate = {
    allowed: isOwner,
    reason: isOwner ? undefined : t("media.takedown.ownerOnly"),
  };
  const defaultLocale = site.data?.defaultLocale ?? "en";
  const locales = site.data?.locales ?? [defaultLocale];
  const [locale, setLocale] = useState<string | undefined>();
  const activeLocale = locale ?? defaultLocale;
  const [draft, setDraft] = useState<AssetForm | undefined>();
  const [showErrors, setShowErrors] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [takedownOpen, setTakedownOpen] = useState(false);
  const asset = detail.data?.asset;
  useEffect(() => {
    if (asset) setDraft(assetForm(asset));
  }, [asset?.id, asset?.rev]);

  const refresh = (next: Asset) => {
    qc.setQueryData(["asset", siteId, assetId], (old: AssetDetail | undefined) =>
      old ? { ...old, asset: next } : old,
    );
    return qc.invalidateQueries({ queryKey: ["assets", siteId] });
  };
  const save = useMutation({
    mutationFn: (form: AssetForm) =>
      api.assets.update(asset as Asset, assetPatch(form, (asset as Asset).kind)),
    onSuccess: async (next) => {
      setShowErrors(false);
      await refresh(next);
      await qc.invalidateQueries({ queryKey: ["asset", siteId, assetId] });
      toast.success(t("media.detail.saved"));
    },
  });
  const status = useMutation({
    mutationFn: (to: "retire" | "restore") =>
      to === "retire" ? api.assets.retire(asset as Asset) : api.assets.restore(asset as Asset),
    onSuccess: async (next, to) => {
      await refresh(next);
      toast.success(
        to === "retire" ? t("media.detail.retired") : t("media.detail.restored"),
        to === "retire" ? t("media.detail.retiredHint") : undefined,
      );
    },
  });
  const remove = useMutation({
    mutationFn: () => api.assets.remove(asset as Asset),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["assets", siteId] });
      toast.success(t("media.detail.deleted", { name }));
      await navigate({ to: "/sites/$siteId/media", params: { siteId } });
    },
  });
  const takedown = useMutation({
    mutationFn: (input: { reason: string; legal: boolean }) =>
      api.assets.purge(asset as Asset, input),
    onSuccess: async (r) => {
      setTakedownOpen(false);
      await qc.invalidateQueries({ queryKey: ["asset", siteId, assetId] });
      await qc.invalidateQueries({ queryKey: ["assets", siteId] });
      toast.success(
        t("media.takedown.done"),
        t(r.status === 451 ? "media.takedown.done451" : "media.takedown.done410"),
      );
    },
  });
  const lift = useMutation({
    mutationFn: () => api.assets.liftPurge(siteId, (asset as Asset).sha256),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["asset", siteId, assetId] });
      toast.success(t("media.purged.lifted"), t("media.purged.liftedHint"));
    },
  });

  const name = asset ? assetTitle(asset, uiLocale, defaultLocale) : "";
  const listCrumb = { label: t("pageHeaders.media.title"), href: `/sites/${siteId}/media` };
  const hrefOf = useHref(siteId);

  if (detail.isError || !asset || !draft)
    return (
      <PageLayout
        crumbs={<SiteCrumbs siteId={siteId} trail={[listCrumb, { label: undefined }]} />}
        title={t("pageHeaders.media.title")}
      >
        <ErrorBanner error={detail.error} onRetry={() => void detail.refetch()} />
        {!detail.isError && (
          <div className="grid gap-3" role="status" aria-label={t("common.loading")}>
            <SkeletonLine />
            <SkeletonLine />
            <SkeletonLine />
          </div>
        )}
      </PageLayout>
    );

  const data = detail.data as AssetDetail;
  const isImage = asset.kind === "image";
  const purged = data.blob?.state === "purged";
  const retired = asset.status === "retired";
  const errors = validateAssetForm(draft, asset.kind, defaultLocale);
  const dirty = isDirty(draft, assetForm(asset));
  const readOnlyReason = data.editable ? undefined : (upload.reason ?? t("media.detail.notOwn"));
  const show = (e: unknown) => showErrors && e !== undefined;
  const usedCount = new Set(data.uses.map((u) => u.nodeId)).size;
  const contentUrl = api.assets.contentUrl(siteId, asset.id);
  const ext = asset.slug ? data.url.split(".").pop() : "";
  const prefix = asset.sha256.slice(0, 16);

  /** Every save path checks the alt rule and the limits first (§2u): nothing invalid is sent. */
  const valid = () => {
    if (Object.keys(errors).length === 0) return true;
    setShowErrors(true);
    toast.error(t("seo.fixErrors"));
    document.getElementById("details")?.scrollIntoView?.({ block: "center" });
    return false;
  };
  const setText = (field: "title" | "alt" | "caption", value: string) =>
    setDraft({ ...draft, [field]: { ...draft[field], [activeLocale]: value } });
  const license = draft.license;
  const setLicense = (option: LicenseOption) => {
    const next: LicenseChoice =
      option === "none"
        ? { kind: "none" }
        : option === "url"
          ? {
              kind: "url",
              url: license.kind === "url" ? license.url : "",
              name: license.kind === "url" ? license.name : "",
            }
          : option === "spdx"
            ? {
                kind: "spdx",
                id: license.kind === "spdx" && licenseOption(license) === "spdx" ? license.id : "",
              }
            : { kind: "spdx", id: option };
    setDraft({ ...draft, license: next });
  };

  const source = asset.source;
  const sourceLine =
    source.kind === "upload"
      ? t("media.detail.source.upload", { name: source.filename ?? asset.slug })
      : source.kind === "fetch"
        ? t("media.detail.source.fetch", { url: source.url })
        : source.kind === "import"
          ? t("media.detail.source.import", { from: source.from })
          : t("media.detail.source.link");

  return (
    <PageLayout
      crumbs={<SiteCrumbs siteId={siteId} trail={[listCrumb, { label: name }]} copy={asset.id} />}
      title={name}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t(`media.kinds.${asset.kind}`)}</Badge>
          <UsageBadge count={usedCount} />
          <AssetBadges asset={asset} defaultLocale={defaultLocale} />
          <Text variant="mono-secondary" as="span">
            {data.url}
          </Text>
        </span>
      }
      actions={
        <>
          {!purged && (
            <LinkButton
              href={contentUrl}
              external
              variant="secondary"
              icon={ArrowSquareOut}
              data-testid="asset-open"
            >
              {t("media.detail.openFile")}
            </LinkButton>
          )}
          <Button
            variant="primary"
            onClick={() => {
              if (valid()) save.mutate(draft);
            }}
            loading={save.isPending}
            disabled={!dirty || !data.editable}
            title={readOnlyReason}
            data-testid="save"
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <ErrorBanner error={save.error ?? status.error ?? lift.error} />
      {purged && (
        <div data-testid="asset-purged">
          <Banner
            variant="error"
            icon={<ProhibitInset weight="fill" />}
            title={
              data.blob?.purge?.legal ? t("media.purged.title451") : t("media.purged.title410")
            }
            description={t("media.purged.description", {
              reason: data.blob?.purge?.reason ?? "",
            })}
            action={
              isOwner ? (
                <Banner.Action
                  variant="secondary"
                  loading={lift.isPending}
                  onClick={() => lift.mutate()}
                >
                  {t("media.purged.lift")}
                </Banner.Action>
              ) : undefined
            }
          />
        </div>
      )}
      {retired && !purged && (
        <Banner
          variant="secondary"
          icon={<Archive weight="fill" />}
          title={t("media.detail.retiredTitle")}
          description={t("media.detail.retiredDescription")}
        />
      )}
      <ViewOnlyBanner reason={readOnlyReason} />
      <ReadOnly reason={readOnlyReason} className="min-w-0">
        <EditorLayout
          main={
            <>
              <SectionCard
                id="preview"
                title={t("media.detail.preview")}
                icon={<Images size={16} />}
              >
                <div data-testid="asset-preview">
                  <AssetFrame
                    siteId={siteId}
                    asset={asset}
                    size="card"
                    alt={asset.alt?.[uiLocale] ?? asset.alt?.[defaultLocale] ?? ""}
                  />
                </div>
              </SectionCard>
              <SectionCard
                id="details"
                title={t("media.detail.details")}
                icon={<TextAa size={16} />}
                description={
                  isImage ? t("media.detail.detailsImage") : t("media.detail.detailsFile")
                }
              >
                {locales.length > 1 && (
                  <Tabs
                    variant="segmented"
                    value={activeLocale}
                    onValueChange={setLocale}
                    tabs={locales.map((l) => ({
                      value: l,
                      label:
                        l === defaultLocale ? t("media.detail.defaultLocale", { locale: l }) : l,
                    }))}
                  />
                )}
                <Input
                  label={t("media.detail.title")}
                  value={draft.title[activeLocale] ?? ""}
                  placeholder={source.kind === "upload" ? source.filename : undefined}
                  onValueChange={(v) => setText("title", v)}
                  description={t("media.detail.titleHint")}
                  error={
                    show(errors.title)
                      ? t("media.detail.errors.tooLong", { max: ASSET_LIMITS.title })
                      : undefined
                  }
                  maxLength={ASSET_LIMITS.title}
                  required={false}
                  className="w-full"
                  data-testid="asset-title"
                />
                {isImage && (
                  <div className="grid gap-3">
                    <InputArea
                      label={t("media.detail.alt")}
                      value={draft.decorative ? "" : (draft.alt[activeLocale] ?? "")}
                      placeholder={t("media.upload.altPlaceholder")}
                      onValueChange={(v) => setText("alt", v)}
                      description={
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            {activeLocale === defaultLocale
                              ? t("media.detail.altHint")
                              : t("media.detail.altHintLocale", { locale: defaultLocale })}
                          </span>
                          <CharacterCount
                            count={(draft.alt[activeLocale] ?? "").length}
                            recommended={125}
                          />
                        </span>
                      }
                      error={show(errors.alt) && errors.alt ? t(ALT_ERROR[errors.alt]) : undefined}
                      disabled={draft.decorative}
                      maxLength={ASSET_LIMITS.alt}
                      autoResize
                      minRows={2}
                      maxRows={5}
                      required={activeLocale === defaultLocale && !draft.decorative}
                      className="w-full"
                      data-testid="asset-alt"
                    />
                    <Switch
                      label={t("media.detail.decorative")}
                      checked={draft.decorative}
                      onCheckedChange={(checked: boolean) =>
                        setDraft({ ...draft, decorative: checked })
                      }
                      data-testid="asset-decorative"
                    />
                    <Text variant="secondary" size="sm">
                      {t("media.detail.decorativeHint")}
                    </Text>
                  </div>
                )}
                <InputArea
                  label={t("media.detail.caption")}
                  value={draft.caption[activeLocale] ?? ""}
                  onValueChange={(v) => setText("caption", v)}
                  description={t("media.detail.captionHint")}
                  error={
                    show(errors.caption)
                      ? t("media.detail.errors.tooLong", { max: ASSET_LIMITS.caption })
                      : undefined
                  }
                  maxLength={ASSET_LIMITS.caption}
                  autoResize
                  minRows={2}
                  maxRows={6}
                  required={false}
                  className="w-full"
                  data-testid="asset-caption"
                />
                <div className="@container">
                  <div className="grid items-start gap-5 @lg:grid-cols-2">
                    <Input
                      label={t("media.detail.credit")}
                      value={draft.credit}
                      placeholder={t("media.detail.creditPlaceholder")}
                      onValueChange={(v) => setDraft({ ...draft, credit: v })}
                      description={t("media.detail.creditHint")}
                      error={
                        show(errors.credit)
                          ? t("media.detail.errors.tooLong", { max: ASSET_LIMITS.credit })
                          : undefined
                      }
                      maxLength={ASSET_LIMITS.credit}
                      required={false}
                      className="w-full"
                      data-testid="asset-credit"
                    />
                    <Select
                      label={t("media.detail.license")}
                      value={licenseOption(license)}
                      onValueChange={(v) => setLicense(v as LicenseOption)}
                      description={t("media.detail.licenseHint")}
                      items={{
                        none: t("media.licenses.none"),
                        ...Object.fromEntries(
                          COMMON_LICENSES.map((id) => [id, t(`media.licenses.ids.${id}`)]),
                        ),
                        spdx: t("media.licenses.spdx"),
                        url: t("media.licenses.url"),
                      }}
                      className="w-full"
                      data-testid="asset-license"
                    />
                  </div>
                </div>
                {licenseOption(license) === "spdx" && license.kind === "spdx" && (
                  <Input
                    label={t("media.licenses.spdxId")}
                    value={license.id}
                    placeholder="CC-BY-NC-SA-4.0"
                    onValueChange={(v) => setDraft({ ...draft, license: { kind: "spdx", id: v } })}
                    description={t("media.licenses.spdxHint")}
                    error={show(errors.license) ? t("media.licenses.invalidSpdx") : undefined}
                    spellCheck={false}
                    className="w-full font-mono"
                  />
                )}
                {license.kind === "url" && (
                  <div className="@container">
                    <div className="grid items-start gap-5 @lg:grid-cols-2">
                      <Input
                        label={t("media.licenses.urlLabel")}
                        value={license.url}
                        placeholder="https://"
                        onValueChange={(v) =>
                          setDraft({ ...draft, license: { ...license, url: v } })
                        }
                        error={show(errors.license) ? t("media.licenses.invalidUrl") : undefined}
                        inputMode="url"
                        spellCheck={false}
                        className="w-full font-mono"
                      />
                      <Input
                        label={t("media.licenses.name")}
                        value={license.name}
                        onValueChange={(v) =>
                          setDraft({ ...draft, license: { ...license, name: v } })
                        }
                        required={false}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
              </SectionCard>
              <SectionCard
                id="address"
                title={t("media.detail.address")}
                icon={<LinkSimple size={16} />}
                description={t("media.detail.addressDescription")}
              >
                <InputGroup
                  label={t("media.detail.slug")}
                  description={t("media.detail.slugHint")}
                  className="w-full"
                >
                  <InputGroup.Addon>{`/media/${prefix}/`}</InputGroup.Addon>
                  <InputGroup.Input
                    aria-label={t("media.detail.slug")}
                    value={draft.slug}
                    onChange={(e) =>
                      setDraft({ ...draft, slug: slugify((e.target as HTMLInputElement).value) })
                    }
                    spellCheck={false}
                    className="font-mono"
                    data-testid="asset-slug"
                  />
                  <InputGroup.Suffix>{`.${ext}`}</InputGroup.Suffix>
                </InputGroup>
                {show(errors.slug) && (
                  <Text variant="error" size="sm">
                    {t("media.detail.errors.slug")}
                  </Text>
                )}
              </SectionCard>
              <SectionCard
                id="uses"
                title={t("media.uses.title")}
                icon={<FileText size={16} />}
                actions={<UsageBadge count={usedCount} />}
                flush
              >
                {data.uses.length === 0 ? (
                  <SectionEmpty
                    icon={<FileText size={32} className="text-kumo-inactive" />}
                    title={t("media.uses.empty")}
                    description={t("media.uses.emptyDescription")}
                  />
                ) : (
                  <Table>
                    <Table.Header>
                      <Table.Row>
                        <Table.Head>{t("media.uses.columns.node")}</Table.Head>
                        <Table.Head>{t("media.uses.columns.slot")}</Table.Head>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {data.uses.map((use) => {
                        const href = hrefOf(use);
                        return (
                          <Table.Row key={`${use.nodeId}-${use.field}`} data-use={use.nodeKind}>
                            <Table.Cell>
                              <span className="grid min-w-48 gap-0.5">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="inline-flex shrink-0">
                                    <Badge variant="outline">
                                      {t(
                                        `media.uses.kinds.${use.nodeKind === "contentEntry" ? "contentEntry" : use.nodeKind === "page" ? "page" : "term"}`,
                                      )}
                                    </Badge>
                                  </span>
                                  {href ? (
                                    <Link href={href} variant="plain">
                                      <Text as="span" truncate>
                                        {use.title ?? use.nodeId}
                                      </Text>
                                    </Link>
                                  ) : (
                                    <Text as="span" truncate>
                                      {use.title ?? use.nodeId}
                                    </Text>
                                  )}
                                </span>
                                {use.path && (
                                  <Text variant="mono-secondary" as="span">
                                    {use.path}
                                  </Text>
                                )}
                              </span>
                            </Table.Cell>
                            <Table.Cell className="whitespace-nowrap">
                              <Text as="span" variant="secondary">
                                {t(slotKey(use.field))}
                              </Text>
                            </Table.Cell>
                          </Table.Row>
                        );
                      })}
                    </Table.Body>
                  </Table>
                )}
              </SectionCard>
            </>
          }
          aside={
            <>
              <SectionCard
                id="file"
                title={t("media.detail.file")}
                icon={<Fingerprint size={16} />}
                actions={
                  purged ? undefined : (
                    <LinkButton
                      href={contentUrl}
                      external
                      variant="ghost"
                      size="sm"
                      icon={DownloadSimple}
                    >
                      {t("media.detail.download")}
                    </LinkButton>
                  )
                }
              >
                <dl className="grid divide-y divide-kumo-hairline" data-testid="asset-facts">
                  <SettingRow label={t("media.columns.type")}>
                    <Text as="span">{typeLabel(asset.mediaType)}</Text>
                    <Text as="span" variant="mono-secondary">
                      {asset.mediaType}
                    </Text>
                  </SettingRow>
                  <SettingRow label={t("media.columns.size")}>
                    <Text as="span">{formatSize(asset.bytes, uiLocale)}</Text>
                  </SettingRow>
                  {asset.image && (
                    <SettingRow label={t("media.detail.dimensions")}>
                      <Text as="span">
                        {t("seo.cover.size", {
                          width: asset.image.width,
                          height: asset.image.height,
                        })}
                      </Text>
                    </SettingRow>
                  )}
                  <SettingRow label={t("media.detail.sha256")} hint={t("media.detail.sha256Hint")}>
                    <span className="min-w-0 break-all font-mono text-[0.9em]">
                      <InlineCopyText value={asset.sha256}>{asset.sha256}</InlineCopyText>
                    </span>
                  </SettingRow>
                  {asset.originalSha256 && (
                    <SettingRow
                      label={t("media.detail.originalSha256")}
                      hint={t("media.detail.originalSha256Hint")}
                    >
                      <span className="min-w-0 break-all font-mono text-[0.9em]">
                        <InlineCopyText value={asset.originalSha256}>
                          {asset.originalSha256}
                        </InlineCopyText>
                      </span>
                    </SettingRow>
                  )}
                  <SettingRow
                    label={t("media.detail.publicUrl")}
                    hint={t("media.detail.publicUrlHint")}
                  >
                    <span className="min-w-0 break-all font-mono text-[0.9em]">
                      <InlineCopyText value={data.url}>{data.url}</InlineCopyText>
                    </span>
                    {data.checksumUrl && (
                      <Text as="span" variant="mono-secondary">
                        {data.checksumUrl}
                      </Text>
                    )}
                  </SettingRow>
                </dl>
              </SectionCard>
              <SectionCard
                id="source"
                title={t("media.detail.sourceTitle")}
                icon={<UserCircle size={16} />}
              >
                <div className="grid gap-2">
                  <ActorCell actor={asset.uploadedBy} />
                  <span className="flex flex-wrap items-center gap-x-2">
                    <Text as="span" variant="secondary" size="sm">
                      {sourceLine}
                    </Text>
                    <RelativeTime iso={asset.createdAt} />
                  </span>
                </div>
              </SectionCard>
              <DetailsCard
                rows={[
                  {
                    label: t("media.detail.id"),
                    value: <InlineCopyText>{asset.id}</InlineCopyText>,
                  },
                  { label: t("editor.revision"), value: <Text as="span">{asset.rev}</Text> },
                  {
                    label: t("editor.updatedAt"),
                    value: <RelativeTime iso={asset.updatedAt} size="base" />,
                  },
                ]}
              />
              <DangerZoneCard
                items={[
                  retired
                    ? {
                        title: t("media.danger.restoreTitle"),
                        description: purged
                          ? t("media.danger.restorePurged")
                          : t("media.danger.restoreDescription"),
                        actionLabel: t("media.danger.restore"),
                        onAction: () => status.mutate("restore"),
                        disabledReason: manage.allowed
                          ? purged
                            ? t("media.danger.restorePurged")
                            : undefined
                          : manage.reason,
                        variant: "secondary",
                        icon: <ArrowCounterClockwise />,
                        "data-testid": "asset-restore",
                      }
                    : {
                        title: t("media.danger.retireTitle"),
                        description: t("media.danger.retireDescription"),
                        actionLabel: t("media.danger.retire"),
                        onAction: () => status.mutate("retire"),
                        disabledReason: manage.allowed ? undefined : manage.reason,
                        variant: "secondary",
                        icon: <Archive />,
                        "data-testid": "asset-retire",
                      },
                  {
                    title: t("media.danger.deleteTitle"),
                    description: t("media.danger.deleteDescription"),
                    actionLabel: t("media.danger.delete"),
                    onAction: () => setDeleteOpen(true),
                    disabledReason: !manage.allowed
                      ? manage.reason
                      : usedCount > 0
                        ? t("media.danger.inUse", { count: usedCount })
                        : undefined,
                    icon: <Trash />,
                    "data-testid": "asset-delete",
                  },
                  ...(asset.storage.kind === "blob" && !purged
                    ? [
                        {
                          title: t("media.danger.takedownTitle"),
                          description: t("media.danger.takedownDescription"),
                          actionLabel: t("media.danger.takedown"),
                          onAction: () => setTakedownOpen(true),
                          disabledReason: takedownGate.allowed ? undefined : takedownGate.reason,
                          icon: <ProhibitInset />,
                          "data-testid": "asset-takedown",
                        },
                      ]
                    : []),
                ]}
              />
            </>
          }
        />
      </ReadOnly>
      <DeleteResource
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        resourceType={t("media.detail.resourceType")}
        resourceName={name}
        isDeleting={remove.isPending}
        errorMessage={remove.error instanceof Error ? remove.error.message : undefined}
        onDelete={async () => {
          await remove.mutateAsync();
        }}
      />
      <TakedownDialog
        asset={asset}
        name={name}
        open={takedownOpen}
        onOpenChange={setTakedownOpen}
        busy={takedown.isPending}
        error={takedown.error instanceof Error ? takedown.error.message : undefined}
        onConfirm={(input) => takedown.mutate(input)}
      />
    </PageLayout>
  );
}
