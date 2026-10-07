import { Button, Grid, Tabs, Tooltip } from "@cloudhal/ui";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useT } from "../i18n/index.tsx";

/** Tailwind's `xl`: from here the editor and its preview sit side by side (DESIGN.md §2f). */
export const SPLIT_QUERY = "(min-width: 1280px)";
const STORAGE_KEY = "cloudhal.studio.preview";

export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== "undefined" && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

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

/** Header action that shows/hides the preview column; only meaningful on wide screens. */
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
    <Tooltip
      content={label}
      render={
        <Button
          variant="ghost"
          shape="square"
          icon={visible ? <EyeSlash /> : <Eye />}
          aria-label={label}
          aria-pressed={visible}
          onClick={() => onChange(!visible)}
        />
      }
    />
  );
}

/**
 * Editor template with live preview (DESIGN.md §2f).
 * - ≥ xl, preview on: two columns — the form (main, then aside) left, a sticky preview right.
 * - ≥ xl, preview off: the classic `Grid 2-1` (main | aside).
 * - < xl: underline `Tabs` switch between the form (Grid 2-1, stacking on phones) and the preview.
 */
export function EditorLayout({
  main,
  aside,
  preview,
  previewVisible,
}: {
  main: ReactNode;
  aside: ReactNode;
  /** Render prop so the panel can size itself for the layout it lands in. */
  preview: (height: string) => ReactNode;
  previewVisible: boolean;
}) {
  const t = useT();
  const wide = useMediaQuery(SPLIT_QUERY);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const form = (
    <Grid variant="2-1" gap="base">
      <div className="grid min-w-0 content-start gap-4">{main}</div>
      <div className="grid min-w-0 content-start gap-4">{aside}</div>
    </Grid>
  );

  if (wide) {
    if (!previewVisible) return form;
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-6">
        <div className="grid min-w-0 content-start gap-4">
          {main}
          {aside}
        </div>
        <div className="sticky top-16 min-w-0" data-testid="preview-column">
          {preview("calc(100svh - 9rem)")}
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <Tabs
        variant="underline"
        value={view}
        onValueChange={(v) => setView(v as "edit" | "preview")}
        tabs={[
          { value: "edit", label: t("preview.edit") },
          { value: "preview", label: t("preview.title") },
        ]}
      />
      {view === "edit" ? form : preview("70svh")}
    </div>
  );
}
