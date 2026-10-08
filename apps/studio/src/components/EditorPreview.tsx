import { Badge, PreviewPanel, Tooltip } from "@cloudhal/ui";
import { useT } from "../i18n/index.tsx";

/**
 * Localised `PreviewPanel` for an editor; fills the editor's preview column and reloads whenever
 * the saved `rev` changes.
 */
export function EditorPreview({
  src,
  rev,
  name,
  dirty,
}: {
  src: string;
  rev: number;
  name: string;
  /** The form has changes the preview can't show yet. */
  dirty: boolean;
}) {
  const t = useT();
  return (
    <PreviewPanel
      src={src}
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
        openInNewTab: t("preview.openInNewTab"),
        loading: t("preview.loading"),
      }}
      status={
        dirty ? (
          <Tooltip content={t("preview.unsavedHint")}>
            <Badge variant="warning" appearance="dot">
              {t("preview.unsaved")}
            </Badge>
          </Tooltip>
        ) : undefined
      }
    />
  );
}
