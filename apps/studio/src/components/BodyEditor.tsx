import { Button, InputArea, Text } from "@cloudhal/ui";
import type {
  AiSelection,
  EditorBlocks,
  MarkdownEditorLabels,
  PickedImage,
} from "@cloudhal/ui/editor";
import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useI18n, useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { previewImageUrl } from "../lib/seo.ts";
import { AiCommandDialog } from "./AiCommandDialog.tsx";
import { useBlockEnumLabel, useBlockTypes } from "./BlockSection.tsx";
import { AssetPickerDialog } from "./MediaPicker.tsx";
import { useGate } from "./useMe.ts";

/** What the media picker hands back: an image, or nothing when it was closed. */
type Picked = PickedImage | undefined;

// Tiptap and ProseMirror reach only people who open an editor: `@cloudhal/ui/editor` loads with
// the first body on screen (RFC-0014 phase 1). Until then the plain Markdown field stands in.
const MarkdownEditor = lazy(() =>
  import("@cloudhal/ui/editor").then((m) => ({ default: m.MarkdownEditor })),
);

/** What focus mode's Save does: whether there is something to save, and how. */
export interface FocusSave {
  dirty: boolean;
  saving: boolean;
  disabled: boolean;
  onSave: () => void;
}

/**
 * The page editor's save for body editors deep in its sections (focus mode keeps it at hand);
 * an editor's own `focusSave` wins.
 */
export const FocusSaveContext = createContext<FocusSave | undefined>(undefined);

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
  nodeId,
  pageLocale,
  value,
  onChange,
  size = "base",
  readOnly = false,
  focusSave: ownSave,
}: {
  siteId: string;
  /** The page or article (in-editor AI, RFC-0016): without it, no "Ask AI". */
  nodeId?: string;
  /** Its language (what "Translate" offers first). */
  pageLocale?: string;
  /** The site's default language (the picker's alt-text checks). */
  defaultLocale: string;
  host: string | undefined;
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "base";
  readOnly?: boolean;
  /** Focus mode keeps the page's save at hand: whether there is something to save, and how. */
  focusSave?: FocusSave;
}) {
  const t = useT("bodyEditor");
  const pageSave = useContext(FocusSaveContext);
  const focusSave = ownSave ?? pageSave;
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
      askAi: t("bodyEditor.ai.ask"),
      surfacePreview: t("bodyEditor.surfacePreview"),
      showCode: t("bodyEditor.showCode"),
      hideCode: t("bodyEditor.hideCode"),
      focus: t("bodyEditor.focus"),
      focusExit: t("bodyEditor.focusExit"),
      spotlight: t("bodyEditor.spotlight"),
      focusShortcut: t("bodyEditor.focusShortcut", {
        keys: /Mac|iP(hone|ad)/.test(globalThis.navigator?.platform ?? "")
          ? "⌘⇧\\"
          : "Ctrl+Shift+\\",
      }),
    }),
    [t],
  );
  // Typed blocks (RFC-0015): the body types in the `/` menu, edited through their forms.
  const blockTypes = useBlockTypes(siteId);
  const enumLabel = useBlockEnumLabel();
  const blocks = useMemo<EditorBlocks>(
    () => ({
      types: blockTypes.filter((b) => b.where.includes("body")),
      enumLabel,
      labels: {
        properties: t("bodyEditor.blocks.properties"),
        invalid: t("bodyEditor.blocks.invalid"),
        unknown: t("editor.blocks.unknown", { type: "{type}" }),
        unknownHint: t("editor.blocks.unknownHint"),
        editSource: t("bodyEditor.editSource"),
        item: t("editor.blocks.item"),
        addItem: t("editor.blocks.addItem"),
        removeItem: t("editor.blocks.removeItem"),
        moveUp: t("editor.blocks.moveUp"),
        moveDown: t("editor.blocks.moveDown"),
      },
    }),
    [blockTypes, enumLabel, t],
  );
  const ai = useAiAvailable(siteId, nodeId !== undefined && !readOnly);
  const [asking, setAsking] = useState<AiSelection | undefined>();
  const resolveSrc = useCallback((src: string) => bodyImageSrc(siteId, host, src), [siteId, host]);
  // ```surface blocks drawn as the preview draws them, once per text.
  const drawn = useRef(new Map<string, Promise<string | undefined>>());
  const previewSource = useCallback(
    (markdown: string) => {
      let html = drawn.current.get(markdown);
      if (!html) {
        html = api.entries.previewFragment(siteId, markdown).then(
          (r) => r.html,
          () => undefined,
        );
        drawn.current.set(markdown, html);
      }
      return html;
    },
    [siteId],
  );
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
          blocks={blocks}
          previewSource={previewSource}
          {...(focusSave
            ? {
                focusActions: (
                  <>
                    <Text variant="secondary" size="sm">
                      {focusSave.dirty ? t("bodyEditor.focusUnsaved") : t("bodyEditor.focusSaved")}
                    </Text>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={focusSave.saving}
                      disabled={!focusSave.dirty || focusSave.disabled}
                      onClick={focusSave.onSave}
                      data-testid="focus-save"
                    >
                      {t("common.save")}
                    </Button>
                  </>
                ),
              }
            : {})}
          {...(readOnly ? {} : { onPickImage: pickImage })}
          {...(ai ? { onAskAi: setAsking } : {})}
        />
      </Suspense>
      {/* Closed until "Ask AI" hands it a selection (only offered with a node and AI on). */}
      <AiCommandDialog
        siteId={siteId}
        nodeId={nodeId ?? ""}
        pageLocale={pageLocale ?? defaultLocale}
        selection={ai ? asking : undefined}
        onClose={() => setAsking(undefined)}
      />
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

/**
 * Whether "Ask AI" is offered (RFC-0016): the person may (`ai.invoke`), the site turned AI on, and
 * the server reaches Workers AI. Shares the settings query with Settings › AI.
 */
function useAiAvailable(siteId: string, wanted: boolean): boolean {
  const gate = useGate("ai.invoke");
  const settings = useQuery({
    queryKey: ["ai", siteId, "settings"],
    queryFn: () => api.ai.settings(siteId),
    enabled: wanted && gate.allowed,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return (
    wanted &&
    gate.allowed &&
    settings.data?.settings.enabled === true &&
    settings.data.transport !== "none"
  );
}
