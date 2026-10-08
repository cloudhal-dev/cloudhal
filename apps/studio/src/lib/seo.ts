import type { ContentEntry, Page } from "@cloudhal/core-contracts";

/**
 * Search and sharing helpers for the editors (DESIGN.md §2o). Hard limits mirror the contracts
 * (`page.schema.json#/$defs/Seo`, `common.schema.json#/$defs/ImageRef`); the recommended lengths
 * are where search engines usually cut a result.
 */
export const SEO_LIMITS = {
  /** `Seo.title` maxLength. */
  titleMax: 300,
  /** `Seo.description` maxLength. */
  descriptionMax: 500,
  /** `Seo.canonical` maxLength. */
  canonicalMax: 2048,
  /** `ImageRef.src` maxLength. */
  srcMax: 2048,
  /** `ImageRef.alt` maxLength. */
  altMax: 500,
  /** Titles longer than this are usually cut in a search result. */
  titleRecommended: 60,
  /** Descriptions longer than this are usually cut in a search result. */
  descriptionRecommended: 160,
  /** Shorter descriptions tend to be replaced by text the search engine picks. */
  descriptionMin: 50,
} as const;

export type Seo = NonNullable<Page["seo"]>;
export type ImageRef = NonNullable<ContentEntry["coverImage"]>;

// ---- image sources ----------------------------------------------------------------------------

export type ImageSrcError = "required" | "insecure" | "invalid" | "tooLong";

/**
 * Cover images are an https URL or a path on the site (`/images/cover.jpg`). The renderer's
 * `safeSrc` drops anything else (javascript:, protocol-relative `//host`, …); Studio is stricter
 * and also refuses plain http, which browsers block on https sites anyway.
 */
