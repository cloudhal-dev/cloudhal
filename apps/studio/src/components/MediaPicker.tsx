import {
  Button,
  Collapsible,
  ImagePreview,
  type ImagePreviewStatus,
  Input,
  InputArea,
  InsetPanel,
  LayerDialog,
  MediaGrid,
  MediaTile,
  SectionEmpty,
  SkeletonLine,
  Tabs,
  Text,
} from "@cloudhal/ui";
import { ArrowsClockwise, Images, LinkSimple } from "@phosphor-icons/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { type MessageKey, useI18n, useT } from "../i18n/index.tsx";
import { type AssetListItem, api } from "../lib/api.ts";
import {
  ACCEPT_IMAGES,
  assetMeta,
  assetPreviewUrl,
  assetTitle,
  imageRefFor,
  LIBRARY_PAGE_SIZE,
} from "../lib/media.ts";
import {
  editImageRef,
  type ImageRef,
  type ImageRefErrors,
  previewImageUrl,
  SEO_LIMITS,
} from "../lib/seo.ts";
import { AssetBadges, AssetFrame } from "./Media.tsx";
import { UploadPanel, useMediaUpload } from "./MediaUpload.tsx";
import { useGate } from "./useMe.ts";

type PickerTab = "library" | "upload";

/**
 * The media picker (RFC-0004 §8, DESIGN.md §2u): `LayerDialog lg` with "Library" (active images,
 * newest first, searchable) and "Upload" (the library's upload panel; a finished upload is
 * selected). "Use this image" hands the chosen asset back; the caller writes `assetId` and the URL.
 */
