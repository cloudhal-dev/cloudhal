/**
 * Design-system enforcement (docs/design/DESIGN.md). Fails the build when Studio code bypasses
 * Kumo or breaks the kumo-design rules. Keep this list in sync with DESIGN.md.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
  });
}
const files = walk(SRC).map((f) => ({
  file: path.relative(SRC, f),
  text: readFileSync(f, "utf8"),
}));
const uiFiles = files.filter(
  (f) => f.file.startsWith("routes/") || f.file.startsWith("components/"),
);

/** Raw elements that always have a Kumo equivalent. `<dl>/<dt>/<dd>`, `<div>`, `<span>`, `<form>`, `<main>` stay allowed as layout glue. */
const FORBIDDEN_ELEMENTS = [
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "h1",
  "h2",
  "h3",
  "h4",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "a",
  "nav",
  "aside",
  "ul",
  "ol",
  "li",
  "p",
];
const FORBIDDEN_CLASSES: Array<[RegExp, string]> = [
  [/\bfont-bold\b/, "use font-semibold or <Text bold>"],
  [/\btracking-/, "never change tracking"],
  [/\btransition-colors\b|\bduration-\d+/, "no colour transitions"],
  [/\bdark:/, "Kumo handles dark mode via light-dark()"],
  [
    /\b(?:bg|text|border|ring)-(?:red|blue|green|zinc|gray|slate|neutral|orange|amber|yellow|emerald|indigo|violet|purple|pink|rose|white|black)(?:-\d+)?\b/,
    "semantic kumo tokens only",
  ],
  [/\bshadow-(?:sm|md|lg|xl)\b/, "no drop shadows on bordered surfaces"],
];

/** Every screen must be composed from these; the matrix in DESIGN.md maps the rest. */
const REQUIRED_IMPORTS: Record<string, string[]> = {
  "components/AppFrame.tsx": ["Sidebar", "CommandPalette", "DropdownMenu"],
  "routes/SiteShell.tsx": ["Sidebar", "DropdownMenu"],
  "routes/SiteTabsLayout.tsx": ["PageHeader", "Breadcrumbs", "ButtonGroup", "ApprovalDialog"],
  "routes/SitesPage.tsx": ["ResourceListPage", "Table", "Empty", "Surface", "Code", "Pagination"],
  "routes/SiteOverviewPage.tsx": ["Grid", "LayerCard", "Table", "Empty", "ClipboardText"],
  "routes/PagesPage.tsx": [
    "ListToolbar",
    "Table",
    "Empty",
    "Pagination",
    "DeleteResource",
    "RowMenu",
  ],
  "routes/ArticlesPage.tsx": [
    "ListToolbar",
    "Table",
    "Empty",
    "Pagination",
    "DeleteResource",
    "RowMenu",
  ],
  "routes/ArticleEditorPage.tsx": [
    "PageHeader",
    "LayerCard",
    "Input",
    "InputArea",
    "TagInput",
    "ApprovalDialog",
    "DeleteResource",
    "SkeletonLine",
  ],
  "routes/PageEditorPage.tsx": [
    "PageHeader",
    "LayerCard",
    "Empty",
    "DropdownMenu",
    "ApprovalDialog",
    "DeleteResource",
    "SkeletonLine",
  ],
  "routes/SnapshotsPage.tsx": ["Toolbar", "SnapshotTimeline", "Pagination", "ApprovalDialog"],
  "routes/LoginPage.tsx": ["Surface", "Tabs", "Input", "Button"],
};

/** DESIGN.md §6: components that must be in use somewhere in Studio today (the rest are reserved for later surfaces). */
const REQUIRED_SOMEWHERE = [
  "Sidebar",
  "Breadcrumbs",
  "PageHeader",
  "ResourceListPage",
  "Table",
  "LayerCard",
  "Empty",
  "Banner",
  "Toasty",
  "CommandPalette",
  "DropdownMenu",
  "DeleteResource",
  "Tabs",
  "Toolbar",
  "Pagination",
  "SkeletonLine",
  "Text",
  "Badge",
  "Input",
  "InputArea",
  "Select",
  "TagInput",
  "Button",
  "ButtonGroup",
  "TooltipProvider",
  "Surface",
  "Code",
  "ClipboardText",
  "InlineCopyText",
  "Grid",
  "Link",
];

describe("design rules (DESIGN.md)", () => {
  it.each(uiFiles.map((f) => f.file))("%s uses Kumo instead of raw elements", (file) => {
    const text = (uiFiles.find((f) => f.file === file) as { text: string }).text;
    const offenders = FORBIDDEN_ELEMENTS.filter((el) => new RegExp(`<${el}(?=[\\s>/])`).test(text));
    expect(offenders, `raw <${offenders.join(">, <")}> in ${file}; use the Kumo component`).toEqual(
      [],
    );
  });

  it.each(uiFiles.map((f) => f.file))("%s follows kumo-design class rules", (file) => {
    const text = (uiFiles.find((f) => f.file === file) as { text: string }).text;
    const broken = FORBIDDEN_CLASSES.filter(([re]) => re.test(text)).map(
      ([re, why]) => `${re} (${why})`,
    );
    expect(broken, file).toEqual([]);
  });

  it.each(Object.entries(REQUIRED_IMPORTS))(
    "%s is composed from the required Kumo blocks",
    (file, required) => {
      const text = (files.find((f) => f.file === file) as { text: string }).text;
      const missing = required.filter((name) => !new RegExp(`\\b${name}\\b`).test(text));
      expect(missing, `${file} must use ${missing.join(", ")}`).toEqual([]);
    },
  );

  it("uses every Kumo component the design system requires today", () => {
    const all = files.map((f) => f.text).join("\n");
    const missing = REQUIRED_SOMEWHERE.filter((name) => !new RegExp(`\\b${name}\\b`).test(all));
    expect(missing).toEqual([]);
  });

  it("every user-facing string goes through useT()", () => {
    // Heuristic: JSX text nodes with letters outside of {...} expressions.
    const offenders = uiFiles.flatMap((f) =>
      [...f.text.matchAll(/>\s*([A-Za-z][A-Za-z ,.'!?-]{2,})\s*</g)]
        .map((m) => `${f.file}: "${m[1]}"`)
        .filter((s) => !/ID"$/.test(s)),
    );
    expect(offenders).toEqual([]);
  });
});