export function validateImageSrc(input: string): ImageSrcError | undefined {
  const src = input.trim();
  if (!src) return "required";
  if (src.length > SEO_LIMITS.srcMax) return "tooLong";
  if (/\s/.test(src) || src.includes("\\")) return "invalid";
  if (src.startsWith("/")) return src.startsWith("//") ? "invalid" : undefined;
  if (/^http:\/\//i.test(src)) return "insecure";
  if (!/^https:\/\//i.test(src)) return "invalid";
  try {
    const url = new URL(src);
    if (!url.hostname || url.username || url.password) return "invalid";
  } catch {
    return "invalid";
  }
  return undefined;
}

export interface ImageRefErrors {
  src?: ImageSrcError;
  alt?: "required" | "tooLong";
}

/** What is wrong with a cover image (an absent image is fine; a set one needs a source and alt text). */
export function validateImageRef(image: ImageRef | undefined): ImageRefErrors {
  if (!image) return {};
  const errors: ImageRefErrors = {};
  const src = validateImageSrc(image.src);
  if (src) errors.src = src;
  if (!image.alt.trim()) errors.alt = "required";
  else if (image.alt.length > SEO_LIMITS.altMax) errors.alt = "tooLong";
  return errors;
}

export const hasErrors = (errors: object) => Object.keys(errors).length > 0;

/**
 * Applies an edit of the cover image fields. Clearing both fields removes the image (the
 * contract has no empty `src`); a new source drops stale dimensions.
 */
export function editImageRef(
  current: ImageRef | undefined,
  patch: Partial<Pick<ImageRef, "src" | "alt">>,
): ImageRef | undefined {
  const next: ImageRef = { ...(current ?? { src: "", alt: "" }), ...patch };
  if (!next.src.trim() && !next.alt.trim()) return undefined;
  if (patch.src !== undefined && patch.src !== current?.src) {
    delete next.width;
    delete next.height;
  }
  return next;
}

/** Trims the stored values (the form keeps what was typed). */
export function cleanImageRef(image: ImageRef): ImageRef {
  return { ...image, src: image.src.trim(), alt: image.alt.trim() };
}

/**
 * Where Studio loads an image from for its own preview. Site paths live on the site, not on
 * Studio's origin: they resolve against the primary domain when there is one.
 */
export function previewImageUrl(src: string, host: string | undefined): string | undefined {
  const value = src.trim();
  if (validateImageSrc(value)) return undefined;
  if (value.startsWith("/")) return host ? `https://${host}${value}` : value;
  return value;
}

// ---- canonical URLs ---------------------------------------------------------------------------

export type CanonicalError = "invalid" | "tooLong";

/** A canonical URL is absolute (http or https, with a host); empty means "use the primary domain". */
export function validateCanonical(input: string): CanonicalError | undefined {
  const value = input.trim();
  if (!value) return undefined;
  if (value.length > SEO_LIMITS.canonicalMax) return "tooLong";
  if (/\s/.test(value) || !/^https?:\/\//i.test(value)) return "invalid";
  try {
    const url = new URL(value);
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return "invalid";
    if (url.username || url.password) return "invalid";
  } catch {
    return "invalid";
  }
  return undefined;
}

// ---- page SEO object --------------------------------------------------------------------------

/**
 * Returns the page with `seo` patched: empty strings and `noindex: false` are removed, and an
 * empty object is dropped, so an untouched page keeps no `seo` at all.
 */
export function applySeo(page: Page, patch: Partial<Seo>): Page {
  const seo: Seo = { ...(page.seo ?? {}), ...patch };
  for (const key of ["title", "description", "canonical"] as const) {
    if (key in patch && !seo[key]?.trim()) delete seo[key];
  }
  if (seo.noindex === false) delete seo.noindex;
  const next = { ...page };
  if (Object.keys(seo).length === 0) delete next.seo;
  else next.seo = seo;
  return next;
}

/** Trims the stored strings before saving. */
export function cleanSeo(page: Page): Page {
  if (!page.seo) return page;
  const seo: Seo = { ...page.seo };
  for (const key of ["title", "description", "canonical"] as const) {
    const value = seo[key]?.trim();
    if (value) seo[key] = value;
    else delete seo[key];
  }
  const next = { ...page };
  if (Object.keys(seo).length === 0) delete next.seo;
  else next.seo = seo;
  return next;
}

export interface SeoErrors {
  title?: "tooLong";
  description?: "tooLong";
  canonical?: CanonicalError;
}

export function validateSeo(seo: Seo | undefined): SeoErrors {
  const errors: SeoErrors = {};
  if (!seo) return errors;
  if ((seo.title?.length ?? 0) > SEO_LIMITS.titleMax) errors.title = "tooLong";
  if ((seo.description?.length ?? 0) > SEO_LIMITS.descriptionMax) errors.description = "tooLong";
  const canonical = validateCanonical(seo.canonical ?? "");
  if (canonical) errors.canonical = canonical;
  return errors;
}

// ---- search result preview --------------------------------------------------------------------

export type LengthStatus = "missing" | "short" | "good" | "long";

/** How a meta description will fare in a search result. */
export function descriptionStatus(text: string | undefined): LengthStatus {
  const length = text?.trim().length ?? 0;
  if (length === 0) return "missing";
  if (length < SEO_LIMITS.descriptionMin) return "short";
  if (length > SEO_LIMITS.descriptionRecommended) return "long";
  return "good";
}

export function titleStatus(text: string | undefined): LengthStatus {
  const length = text?.trim().length ?? 0;
  if (length === 0) return "missing";
  return length > SEO_LIMITS.titleRecommended ? "long" : "good";
}

/**
 * Cuts text the way a search result does: at a word boundary before `max` characters, with an
 * ellipsis, so the result is never longer than `max`.
 */
export function truncateForSearch(
  text: string,
  max: number = SEO_LIMITS.descriptionRecommended,
): { text: string; truncated: boolean } {
  const value = text.trim().replace(/\s+/g, " ");
  if (value.length <= max) return { text: value, truncated: false };
  const room = value.slice(0, max - 1);
  const space = room.lastIndexOf(" ");
  const cut = space >= max * 0.75 ? room.slice(0, space) : room;
  return { text: `${cut.replace(/[\s,.;:–—-]+$/, "")}…`, truncated: true };
}

/**
 * `example.com › posts › hello-world`, like the breadcrumb line of a search result. A valid
 * canonical URL wins, because that is the address search engines show.
 */
export function searchBreadcrumb(
  host: string | undefined,
  path: string,
  canonical?: string,
): string {
  let shownHost = host;
  let shownPath = path;
  if (canonical?.trim() && !validateCanonical(canonical)) {
    const url = new URL(canonical.trim());
    shownHost = url.host;
    shownPath = url.pathname;
  }
  const segments = shownPath
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  return [shownHost ?? "", ...segments].filter(Boolean).join(" › ");
}
