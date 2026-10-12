import { Badge, PreviewPanel, Tooltip } from "@cloudhal/ui";
import type { ReactNode } from "react";
import { useT } from "../i18n/index.tsx";

/**
 * Localised `PreviewPanel` for an editor; fills the editor's preview column and reloads whenever
 * the saved `rev` changes. With `srcDoc` (the term editor) it shows the server's rendering of the
 * unsaved draft instead, so there is nothing "unsaved" to warn about.
 */
export function EditorPreview({
  src,
  rev,
  name,
  dirty,
  draft,
  srcDoc,
  stale,
  status,
}: {
  src: string;
  rev: number;
  name: string;
  /** The form has changes the preview can't show yet. */
  dirty: boolean;
  /** Show `srcDoc`, the server's rendering of the unsaved form, instead of the saved `src`. */
  draft?: boolean;
  /** That rendering (`undefined` while the first one loads). */
  srcDoc?: string | undefined;
  /** A newer draft document is on its way. */
  stale?: boolean;
  /** Replaces the "Unsaved changes" badge (e.g. the archive's indexing state). */
  status?: ReactNode;
}) {
  const t = useT();
  const live = srcDoc !== undefined || draft === true;
  return (
    <PreviewPanel
      src={src}
      {...(live ? { live: true, srcDoc, stale: stale === true } : {})}
      version={rev}
      fill
      labels={{
        title: t("preview.title"),
        frameTitle: t("preview.frameTitle", { name }),
        device: t("preview.device"),
        desktop: t("preview.desktop"),
        tablet: t("preview.tablet"),
        mobile: t("preview.mobile"),
        reload: t("preview.reload"),
        openInNewTab: live ? t("preview.openSaved") : t("preview.openInNewTab"),
        loading: t("preview.loading"),
      }}
      status={
        status ??
        (dirty ? (
          <Tooltip content={t("preview.unsavedHint")}>
            <Badge variant="warning" appearance="dot">
              {t("preview.unsaved")}
            </Badge>
          </Tooltip>
        ) : undefined)
      }
    />
  );
}
