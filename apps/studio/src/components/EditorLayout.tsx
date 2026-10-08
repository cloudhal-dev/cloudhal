import { Button, Columns, cn, SectionCard, Tabs, Text, Tooltip } from "@cloudhal/ui";
import { Eye, EyeSlash, Trash } from "@phosphor-icons/react";
import { type ReactNode, useCallback, useState } from "react";
import { useT } from "../i18n/index.tsx";

const STORAGE_KEY = "cloudhal.studio.preview";

/** Whether the side-by-side preview is shown on wide screens (remembered per browser). */
export function usePreviewVisible(): [boolean, (visible: boolean) => void] {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "hidden";
    } catch {
      return true;
    }
  });
  const set = useCallback((next: boolean) => {
    setVisible(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "shown" : "hidden");
    } catch {}
  }, []);
  return [visible, set];
}

/**
 * Header action that shows/hides the preview column. Only rendered where the split exists
 * (content ≥ 64rem, the same container query as `EditorLayout`); narrower editors use the tabs.
 */
export function PreviewToggle({
  visible,
  onChange,
}: {
  visible: boolean;
  onChange: (visible: boolean) => void;
}) {
  const t = useT();
  const label = visible ? t("preview.hide") : t("preview.show");
  return (
    <span className="hidden @5xl/page:inline-flex">
      <Tooltip
        content={t("preview.toggleHint")}
        render={
          <Button
            variant="secondary"
            icon={visible ? <EyeSlash /> : <Eye />}
            aria-pressed={visible}
            onClick={() => onChange(!visible)}
          >
            {label}
          </Button>
        }
      />
    </span>
  );
}

/**
 * Editor template with live preview (DESIGN.md §2f). Widths are container queries on
 * `PageLayout`'s `@container/page`, so the sidebar being open or collapsed is accounted for.
 * - content ≥ 64rem, preview on: two equal columns — the form (main, then aside) left, the
 *   preview right, sticky under the top bar and as tall as the viewport allows.
 * - content ≥ 64rem, preview off: `Columns 2-1` (main | aside).
 * - narrower: underline `Tabs` "Edit | Preview"; Edit is `Columns 2-1` (stacked on phones).
 */
export function EditorLayout({
  main,
  aside,
  preview,
  previewVisible,
}: {
  main: ReactNode;
  aside: ReactNode;
  /** The `EditorPreview`; it fills the column's height. Absent: a node without a page of its own to preview (a term). */
  preview?: ReactNode;
  previewVisible?: boolean;
}) {
  const t = useT();
  const [view, setView] = useState<"edit" | "preview">("edit");
  if (preview === undefined)
    return (
      <Columns variant="2-1">
        <div className="grid min-w-0 content-start gap-6">{main}</div>
        <div className="grid min-w-0 content-start gap-6">{aside}</div>
      </Columns>
    );
  return (
    <div className="grid min-w-0 gap-6">
      <Tabs
        variant="underline"
        className="@5xl/page:hidden"
        value={view}
        onValueChange={(v) => setView(v as "edit" | "preview")}
        tabs={[
          { value: "edit", label: t("preview.edit") },
          { value: "preview", label: t("preview.title") },
        ]}
      />
      <div
        className={cn(
          "grid min-w-0 grid-cols-1 items-start gap-6",
          previewVisible && "@5xl/page:grid-cols-2",
        )}
      >
        <div className={cn("min-w-0", view === "preview" && "hidden @5xl/page:block")}>
          <Columns variant="2-1" className={cn(previewVisible && "@5xl/page:grid-cols-1")}>
            <div className="grid min-w-0 content-start gap-6">{main}</div>
            <div className="grid min-w-0 content-start gap-6">{aside}</div>
          </Columns>
        </div>
        <div
          data-testid="preview-column"
          className={cn(
            "h-[70svh] min-w-0",
            view === "edit" && "hidden",
            previewVisible
              ? "@5xl/page:sticky @5xl/page:top-16 @5xl/page:block @5xl/page:h-[calc(100svh-6rem)]"
              : "@5xl/page:hidden",
          )}
        >
          {preview}
        </div>
      </div>
    </div>
  );
}

export interface DetailRow {
  label: string;
  value: ReactNode;
}

/** The editor's read-only facts (DESIGN.md §2b "details card"): label/value rows in a `dl`. */
export function DetailsCard({ rows }: { rows: DetailRow[] }) {
  const t = useT();
  return (
    <SectionCard title={t("editor.metadata")}>
      <dl className="grid divide-y divide-kumo-hairline">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex min-w-0 items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
          >
            <Text as="dt" variant="secondary">
              {r.label}
            </Text>
            <dd className="flex min-w-0 items-center justify-end">{r.value}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

/** The editor's danger zone (DESIGN.md §2b, §2d): one destructive action that opens `DeleteResource`. */
export function DangerZoneCard({
  title,
  description,
  actionLabel,
  onAction,
  disabledReason,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  /** The person's role cannot do this here: the action stays, disabled, with the reason (§2s). */
  disabledReason?: string | undefined;
}) {
  const t = useT();
  return (
    <SectionCard title={t("editor.dangerZone")}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="grid min-w-0 flex-[1_1_14rem] gap-1.5">
          <Text bold as="span">
            {title}
          </Text>
          <Text variant="secondary" size="sm" as="span">
            {description}
          </Text>
        </div>
        <Button
          variant="secondary-destructive"
          icon={<Trash />}
          onClick={onAction}
          disabled={disabledReason !== undefined}
          title={disabledReason}
        >
          {actionLabel}
        </Button>
      </div>
    </SectionCard>
  );
}
