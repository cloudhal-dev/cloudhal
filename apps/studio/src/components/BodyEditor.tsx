import { InputArea } from "@cloudhal/ui";
import type { MarkdownEditorLabels, PickedImage } from "@cloudhal/ui/editor";
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import { useI18n, useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { previewImageUrl } from "../lib/seo.ts";
import { AssetPickerDialog } from "./MediaPicker.tsx";

/** What the media picker hands back: an image, or nothing when it was closed. */
type Picked = PickedImage | undefined;

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
 * §2y). Markdown stays the stored format; untouched blocks keep their bytes. Images come from the
 * media picker and are stored as `asset:<id>` with an empty alt, so the site uses the library's.
 */
export function BodyEditor({
  siteId,
  defaultLocale,
  host,
  value,
  onChange,
  size = "base",
  readOnly = false,
}: {
  siteId: string;
  /** The site's default language (the picker's alt-text checks). */
  defaultLocale: string;
  host: string | undefined;
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "base";
  readOnly?: boolean;
}) {
  const t = useT("bodyEditor");
  const { locale } = useI18n();
  // The picker answers the editor's promise: an image, or nothing when it closes.
  const [picking, setPicking] = useState(false);
  const pending = useRef<((image: Picked) => void) | null>(null);
  const finish = (image: Picked) => {
    pending.current?.(image);
    pending.current = null;
    setPicking(false);
  };
  const pickImage = useCallback(
    (): Promise<Picked> =>
      new Promise((resolve) => {
        pending.current?.(undefined);
        pending.current = resolve;
        setPicking(true);
      }),
    [],
  );
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
      image: t("bodyEditor.image"),
      paragraph: t("bodyEditor.paragraph"),
      insertMenu: t("bodyEditor.insertMenu"),
      noMatches: t("bodyEditor.noMatches"),
      selectionToolbar: t("bodyEditor.selectionToolbar"),
      sourceBadge: t("bodyEditor.sourceBadge"),
      sourceHint: t("bodyEditor.sourceHint"),
      editSource: t("bodyEditor.editSource"),
      outline: t("bodyEditor.outline"),
      outlineEmpty: t("bodyEditor.outlineEmpty"),
      outlineSkipped: t("bodyEditor.outlineSkipped"),
      outlineExtraH1: t("bodyEditor.outlineExtraH1"),
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
    <>
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
          locale={locale}
          {...(readOnly ? {} : { onPickImage: pickImage })}
        />
      </Suspense>
      <AssetPickerDialog
        siteId={siteId}
        defaultLocale={defaultLocale}
        open={picking}
        onOpenChange={(open) => {
          if (!open) finish(undefined);
        }}
        onPick={(item) => finish({ src: `asset:${item.asset.id}` })}
      />
    </>
  );
}
