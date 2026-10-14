/**
 * Markdown mode of `MarkdownEditor` (RFC-0014 phase 1): CodeMirror 6 (MIT) on the markdown text
 * itself, so nothing is ever normalized here. Loaded only when someone switches to Markdown mode.
 * Colours and type come from Kumo tokens; the surface matches the rich editor's.
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, LanguageSupport, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";

export interface SourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name (e.g. "Body"). */
  label: string;
  placeholder?: string;
  readOnly?: boolean;
  /** Minimum height in rows of text. */
  minRows: number;
  /** Selects this text once on mount (a source block opened from the rich editor). */
  selectOnMount?: string | undefined;
}

const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600", color: "var(--text-color-kumo-strong)" },
  { tag: tags.strong, fontWeight: "500", color: "var(--text-color-kumo-strong)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--text-color-kumo-link)" },
  { tag: [tags.monospace, tags.quote], color: "var(--text-color-kumo-subtle)" },
  {
    tag: [tags.processingInstruction, tags.contentSeparator, tags.labelName, tags.meta],
    color: "var(--text-color-kumo-subtle)",
  },
  {
    tag: [tags.angleBracket, tags.tagName, tags.attributeName],
    color: "var(--text-color-kumo-info)",
  },
]);

const theme = EditorView.theme({
  "&": {
    fontSize: "14px",
    color: "var(--text-color-kumo-default)",
    backgroundColor: "transparent",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    lineHeight: "1.6",
  },
  ".cm-content": { padding: "8px 12px", caretColor: "var(--text-color-kumo-default)" },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderLeftColor: "var(--text-color-kumo-default)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--color-kumo-tint)",
  },
  ".cm-placeholder": { color: "var(--text-color-kumo-placeholder)" },
});

export function SourceEditor({
  value,
  onChange,
  label,
  placeholder,
  readOnly = false,
  minRows,
  selectOnMount,
}: SourceEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the view is created once; value and readOnly sync below.
  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          // GFM markdown only: `markdown()` would also bundle the HTML, CSS and JS grammars for
          // highlighting inside HTML blocks and code fences.
          new LanguageSupport(markdownLanguage),
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          theme,
          EditorView.theme({
            "&": { minHeight: `calc(${minRows} * 1.6em + 16px)` },
            ".cm-content": { minHeight: `calc(${minRows} * 1.6em)` },
          }),
          ...(placeholder ? [placeholderExt(placeholder)] : []),
          editable.current.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          EditorView.contentAttributes.of({
            "aria-label": label,
            "aria-multiline": "true",
            role: "textbox",
            spellcheck: "true",
          }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    if (selectOnMount) {
      const from = value.indexOf(selectOnMount);
      if (from >= 0) {
        v.dispatch({
          selection: { anchor: from, head: from + selectOnMount.length },
          scrollIntoView: true,
        });
        v.focus();
      }
    }
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);

  // A value from outside (the rich editor, a reload) replaces the text.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current !== value) v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  return (
    <div
      ref={host}
      data-source-editor=""
      className="min-w-0 rounded-lg bg-kumo-control ring ring-kumo-line focus-within:ring-kumo-focus"
    />
  );
}