export function AssetPickerDialog({
  siteId,
  defaultLocale,
  open,
  onOpenChange,
  onPick,
  currentId,
}: {
  siteId: string;
  defaultLocale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (item: AssetListItem) => void;
  /** The asset the slot shows now (preselected). */
  currentId?: string | undefined;
}) {
  const t = useT();
  const { locale } = useI18n();
  const uploadGate = useGate("assets.upload");
  const [tab, setTab] = useState<PickerTab>("library");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AssetListItem | undefined>();
  const upload = useMediaUpload(siteId, {
    onUploaded: (items) => {
      const image = items.find((i) => i.asset.kind === "image");
      if (image) setSelected(image);
    },
  });
  useEffect(() => {
    if (!open) return;
    setTab("library");
    setSearch("");
    setSelected(undefined);
  }, [open]);
  const images = useInfiniteQuery({
    queryKey: ["assets", siteId, "picker", search.trim()],
    queryFn: ({ pageParam }) =>
      api.assets.list(siteId, {
        kind: ["image"],
        status: ["active"],
        q: search,
        cursor: pageParam,
        limit: LIBRARY_PAGE_SIZE,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    enabled: open,
  });
  const items = images.data?.pages.flatMap((p) => p.assets) ?? [];
  const chosenId = selected?.asset.id ?? currentId;
  const chosen = selected ?? items.find((i) => i.asset.id === chosenId);
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) upload.reset();
  };
  return (
    <LayerDialog.Root open={open} onOpenChange={close} dismissDisabled={upload.busy}>
      <LayerDialog.Content size="lg" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("media.picker.title")}</LayerDialog.Title>
        <LayerDialog.Description>{t("media.picker.description")}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid min-w-0 gap-4" data-testid="asset-picker">
            <Tabs
              variant="segmented"
              value={tab}
              onValueChange={(v) => setTab(v as PickerTab)}
              tabs={[
                { value: "library", label: t("media.picker.library") },
                { value: "upload", label: t("media.picker.upload") },
              ]}
            />
            {tab === "library" ? (
              <div className="grid min-w-0 gap-4">
                <Input
                  aria-label={t("media.picker.search")}
                  placeholder={t("media.picker.search")}
                  value={search}
                  onValueChange={setSearch}
                  className="w-full"
                  data-testid="picker-search"
                />
                {images.isPending ? (
                  <div className="grid gap-2" role="status" aria-label={t("common.loading")}>
                    <SkeletonLine />
                    <SkeletonLine />
                    <SkeletonLine />
                  </div>
                ) : items.length === 0 ? (
                  <SectionEmpty
                    icon={<Images size={32} className="text-kumo-inactive" />}
                    title={search.trim() ? t("media.picker.noMatch") : t("media.picker.empty")}
                    description={t("media.picker.emptyDescription")}
                    contents={
                      <Button
                        variant="secondary"
                        onClick={() => setTab("upload")}
                        disabled={!uploadGate.allowed}
                        title={uploadGate.reason}
                      >
                        {t("media.picker.upload")}
                      </Button>
                    }
                  />
                ) : (
                  <>
                    <MediaGrid label={t("media.picker.library")}>
                      {items.map((item) => (
                        <MediaTile
                          key={item.asset.id}
                          preview={<AssetFrame siteId={siteId} asset={item.asset} size="tile" />}
                          title={assetTitle(item.asset, locale, defaultLocale)}
                          meta={assetMeta(item.asset, locale)}
                          badges={
                            <AssetBadges asset={item.asset} defaultLocale={defaultLocale} compact />
                          }
                          selected={item.asset.id === chosenId}
                          onSelect={() => setSelected(item)}
                          data-testid="picker-tile"
                        />
                      ))}
                    </MediaGrid>
                    {images.hasNextPage && (
                      <div className="flex justify-center">
                        <Button
                          variant="secondary"
                          loading={images.isFetchingNextPage}
                          onClick={() => void images.fetchNextPage()}
                        >
                          {t("media.loadMore")}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <UploadPanel
                upload={upload}
                accept={ACCEPT_IMAGES}
                multiple={false}
                disabledReason={uploadGate.reason}
                description={t("media.drop.imageDescription")}
                inlineStart
              />
            )}
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            disabled={chosen?.asset.kind !== "image"}
            onClick={() => {
              if (!chosen) return;
              onPick(chosen);
              close(false);
            }}
            data-testid="picker-use"
          >
            {t("media.picker.use")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

const SRC_ERROR: Record<NonNullable<ImageRefErrors["src"]>, MessageKey> = {
  required: "seo.cover.errors.required",
  insecure: "seo.cover.errors.insecure",
  invalid: "seo.cover.errors.invalid",
  tooLong: "seo.cover.errors.tooLong",
};
const ALT_ERROR: Record<NonNullable<ImageRefErrors["alt"]>, MessageKey> = {
  required: "seo.cover.errors.altRequired",
  tooLong: "seo.cover.errors.altTooLong",
};

/**
 * An image slot (cover, term image, Image and Hero sections; RFC-0004 §8): the picture, the
 * chosen media-library file with "Change", the alt text for this use, and — under "Use an image
 * address instead" — the legacy URL, which stays editable; editing it detaches the asset.
 */
export function ImageRefField({
  siteId,
  defaultLocale,
  image,
  savedSrc,
  host,
  errors,
  showErrors,
  onChange,
  onStatusChange,
  testId = "image",
  labels,
}: {
  siteId: string;
  defaultLocale: string;
  image: ImageRef | undefined;
  /** The saved image's source: dimensions are recorded only for a newly chosen address. */
  savedSrc: string | undefined;
  /** The site's primary domain; site paths load from it. */
  host: string | undefined;
  errors: ImageRefErrors;
  showErrors: boolean;
  onChange: (image: ImageRef | undefined) => void;
  onStatusChange?: ((status: ImagePreviewStatus) => void) | undefined;
  /** Prefix of the test ids (`cover` → `cover-src`, `cover-alt`, `cover-preview`). */
  testId?: string;
  labels?: { empty?: string };
}) {
  const t = useT();
  const { locale } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [touched, setTouched] = useState({ src: false, alt: false });
  const assetId = image?.assetId;
  const legacy = Boolean(image && !assetId && image.src.trim());
  const [addressOpen, setAddressOpen] = useState(legacy);
  useEffect(() => {
    if (legacy) setAddressOpen(true);
  }, [legacy]);
  const detail = useQuery({
    queryKey: ["asset", siteId, assetId],
    queryFn: () => api.assets.get(siteId, assetId as string),
    enabled: Boolean(assetId),
  });
  const asset = detail.data?.asset;
  const src = image?.src ?? "";
  const alt = image?.alt ?? "";
  const url = assetId
    ? asset
      ? assetPreviewUrl(siteId, asset)
      : undefined
    : previewImageUrl(src, host);
  const sitePath = !assetId && src.trim().startsWith("/");
  const srcError =
    !assetId && (showErrors || touched.src) && errors.src ? t(SRC_ERROR[errors.src]) : undefined;
  const altError = (showErrors || touched.alt) && errors.alt ? t(ALT_ERROR[errors.alt]) : undefined;
  const assetAlt = asset?.alt?.[defaultLocale];
  return (
    <div className="@container">
      <div className="grid items-start gap-5 @md:grid-cols-5">
        <div className="min-w-0 @md:col-span-2" data-testid={`${testId}-preview`}>
          <ImagePreview
            src={url}
            alt={alt || assetAlt || ""}
            labels={{
              empty: labels?.empty ?? t("seo.cover.empty"),
              loading: t("seo.cover.loading"),
              error: t("seo.cover.broken"),
            }}
            caption={
              image?.width && image.height
                ? t("seo.cover.size", { width: image.width, height: image.height })
                : undefined
            }
            errorHint={
              assetId
                ? t("media.field.brokenAsset")
                : sitePath
                  ? host
                    ? t("seo.cover.brokenPathHost", { host })
                    : t("seo.cover.brokenPathNoDomain")
                  : t("seo.cover.brokenHint")
            }
            onStatusChange={onStatusChange}
            onLoad={(size) => {
              if (!image || assetId || image.src === savedSrc) return;
              if (image.width === size.width && image.height === size.height) return;
              onChange({ ...image, ...size });
            }}
          />
        </div>
        <div className="grid min-w-0 gap-5 @md:col-span-3">
          {assetId ? (
            <InsetPanel layout="row" label={t("media.field.fromLibrary")}>
              <span className="grid min-w-0 gap-0.5" data-testid={`${testId}-asset`}>
                <Text as="span" variant="secondary" size="sm">
                  {t("media.field.fromLibrary")}
                </Text>
                {asset ? (
                  <>
                    <Text as="span" bold truncate>
                      {assetTitle(asset, locale, defaultLocale)}
                    </Text>
                    <Text as="span" variant="secondary" size="sm">
                      {assetMeta(asset, locale)}
                    </Text>
                  </>
                ) : detail.isError ? (
                  <Text as="span" variant="error" size="sm">
                    {t("media.field.missing")}
                  </Text>
                ) : (
                  <SkeletonLine />
                )}
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon={<ArrowsClockwise />}
                onClick={() => setPickerOpen(true)}
                data-testid={`${testId}-change`}
              >
                {t("media.field.change")}
              </Button>
            </InsetPanel>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                icon={<Images />}
                onClick={() => setPickerOpen(true)}
                data-testid={`${testId}-choose`}
              >
                {t("media.field.choose")}
              </Button>
              <Text as="span" variant="secondary" size="sm">
                {t("media.field.chooseHint")}
              </Text>
            </div>
          )}
          <InputArea
            label={assetId ? t("media.field.altForUse") : t("seo.cover.alt")}
            value={alt}
            placeholder={
              assetId ? (assetAlt ?? t("seo.cover.altPlaceholder")) : t("seo.cover.altPlaceholder")
            }
            onValueChange={(v) =>
              onChange(image ? { ...image, alt: v } : editImageRef(image, { alt: v }))
            }
            onBlur={() => setTouched((x) => ({ ...x, alt: true }))}
            description={
              assetId
                ? assetAlt
                  ? t("media.field.altForUseHint", { alt: assetAlt })
                  : asset?.decorative
                    ? t("media.field.altDecorativeHint")
                    : t("media.field.altNoneHint")
                : t("seo.cover.altHint")
            }
            error={altError}
            maxLength={SEO_LIMITS.altMax}
            autoResize
            minRows={2}
            maxRows={4}
            required={assetId ? false : image !== undefined ? undefined : false}
            className="w-full"
            data-testid={`${testId}-alt`}
          />
          <Collapsible.Root open={addressOpen} onOpenChange={setAddressOpen}>
            <Collapsible.DefaultTrigger>
              <span className="flex items-center gap-2" data-testid={`${testId}-address-toggle`}>
                <LinkSimple size={16} aria-hidden />
                {t("media.field.useAddress")}
              </span>
            </Collapsible.DefaultTrigger>
            <Collapsible.DefaultPanel>
              <div className="pt-1">
                <Input
                  label={t("seo.cover.url")}
                  value={assetId ? "" : src}
                  placeholder={t("seo.cover.urlPlaceholder")}
                  onValueChange={(v) => onChange(editImageRef(image, { src: v }))}
                  onBlur={() => setTouched((x) => ({ ...x, src: true }))}
                  description={assetId ? t("media.field.addressReplaces") : t("seo.cover.urlHint")}
                  error={srcError}
                  maxLength={SEO_LIMITS.srcMax}
                  inputMode="url"
                  spellCheck={false}
                  required={false}
                  className="w-full font-mono"
                  data-testid={`${testId}-src`}
                />
              </div>
            </Collapsible.DefaultPanel>
          </Collapsible.Root>
        </div>
      </div>
      <AssetPickerDialog
        siteId={siteId}
        defaultLocale={defaultLocale}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        currentId={assetId}
        onPick={(item) => {
          setTouched({ src: false, alt: false });
          onChange(imageRefFor(item, alt));
        }}
      />
    </div>
  );
}
