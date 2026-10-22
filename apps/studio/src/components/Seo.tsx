import type { ContentEntry, Page } from "@cloudhal/core-contracts";
import { entryPath } from "@cloudhal/core-ts/permalinks";
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
import { type MessageKey, type TFunction, useT } from "../i18n/index.tsx";
import { imageRefPreviewUrl } from "../lib/media.ts";
import {
  descriptionStatus,
  type ImageRef,
  type ImageRefErrors,
  type LengthStatus,
  patchSeo,
  SEO_LIMITS,
  type Seo,
  type SeoErrors,
  searchBreadcrumb,
  titleStatus,
  truncateForSearch,
} from "../lib/seo.ts";
import { setOptional } from "../lib/util.ts";
import { useSitePermalinks } from "./EntryPath.tsx";
import { ImageRefField } from "./MediaPicker.tsx";
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

/**
 * Article › Cover image (DESIGN.md §2o, §2u): the image in a 1.91:1 share frame next to its source
 * — a media-library file chosen with the picker, or (under "Use an image address instead") an
 * address — and the alt text for this use. The fields are `ImageRefField`, shared with the term
 * image and the page sections.
 */
export function CoverImageCard({
  siteId,
  defaultLocale,
  image,
  savedSrc,
  host,
  errors,
  showErrors,
  onChange,
  onStatusChange,
  id = "cover-image",
  title,
  description,
}: {
  siteId: string;
  defaultLocale: string;
  image: ImageRef | undefined;
  /** The saved image's source: dimensions are recorded only for a newly chosen image. */
  savedSrc: string | undefined;
  /** The site's primary domain; site paths load from it. */
  host: string | undefined;
  errors: ImageRefErrors;
  /** After a save attempt every error shows, not only those of fields already left. */
  showErrors: boolean;
  onChange: (image: ImageRef | undefined) => void;
  onStatusChange?: ((status: ImagePreviewStatus) => void) | undefined;
  /** Card anchor and heading for other images than an article's cover (a term's image). */
  id?: string;
  title?: string;
  description?: string;
}) {
  const t = useT();
  return (
    <SectionCard
      id={id}
      title={title ?? t("seo.cover.title")}
      icon={<ImageIcon size={16} />}
      description={description ?? t("seo.cover.description")}
      actions={
        image ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash />}
            onClick={() => onChange(undefined)}
            data-testid="cover-remove"
          >
            {t("seo.cover.remove")}
          </Button>
        ) : undefined
      }
    >
      <ImageRefField
        siteId={siteId}
        defaultLocale={defaultLocale}
        image={image}
        savedSrc={savedSrc}
        host={host}
        errors={errors}
        showErrors={showErrors}
        onChange={onChange}
        onStatusChange={onStatusChange}
        testId="cover"
      />
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
  const site = useSitePermalinks(entry.siteId);
  const path = entryPath(site, entry);
  const cover = entry.coverImage;
  const coverUrl = cover ? imageRefPreviewUrl(entry.siteId, cover, host) : undefined;
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
  t: TFunction,
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
 * Search engines and sharing fields (DESIGN.md §2o) for any routable node — a page, a term
 * archive: SEO title and meta description with counters, the noindex `Switch` with its warning,
 * the canonical URL under "Advanced", and the search result preview. Empty fields are removed
 * (`patchSeo`), so an untouched node keeps no `seo`.
 */
export function SeoFields({
  seo: value,
  onChange,
  fallbackTitle,
  path,
  siteName,
  host,
  errors,
  showErrors,
  kind = "page",
}: {
  seo: Seo | undefined;
  onChange: (seo: Seo | undefined) => void;
  /** The SEO title's placeholder and the preview's title when none is set. */
  fallbackTitle: string;
  /** The node's path on the site (`/about`, `/category/news`). */
  path: string;
  siteName: string;
  host: string | undefined;
  errors: SeoErrors;
  showErrors: boolean;
  /** Wording of the noindex hint and warning. */
  kind?: "page" | "archive";
}) {
  const t = useT();
  const seo = value ?? {};
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(seo.canonical));
  const [canonicalTouched, setCanonicalTouched] = useState(false);
  const title = seo.title ?? "";
  const description = seo.description ?? "";
  const canonical = seo.canonical ?? "";
  const shownTitle = title.trim() || fallbackTitle.trim() || t("articles.untitled");
  const shownDescription = description.trim()
    ? truncateForSearch(description).text
    : t("seo.preview.noDescription");
  const canonicalError =
    errors.canonical && (showErrors || canonicalTouched)
      ? t(CANONICAL_ERROR[errors.canonical])
      : undefined;
  return (
    <>
      <Input
        label={t("seo.page.seoTitle")}
        value={title}
        placeholder={fallbackTitle}
        onValueChange={(v) => onChange(patchSeo(seo, { title: v }))}
        description={
          <CountedHint
            hint={kind === "archive" ? t("seo.archive.seoTitleHint") : t("seo.page.seoTitleHint")}
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
        onValueChange={(v) => onChange(patchSeo(seo, { description: v }))}
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
          onCheckedChange={(checked: boolean) => onChange(patchSeo(seo, { noindex: checked }))}
          data-testid="seo-noindex"
        />
        <Text variant="secondary" size="sm">
          {kind === "archive" ? t("seo.archive.noindexHint") : t("seo.page.noindexHint")}
        </Text>
      </div>
      {seo.noindex && (
        <Banner
          variant="alert"
          icon={<EyeSlash weight="fill" />}
          title={
            kind === "archive"
              ? t("seo.archive.noindexWarningTitle")
              : t("seo.page.noindexWarningTitle")
          }
          description={
            kind === "archive" ? t("seo.archive.noindexWarning") : t("seo.page.noindexWarning")
          }
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
              onValueChange={(v) => onChange(patchSeo(seo, { canonical: v }))}
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
            breadcrumb={searchBreadcrumb(host, path, canonical)}
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
    </>
  );
}

/** Page › Search engines and sharing (DESIGN.md §2o): `SeoFields` for the page's `seo`. */
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
  return (
    <SectionCard
      id="seo"
      title={t("seo.page.title")}
      icon={<MagnifyingGlass size={16} />}
      description={t("seo.page.description")}
    >
      <SeoFields
        seo={page.seo}
        onChange={(seo) => onChange(setOptional(page, "seo", seo))}
        fallbackTitle={page.title}
        path={page.path}
        siteName={siteName}
        host={host}
        errors={errors}
        showErrors={showErrors}
      />
    </SectionCard>
  );
}
