import { InputArea } from "@cloudhal/ui";
import type { MarkdownEditorLabels } from "@cloudhal/ui/editor";
import { lazy, Suspense, useCallback, useMemo } from "react";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { previewImageUrl } from "../lib/seo.ts";

// Tiptap and ProseMirror reach only people who open an editor: `@cloudhal/ui/editor` loads with
// the first body on screen (RFC-0014 phase 1). Until then the plain Markdown field stands in.
const MarkdownEditor = lazy(() =>
  import("@cloudhal/ui/editor").then((m) => ({ default: m.MarkdownEditor })),
);

/** `asset:<id>` → the private content route (drafts too); other addresses as the SEO preview does. */
export function bodyImageSrc(
  siteId: string,
  host: string | undefined,
  src: string,
): string | undefined {
  const value = src.trim();
  // The renderer's rule (`ASSET_HREF` in core-ts, RFC-0004 §7.6): anything else under the scheme
  // shows nothing, as on the site.
  if (/^asset:/i.test(value)) {
    const id = /^asset:(asset_[A-Za-z0-9]{6,32})$/.exec(value)?.[1];
    return id ? api.assets.contentUrl(siteId, id) : undefined;
  }
  return previewImageUrl(value, host);
}

/**
 * A markdown body: the rich editor from `@cloudhal/ui/editor` with its Markdown mode (DESIGN.md
 * §2y). Markdown stays the stored format; untouched blocks keep their bytes.
 */
export function BodyEditor({
  siteId,
  host,
  value,
  onChange,
  size = "base",
  readOnly = false,
}: {
  siteId: string;
  host: string | undefined;
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "base";
  readOnly?: boolean;
}) {
  const t = useT("bodyEditor");
  const labels = useMemo<MarkdownEditorLabels>(
    () => ({
      rich: t("bodyEditor.rich"),
      markdown: t("bodyEditor.markdown"),
      toolbar: t("bodyEditor.toolbar"),
      bold: t("bodyEditor.bold"),
      italic: t("bodyEditor.italic"),
      strike: t("bodyEditor.strike"),
      code: t("bodyEditor.code"),
      heading2: t("bodyEditor.heading2"),
      heading3: t("bodyEditor.heading3"),
      bulletList: t("bodyEditor.bulletList"),
      orderedList: t("bodyEditor.orderedList"),
      taskList: t("bodyEditor.taskList"),
      quote: t("bodyEditor.quote"),
      codeBlock: t("bodyEditor.codeBlock"),
      table: t("bodyEditor.table"),
      rule: t("bodyEditor.rule"),
      link: t("bodyEditor.link"),
      undo: t("bodyEditor.undo"),
      redo: t("bodyEditor.redo"),
      linkTitle: t("bodyEditor.linkTitle"),
      linkUrl: t("bodyEditor.linkUrl"),
      linkApply: t("bodyEditor.linkApply"),
      linkRemove: t("bodyEditor.linkRemove"),
      linkInvalid: t("bodyEditor.linkInvalid"),
      sourceBadge: t("bodyEditor.sourceBadge"),
      sourceHint: t("bodyEditor.sourceHint"),
    }),
    [t],
  );
  const resolveSrc = useCallback((src: string) => bodyImageSrc(siteId, host, src), [siteId, host]);
  const fallback = (
    <InputArea
      aria-label={t("editor.body")}
      value={value}
      onValueChange={onChange}
      autoResize
      minRows={size === "sm" ? 6 : 12}
      maxRows={32}
      readOnly={readOnly}
      className="w-full font-mono"
    />
  );
  return (
    <Suspense fallback={fallback}>
      <MarkdownEditor
        value={value}
        onChange={onChange}
        label={t("editor.body")}
        labels={labels}
        placeholder={t("bodyEditor.placeholder")}
        resolveSrc={resolveSrc}
        size={size}
        readOnly={readOnly}
      />
    </Suspense>
  );
}
