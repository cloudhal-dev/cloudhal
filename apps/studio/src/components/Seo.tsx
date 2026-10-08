import type { ContentEntry, Page } from "@cloudhal/core-contracts";
import {
  Badge,
  Banner,
  Button,
  Collapsible,
  ImagePreview,
  type ImagePreviewStatus,
  Input,
  InputArea,
  InsetPanel,
  SearchResultPreview,
  SectionCard,
  SocialCardPreview,
  Switch,
  Tabs,
  Text,
} from "@cloudhal/ui";
import { EyeSlash, Image as ImageIcon, MagnifyingGlass, Trash } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { type MessageKey, useT } from "../i18n/index.tsx";
import {
  applySeo,
  descriptionStatus,
  editImageRef,
  type ImageRef,
  type ImageRefErrors,
  type LengthStatus,
  previewImageUrl,
  SEO_LIMITS,
  type SeoErrors,
  searchBreadcrumb,
  titleStatus,
  truncateForSearch,
} from "../lib/seo.ts";
import { SettingRow } from "./Settings.tsx";

/** "142 / 160" under a field; warning colour once past the length search results show. */
export function CharacterCount({ count, recommended }: { count: number; recommended: number }) {
  const t = useT();
  const over = count > recommended;
  return (
    <span
      className={over ? "shrink-0 text-kumo-warning tabular-nums" : "shrink-0 tabular-nums"}
      data-over={over}
      data-testid="character-count"
    >
      {t("seo.counter", { count, max: recommended })}
    </span>
  );
}

/** A field description with a character counter on the right. */
export function CountedHint({
  hint,
  count,
  recommended,
}: {
  hint: ReactNode;
  count: number;
  recommended: number;
}) {
  return (
    <span className="flex items-start justify-between gap-3">
      <span className="min-w-0">{hint}</span>
      <CharacterCount count={count} recommended={recommended} />
    </span>
  );
}

const STATUS_BADGE: Record<LengthStatus | "broken", "success" | "warning" | "error"> = {
  good: "success",
  short: "warning",
  long: "warning",
  missing: "warning",
  broken: "error",
};

function CheckBadge({ status }: { status: LengthStatus | "broken" }) {
  const t = useT();
  return (
    <span className="inline-flex" data-check={status}>
      <Badge variant={STATUS_BADGE[status]} appearance="dot">
        {t(`seo.checks.status.${status}`)}
      </Badge>
    </span>
  );
}

// ---- cover image --------------------------------------------------------------------------------

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
 * Article › Cover image (DESIGN.md §2o): the image in a 1.91:1 share frame next to its URL and
 * required alt text. The URL `Input` is the source slot — an upload or library picker replaces it
 * later without changing the rest of the card.
 */
