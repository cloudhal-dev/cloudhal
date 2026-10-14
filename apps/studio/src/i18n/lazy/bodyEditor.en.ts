/**
 * English `bodyEditor.*`, a lazy message namespace (`../namespaces.ts`, DESIGN.md §1 "Lazy message
 * namespaces"): the rich body editor's words (`components/BodyEditor.tsx`), loaded with the article
 * and page editors. The source of truth for its keys; `bodyEditor.tr.ts` is typed against it.
 */
export const messages = {
  bodyEditor: {
    rich: "Rich text",
    markdown: "Markdown",
    toolbar: "Formatting",
    bold: "Bold",
    italic: "Italic",
    strike: "Strikethrough",
    code: "Inline code",
    heading2: "Heading",
    heading3: "Subheading",
    bulletList: "Bulleted list",
    orderedList: "Numbered list",
    taskList: "Checklist",
    quote: "Quote",
    codeBlock: "Code block",
    table: "Insert table",
    rule: "Divider",
    link: "Link",
    undo: "Undo",
    redo: "Redo",
    linkTitle: "Link",
    linkUrl: "Address",
    linkApply: "Apply",
    linkRemove: "Remove link",
    linkInvalid: "Use an https, mailto, tel, asset or site address.",
    sourceBadge: "Markdown",
    sourceHint: "Kept exactly as written. Edit it in Markdown mode.",
    placeholder: "Write here, or switch to Markdown…",
  },
} as const;
