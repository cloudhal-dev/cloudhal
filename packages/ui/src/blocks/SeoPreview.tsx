import { cn, Loader, Text } from "@cloudflare/kumo";
import { Globe, ImageBroken, Image as ImageIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

// ---- ImagePreview -------------------------------------------------------------------------------

export type ImagePreviewStatus = "empty" | "loading" | "loaded" | "error";

export interface ImagePreviewLabels {
  /** No source yet ("No cover image"). */
  empty: string;
  /** Accessible text while the image loads. */
  loading: string;
  /** The source did not load ("Couldn't load this image"). */
  error: string;
}

export interface ImagePreviewProps {
  /** URL the browser loads; `undefined` when there is nothing (valid) to show. */
  src: string | undefined;
  alt: string;
  /**
   * `card`: the 1.91:1 frame social networks crop to (Open Graph), labels shown in the frame.
   * `thumb`: a 16:9, 3.5 rem list thumbnail with icons only.
   * `tile`: a 4:3 frame filling its container, icons only (media library tiles, §2u).
   */
  size?: "card" | "thumb" | "tile";
  /** `cover` crops to the frame (default); `contain` shows the whole image (media previews). */
  fit?: "cover" | "contain";
  labels: ImagePreviewLabels;
  /** A muted line under the frame, e.g. the image's size (`card` only). */
  caption?: ReactNode;
  /** Replaces the caption while the image is broken, e.g. why a site path cannot load here. */
  errorHint?: ReactNode;
  /** Called once per source with the image's natural size. */
  onLoad?: (size: { width: number; height: number }) => void;
  onStatusChange?: (status: ImagePreviewStatus) => void;
  className?: string;
}

/**
 * An image in a fixed frame with its four states — nothing set, loading, loaded, broken — so a
 * URL field always shows what it points at (DESIGN.md §2o). The only place Studio renders an
 * `<img>`; screens pass the resolved URL and never draw images themselves.
 */
export function ImagePreview({
  src,
  alt,
  size = "card",
  fit = "cover",
  labels,
  caption,
  errorHint,
  onLoad,
  onStatusChange,
  className,
}: ImagePreviewProps) {
  const [state, setState] = useState<{ src: string | undefined; status: ImagePreviewStatus }>({
    src,
    status: src ? "loading" : "empty",
  });
  // A new source starts over (derived during render, no effect round-trip).
  const status: ImagePreviewStatus = state.src === src ? state.status : src ? "loading" : "empty";
  const settle = (next: ImagePreviewStatus) => setState({ src, status: next });
  // Report every state, including "loading"/"empty" after the source changed.
  const report = useRef(onStatusChange);
  report.current = onStatusChange;
  useEffect(() => {
    report.current?.(status);
  }, [status]);
  const thumb = size === "thumb";
  const tile = size === "tile";
  // Tiles and thumbnails show icons only; their name is next to them.
  const compact = thumb || tile;
  const iconSize = thumb ? 16 : tile ? 24 : 32;
  const note = status === "error" ? errorHint : caption;
  const frame = (
    <div
      data-image-status={status}
      className={cn(
        "relative min-w-0 overflow-hidden bg-kumo-recessed ring ring-kumo-hairline",
        thumb
          ? "aspect-video w-14 shrink-0 rounded-md"
          : tile
            ? "aspect-[4/3] w-full rounded-md"
            : "aspect-[1.91/1] w-full rounded-lg",
        className,
      )}
    >
      {src && status !== "error" && (
        <img
          key={src}
          src={src}
          alt={alt}
          loading={compact ? "lazy" : "eager"}
          decoding="async"
          referrerPolicy="no-referrer"
          className={cn(
            "size-full",
            fit === "contain" ? "object-contain" : "object-cover",
            status === "loading" && "invisible",
          )}
          onLoad={(e) => {
            const img = e.currentTarget;
            settle("loaded");
            if (img.naturalWidth && img.naturalHeight)
              onLoad?.({ width: img.naturalWidth, height: img.naturalHeight });
          }}
          onError={() => settle("error")}
        />
      )}
      {status !== "loaded" && (
        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center text-center text-kumo-subtle",
            compact ? "gap-0" : "gap-1.5 px-4",
          )}
          role={status === "loading" ? "status" : undefined}
          title={compact ? labelFor(status, labels) : undefined}
        >
          {status === "loading" ? (
            <Loader size={compact ? "sm" : "base"} />
          ) : status === "error" ? (
            <ImageBroken size={iconSize} aria-hidden />
          ) : (
            <ImageIcon size={iconSize} aria-hidden />
          )}
          {compact ? (
            <span className="sr-only">{labelFor(status, labels)}</span>
          ) : (
            <Text as="span" variant="secondary" size="sm">
              {labelFor(status, labels)}
            </Text>
          )}
        </div>
      )}
    </div>
  );
  if (compact || !note) return frame;
  return (
    <div className="grid min-w-0 gap-1.5">
      {frame}
      <Text as="span" variant="secondary" size="xs">
        {note}
      </Text>
    </div>
  );
}