export function CoverImageCard({
  image,
  savedSrc,
  host,
  errors,
  showErrors,
  onChange,
  onStatusChange,
}: {
  image: ImageRef | undefined;
  /** The saved image's source: dimensions are recorded only for a newly chosen image. */
  savedSrc: string | undefined;
  /** The site's primary domain; site paths load from it. */
  host: string | undefined;
  errors: ImageRefErrors;
  /** After a save attempt every error shows, not only those of fields already left. */
  showErrors: boolean;
  onChange: (image: ImageRef | undefined) => void;
  onStatusChange: (status: ImagePreviewStatus) => void;
}) {
  const t = useT();
  const [touched, setTouched] = useState({ src: false, alt: false });
  const src = image?.src ?? "";
  const alt = image?.alt ?? "";
  const url = previewImageUrl(src, host);
  const sitePath = src.trim().startsWith("/");
  const srcError = (showErrors || touched.src) && errors.src ? t(SRC_ERROR[errors.src]) : undefined;
  const altError = (showErrors || touched.alt) && errors.alt ? t(ALT_ERROR[errors.alt]) : undefined;
  return (
    <SectionCard
      id="cover-image"
      title={t("seo.cover.title")}
      icon={<ImageIcon size={16} />}
      description={t("seo.cover.description")}
      actions={
        image ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash />}
            onClick={() => {
              setTouched({ src: false, alt: false });
              onChange(undefined);
            }}
            data-testid="cover-remove"
          >
            {t("seo.cover.remove")}
          </Button>
        ) : undefined
      }
    >
      <div className="@container">
        <div className="grid items-start gap-5 @md:grid-cols-5">
          <div className="min-w-0 @md:col-span-2" data-testid="cover-preview">
            <ImagePreview
              src={url}
              alt={alt}
              labels={{
                empty: t("seo.cover.empty"),
                loading: t("seo.cover.loading"),
                error: t("seo.cover.broken"),
              }}
              caption={
                image?.width && image.height
                  ? t("seo.cover.size", { width: image.width, height: image.height })
                  : undefined
              }
              errorHint={
                sitePath
                  ? host
                    ? t("seo.cover.brokenPathHost", { host })
                    : t("seo.cover.brokenPathNoDomain")
                  : t("seo.cover.brokenHint")
              }
              onStatusChange={onStatusChange}
              onLoad={(size) => {
                if (!image || image.src === savedSrc) return;
                if (image.width === size.width && image.height === size.height) return;
                onChange({ ...image, ...size });
              }}
            />
          </div>
          <div className="grid min-w-0 gap-5 @md:col-span-3">
            <Input
              label={t("seo.cover.url")}
              value={src}
              placeholder={t("seo.cover.urlPlaceholder")}
              onValueChange={(v) => onChange(editImageRef(image, { src: v }))}
              onBlur={() => setTouched((x) => ({ ...x, src: true }))}
              description={t("seo.cover.urlHint")}
              error={srcError}
              maxLength={SEO_LIMITS.srcMax}
              inputMode="url"
              spellCheck={false}
              required={false}
              className="w-full font-mono"
              data-testid="cover-src"
            />
            <InputArea
              label={t("seo.cover.alt")}
              value={alt}
              placeholder={t("seo.cover.altPlaceholder")}
              onValueChange={(v) => onChange(editImageRef(image, { alt: v }))}
              onBlur={() => setTouched((x) => ({ ...x, alt: true }))}
              description={t("seo.cover.altHint")}
              error={altError}
              maxLength={SEO_LIMITS.altMax}
              autoResize
              minRows={2}
              maxRows={4}
              required={image !== undefined ? undefined : false}
              className="w-full"
              data-testid="cover-alt"
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ---- search and social preview (articles) -------------------------------------------------------

type PreviewView = "search" | "social";

/**
 * Article › Search and social preview (DESIGN.md §2o), read-only: a search result and a share
 * card built from the title, the summary (the meta description) and the cover image, with
 * length checks. Articles get their own SEO fields only with RFC-0002.
 */
