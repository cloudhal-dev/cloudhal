import type { Asset } from "@cloudhal/core-contracts";
import { Badge, ImagePreview, MediaKindFrame, Tooltip } from "@cloudhal/ui";
import {
  Archive,
  File,
  FileAudio,
  FileCsv,
  FilePdf,
  FileVideo,
  Image as ImageIcon,
  Robot,
  TextAa,
} from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";
import { type AssetKind, assetPreviewUrl, needsAlt, typeLabel } from "../lib/media.ts";

/** The kind's icon (images, video, audio, PDF and documents, data). */
export function KindIcon({ kind, size = 24 }: { kind: AssetKind | undefined; size?: number }) {
  const Icon =
    kind === "image"
      ? ImageIcon
      : kind === "video"
        ? FileVideo
        : kind === "audio"
          ? FileAudio
          : kind === "document"
            ? FilePdf
            : kind === "data"
              ? FileCsv
              : File;
  return <Icon size={size} aria-hidden />;
}

/**
 * An asset's picture in a tile, a table row or a detail card: images load from Studio's private
 * content route (drafts included, `assetPreviewUrl`), other files show their kind and extension.
 */
export function AssetFrame({
  siteId,
  asset,
  size,
  alt,
}: {
  siteId: string;
  asset: Asset;
  size: "tile" | "thumb" | "card";
  alt?: string;
}) {
  const t = useT("media");
  const src = assetPreviewUrl(siteId, asset);
  if (asset.kind !== "image")
    return (
      <MediaKindFrame
        size={size}
        icon={
          <KindIcon kind={asset.kind} size={size === "thumb" ? 16 : size === "card" ? 40 : 28} />
        }
        label={typeLabel(asset.mediaType)}
      />
    );
  return (
    <ImagePreview
      size={size}
      fit={size === "card" ? "contain" : "cover"}
      src={src}
      alt={alt ?? ""}
      labels={{
        empty: t("media.preview.empty"),
        loading: t("media.preview.loading"),
        error: t("media.preview.broken"),
      }}
    />
  );
}

/** State badges of a file: retired, missing alt text, added by an agent. */
export function AssetBadges({
  asset,
  defaultLocale,
  compact = false,
}: {
  asset: Asset;
  defaultLocale: string;
  /** Tiles: icons with tooltips only where space is short. */
  compact?: boolean;
}) {
  const t = useT("media");
  const badges = [];
  if (asset.status === "retired")
    badges.push(
      <Tooltip key="retired" content={t("media.badges.retiredHint")}>
        <span className="inline-flex" data-badge="retired">
          <Badge variant="secondary" icon={<Archive />}>
            {t("media.badges.retired")}
          </Badge>
        </span>
      </Tooltip>,
    );
  if (needsAlt(asset, defaultLocale))
    badges.push(
      <Tooltip key="alt" content={t("media.badges.missingAltHint")}>
        <span className="inline-flex" data-badge="missing-alt">
          <Badge variant="warning" icon={<TextAa />}>
            {compact ? t("media.badges.missingAltShort") : t("media.badges.missingAlt")}
          </Badge>
        </span>
      </Tooltip>,
    );
  if (asset.uploadedBy.kind === "agent" && !compact)
    badges.push(
      <Tooltip
        key="agent"
        content={t("media.badges.agentHint", {
          name: asset.uploadedBy.name ?? asset.uploadedBy.id,
        })}
      >
        <span className="inline-flex" data-badge="agent">
          <Badge variant="outline" icon={<Robot />}>
            {t("media.badges.agent")}
          </Badge>
        </span>
      </Tooltip>,
    );
  return badges.length ? badges : null;
}

/** "Used in 3 places" / "Unused" as a small badge (`overlay`: solid, legible over a picture). */
export function UsageBadge({ count, overlay = false }: { count: number; overlay?: boolean }) {
  const t = useT("media");
  return (
    <span className="inline-flex" data-usage={count}>
      <Badge variant={overlay ? "secondary" : count > 0 ? "info" : "outline"}>
        {count === 0 ? t("media.usage.none") : t("media.usage.used", { count })}
      </Badge>
    </span>
  );
}