function labelFor(status: ImagePreviewStatus, labels: ImagePreviewLabels): string {
  return status === "error" ? labels.error : status === "loading" ? labels.loading : labels.empty;
}

// ---- SearchResultPreview ------------------------------------------------------------------------

export interface SearchResultPreviewProps {
  /** The site's name, shown above the address like a search engine does. */
  siteName: string;
  /** `example.com › posts › hello` (`searchBreadcrumb` in Studio). */
  breadcrumb: string;
  title: string;
  /** Already cut to search length; `placeholder` renders it muted (nothing set). */
  description: string;
  placeholder?: boolean;
  /** A badge row under the result, e.g. "Hidden from search engines". */
  footer?: ReactNode;
  className?: string;
}

/**
 * A neutral sketch of a search engine result — site name, address, title in link colour,
 * description — built from Kumo tokens (no third-party branding). Read-only.
 */
export function SearchResultPreview({
  siteName,
  breadcrumb,
  title,
  description,
  placeholder = false,
  footer,
  className,
}: SearchResultPreviewProps) {
  return (
    <div className={cn("grid min-w-0 gap-1.5", className)} data-testid="search-result-preview">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-kumo-recessed text-kumo-subtle ring ring-kumo-hairline">
          <Globe size={16} aria-hidden />
        </span>
        <span className="grid min-w-0">
          <Text as="span" size="sm" truncate>
            {siteName}
          </Text>
          <Text as="span" variant="secondary" size="xs" truncate>
            {breadcrumb}
          </Text>
        </span>
      </div>
      <Text as="span" size="lg">
        <span className="line-clamp-2 break-words text-kumo-link">{title}</span>
      </Text>
      <Text as="span" variant="secondary" size="sm">
        <span
          className={cn("line-clamp-3 break-words", placeholder && "text-kumo-inactive italic")}
        >
          {description}
        </span>
      </Text>
      {footer && <div className="flex flex-wrap items-center gap-2 pt-1">{footer}</div>}
    </div>
  );
}

// ---- SocialCardPreview --------------------------------------------------------------------------

export interface SocialCardPreviewProps {
  host: string;
  title: string;
  description: string;
  placeholder?: boolean;
  /** The image frame — an `ImagePreview size="card"` (the card crops it to 1.91:1). */
  image: ReactNode;
  className?: string;
}

/** A neutral sketch of a link card on social networks and chat apps (Open Graph / Twitter). */
export function SocialCardPreview({
  host,
  title,
  description,
  placeholder = false,
  image,
  className,
}: SocialCardPreviewProps) {
  return (
    <div
      className={cn(
        "grid min-w-0 overflow-hidden rounded-lg bg-kumo-base ring ring-kumo-hairline",
        "[&_[data-image-status]]:rounded-none [&_[data-image-status]]:ring-0",
        className,
      )}
      data-testid="social-card-preview"
    >
      {image}
      <div className="grid min-w-0 gap-1 border-kumo-hairline border-t px-4 py-3">
        <Text as="span" variant="secondary" size="xs" truncate>
          {host}
        </Text>
        <Text as="span" bold>
          <span className="line-clamp-2 break-words">{title}</span>
        </Text>
        <Text as="span" variant="secondary" size="sm">
          <span
            className={cn("line-clamp-2 break-words", placeholder && "text-kumo-inactive italic")}
          >
            {description}
          </span>
        </Text>
      </div>
    </div>
  );
}