export function ArticleSeoPreviewCard({
  entry,
  siteName,
  host,
  coverStatus,
}: {
  entry: ContentEntry;
  siteName: string;
  host: string | undefined;
  coverStatus: ImagePreviewStatus;
}) {
  const t = useT();
  const [view, setView] = useState<PreviewView>("search");
  const title = entry.title.trim() || t("articles.untitled");
  const summary = entry.summary?.trim() ?? "";
  const description = summary ? truncateForSearch(summary).text : t("seo.preview.noSummary");
  const path = `/${entry.collection}/${entry.slug}`;
  const cover = entry.coverImage;
  const coverUrl = cover ? previewImageUrl(cover.src, host) : undefined;
  const titleState = titleStatus(entry.title);
  const summaryState = descriptionStatus(summary);
  const imageState: LengthStatus | "broken" = !cover
    ? "missing"
    : coverStatus === "error" || !coverUrl
      ? "broken"
      : "good";
  return (
    <SectionCard
      id="search-preview"
      title={t("seo.preview.title")}
      icon={<MagnifyingGlass size={16} />}
      description={t("seo.preview.description")}
      actions={
        <Tabs
          size="sm"
          value={view}
          onValueChange={(v) => setView(v as PreviewView)}
          tabs={[
            { value: "search", label: t("seo.preview.search") },
            { value: "social", label: t("seo.preview.social") },
          ]}
        />
      }
    >
      {view === "search" ? (
        <InsetPanel>
          <SearchResultPreview
            siteName={siteName}
            breadcrumb={searchBreadcrumb(host, path)}
            title={title}
            description={description}
            placeholder={!summary}
          />
        </InsetPanel>
      ) : (
        <SocialCardPreview
          className="max-w-md"
          host={host ?? siteName}
          title={title}
          description={description}
          placeholder={!summary}
          image={
            <ImagePreview
              src={coverUrl}
              alt={cover?.alt ?? ""}
              labels={{
                empty: t("seo.noCover"),
                loading: t("seo.cover.loading"),
                error: t("seo.cover.broken"),
              }}
            />
          }
        />
      )}
      <dl className="-my-3 grid divide-y divide-kumo-hairline" aria-label={t("seo.checks.label")}>
        <SettingRow
          label={t("seo.checks.title")}
          hint={
            titleState === "missing"
              ? t("seo.checks.titleMissing")
              : titleState === "long"
                ? t("seo.checks.titleLong", { count: entry.title.trim().length })
                : t("seo.checks.titleGood", { count: entry.title.trim().length })
          }
        >
          <CheckBadge status={titleState} />
        </SettingRow>
        <SettingRow
          label={t("seo.checks.summary")}
          hint={descriptionHint(t, summaryState, summary.length, "seo.checks.summaryMissing")}
        >
          <CheckBadge status={summaryState} />
        </SettingRow>
        <SettingRow
          label={t("seo.checks.image")}
          hint={
            imageState === "missing"
              ? t("seo.checks.imageMissing")
              : imageState === "broken"
                ? t("seo.checks.imageBroken")
                : t("seo.checks.imageSet")
          }
        >
          <CheckBadge status={imageState} />
        </SettingRow>
      </dl>
    </SectionCard>
  );
}

function descriptionHint(
  t: ReturnType<typeof useT>,
  status: LengthStatus,
  count: number,
  missing: MessageKey,
): string {
  if (status === "missing") return t(missing);
  if (status === "short") return t("seo.checks.descriptionShort", { count });
  if (status === "long") return t("seo.checks.descriptionLong", { count });
  return t("seo.checks.descriptionGood", { count });
}

// ---- page SEO panel -----------------------------------------------------------------------------

const CANONICAL_ERROR: Record<NonNullable<SeoErrors["canonical"]>, MessageKey> = {
  invalid: "seo.page.errors.canonicalInvalid",
  tooLong: "seo.page.errors.canonicalTooLong",
};

/**
 * Page › Search engines and sharing (DESIGN.md §2o): SEO title and meta description with
 * counters, the noindex `Switch` with its warning, the canonical URL under "Advanced", and the
 * search result preview.
 */
export function PageSeoCard({
  page,
  siteName,
  host,
  errors,
  showErrors,
  onChange,
}: {
  page: Page;
  siteName: string;
  host: string | undefined;
  errors: SeoErrors;
  showErrors: boolean;
  onChange: (page: Page) => void;
}) {
  const t = useT();
  const seo = page.seo ?? {};
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(seo.canonical));
  const [canonicalTouched, setCanonicalTouched] = useState(false);
  const title = seo.title ?? "";
  const description = seo.description ?? "";
  const canonical = seo.canonical ?? "";
  const shownTitle = title.trim() || page.title.trim() || t("articles.untitled");
  const shownDescription = description.trim()
    ? truncateForSearch(description).text
    : t("seo.preview.noDescription");
  const canonicalError =
    errors.canonical && (showErrors || canonicalTouched)
      ? t(CANONICAL_ERROR[errors.canonical])
      : undefined;
  return (
    <SectionCard
      id="seo"
      title={t("seo.page.title")}
      icon={<MagnifyingGlass size={16} />}
      description={t("seo.page.description")}
    >
      <Input
        label={t("seo.page.seoTitle")}
        value={title}
        placeholder={page.title}
        onValueChange={(v) => onChange(applySeo(page, { title: v }))}
        description={
          <CountedHint
            hint={t("seo.page.seoTitleHint")}
            count={title.trim().length}
            recommended={SEO_LIMITS.titleRecommended}
          />
        }
        error={errors.title ? t("seo.page.errors.titleTooLong") : undefined}
        maxLength={SEO_LIMITS.titleMax}
        required={false}
        className="w-full"
        data-testid="seo-title"
      />
      <InputArea
        label={t("seo.page.seoDescription")}
        value={description}
        placeholder={t("seo.page.seoDescriptionPlaceholder")}
        onValueChange={(v) => onChange(applySeo(page, { description: v }))}
        description={
          <CountedHint
            hint={t("seo.page.seoDescriptionHint")}
            count={description.trim().length}
            recommended={SEO_LIMITS.descriptionRecommended}
          />
        }
        error={errors.description ? t("seo.page.errors.descriptionTooLong") : undefined}
        maxLength={SEO_LIMITS.descriptionMax}
        autoResize
        minRows={2}
        maxRows={6}
        required={false}
        className="w-full"
        data-testid="seo-description"
      />
      <div className="grid gap-1.5">
        <Switch
          label={t("seo.page.noindex")}
          checked={seo.noindex === true}
          onCheckedChange={(checked: boolean) => onChange(applySeo(page, { noindex: checked }))}
          data-testid="seo-noindex"
        />
        <Text variant="secondary" size="sm">
          {t("seo.page.noindexHint")}
        </Text>
      </div>
      {seo.noindex && (
        <Banner
          variant="alert"
          icon={<EyeSlash weight="fill" />}
          title={t("seo.page.noindexWarningTitle")}
          description={t("seo.page.noindexWarning")}
          data-testid="noindex-warning"
        />
      )}
      <Collapsible.Root open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <Collapsible.DefaultTrigger>
          <span className="flex flex-wrap items-center gap-2">
            <span>{t("seo.page.advanced")}</span>
            {canonical.trim() && <Badge variant="info">{t("seo.page.custom")}</Badge>}
          </span>
        </Collapsible.DefaultTrigger>
        <Collapsible.DefaultPanel>
          <div className="pt-1">
            <Input
              label={t("seo.page.canonical")}
              value={canonical}
              placeholder={t("seo.page.canonicalPlaceholder")}
              onValueChange={(v) => onChange(applySeo(page, { canonical: v }))}
              onBlur={() => setCanonicalTouched(true)}
              description={
                host ? t("seo.page.canonicalHintHost", { host }) : t("seo.page.canonicalHint")
              }
              error={canonicalError}
              maxLength={SEO_LIMITS.canonicalMax}
              inputMode="url"
              spellCheck={false}
              required={false}
              className="w-full font-mono"
              data-testid="seo-canonical"
            />
          </div>
        </Collapsible.DefaultPanel>
      </Collapsible.Root>
      <div className="grid gap-2">
        <Text bold as="span">
          {t("seo.page.searchPreview")}
        </Text>
        <InsetPanel>
          <SearchResultPreview
            siteName={siteName}
            breadcrumb={searchBreadcrumb(host, page.path, canonical)}
            title={shownTitle}
            description={shownDescription}
            placeholder={!description.trim()}
            footer={
              seo.noindex ? (
                <Badge variant="warning" icon={<EyeSlash />}>
                  {t("seo.page.hidden")}
                </Badge>
              ) : undefined
            }
          />
        </InsetPanel>
      </div>
    </SectionCard>
  );
}
