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
  // Previews go through @cloudhal/ui's PreviewPanel (sandboxed, scaled, reloadable).
  "iframe",
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
  "components/AppFrame.tsx": [
    "Sidebar",
    "CommandPalette",
    "DropdownMenu",
    "Sidebar.Loading",
    "Sidebar.Trigger",
    "Sidebar.Rail",
  ],
  "routes/SiteShell.tsx": ["SidebarSwitcher", "Sidebar.MenuBadge", "Sidebar.Collapsible"],
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
  "routes/SnapshotsPage.tsx": [
    "Toolbar",
    "SnapshotTimeline",
    "Pagination",
    "ApprovalDialog",
    "SnapshotDiffDialog",
  ],
  "routes/LoginPage.tsx": ["Surface", "Tabs", "Input", "Button"],
  "routes/AgentsPage.tsx": [
    "ResourceListPage",
    "ListToolbar",
    "Table",
    "Empty",
    "Pagination",
    "DeleteResource",
    "ClipboardText",
    "CodeHighlighted",
    "CreateAgentKeyDialog",
  ],
  "routes/ActivityPage.tsx": [
    "Toolbar",
    "Select",
    "Table",
    "Empty",
    "TableSkeleton",
    "RefreshButton",
    "ErrorBanner",
    "ActivityDetailDialog",
  ],
  "components/CreateAgentKeyDialog.tsx": [
    "LayerDialog",
    "LayerDialog.Actions.Primary",
    "Checkbox",
    "ClipboardText",
    "Banner",
    "CodeHighlighted",
    "Collapsible",
  ],
  // Agent modes (§2g, ADR-0015): mode-first create flow, change-mode dialog, badges, explainer.
  "components/CreateAgentKeyDialog.tsx#modes": [
    "ModePicker",
    "AutoModeConfirm",
    "BypassHint",
    "ModeBadge",
    "scopesForMode",
  ],
  "components/AgentModes.tsx": [
    "Radio",
    "Badge",
    "Tooltip",
    "Banner",
    "Checkbox",
    "LayerCard",
    "Table",
  ],
  "components/ChangeAgentModeDialog.tsx": [
    "LayerDialog",
    "LayerDialog.Actions.Primary",
    "ModePicker",
    "AutoModeConfirm",
    "BypassHint",
    "ModeBadge",
    "Banner",
    "useToast",
  ],
  "routes/AgentsPage.tsx#modes": ["KeyModeCell", "HowModesWorkCard", "ChangeAgentModeDialog"],
  // Time-boxed elevation (§2g, ADR-0016): row action, timer badge, summary banner, end now.
  "routes/AgentsPage.tsx#elevation": [
    "ElevateAgentKeyDialog",
    "ElevatedKeysBanner",
    "useEndElevation",
    "useElevationExpiry",
    "DropdownMenu.Item",
    "Tooltip",
  ],
  "components/ElevateAgentKeyDialog.tsx": [
    "LayerDialog",
    "LayerDialog.Actions.Primary",
    "ModePicker",
    "AutoModeConfirm",
    "ModeBadge",
    "Tabs",
    "Input",
    "Select",
    "Banner",
    "useToast",
    "modesAbove",
    "elevationSummary",
  ],
  "components/Elevation.tsx": ["ModeBadge", "Badge", "Tooltip", "Banner", "Banner.Action"],
  "components/ChangeAgentModeDialog.tsx#elevation": ["Banner", "activeElevation"],
  "components/AgentModes.tsx#elevation": ["ClockCountdown", "AuditElevation"],
  "components/Audit.tsx#elevation": ["elevation"],
  "components/ActivityDetailDialog.tsx#elevation": ["elevation"],
  "components/Audit.tsx#modes": ["ModeBadge", "AutoApprovedBadge"],
  "routes/ActivityPage.tsx#modes": ["DecisionCell", "ActorCell"],
  "components/ActivityDetailDialog.tsx#modes": ["ModeBadge", "DecisionCell"],
  "components/RecentActivity.tsx#modes": ["DecisionCell"],
  "routes/ApprovalsPage.tsx#modes": ["ModeBadge", "isManualModeRequest"],
  "components/ActivityDetailDialog.tsx": ["LayerDialog", "Banner", "CodeHighlighted"],
  "components/SnapshotDiffDialog.tsx": ["LayerDialog", "Tabs", "Badge", "Table", "Empty"],
  "components/EditorLayout.tsx": ["Grid", "Tabs", "Tooltip"],
  "components/EditorPreview.tsx": ["PreviewPanel"],
  // Settings template (§2c): sticky TableOfContents + one LayerCard per section.
  "components/Settings.tsx": ["Grid", "TableOfContents", "useTableOfContentsActiveId", "LayerCard"],
  "routes/AccountPage.tsx": [
    "PageHeader",
    "Breadcrumbs",
    "SettingsLayout",
    "SettingsSection",
    "PasswordField",
    "Checkbox",
    "Table",
    "TableSkeleton",
    "ConfirmDialog",
    "Banner",
    "SkeletonLine",
  ],
  "components/PasswordField.tsx": ["InputGroup", "InputGroup.Button"],
  "components/ConfirmDialog.tsx": ["LayerDialog.Alert", "LayerDialog.Actions.Primary"],
  "routes/SiteSettingsPage.tsx": [
    "SettingsLayout",
    "SettingsSection",
    "InputGroup",
    "Select",
    "Radio",
    "Table",
    "Empty",
    "DropdownMenu",
    "ClipboardText",
    "ConfirmDialog",
    "Surface",
  ],
  "routes/SkillsPage.tsx": [
    "ResourceListPage",
    "ListToolbar",
    "Table",
    "Empty",
    "Pagination",
    "InlineCopyText",
    "Collapsible",
    "CodeHighlighted",
    "SkillDetailDialog",
  ],
  "components/SkillDetailDialog.tsx": ["LayerDialog", "ClipboardText", "CodeHighlighted", "Badge"],
  // Approvals (§2m): pending requests as LayerCard rows, history Table, LayerDialog confirmation.
  "routes/ApprovalsPage.tsx": [
    "ActivityViews",
    "LayerCard",
    "Table",
    "Empty",
    "Collapsible",
    "CodeHighlighted",
    "RefreshButton",
    "ApproveRequestDialog",
    "ActorCell",
    "ToolCell",
  ],
  "components/ApproveRequestDialog.tsx": ["LayerDialog", "Banner", "Badge", "Surface"],
  "components/ActivityViews.tsx": ["Tabs", "Badge"],
  "components/PendingApprovalsBanner.tsx": ["Banner", "Banner.Action"],
  "routes/ActivityPage.tsx#approvals": ["ActivityViews"],
  "routes/SiteOverviewPage.tsx#approvals": ["PendingApprovalsBanner"],
  "routes/SiteShell.tsx#approvals": ["usePendingApprovals", "Sidebar.MenuBadge"],
  "routes/PageEditorPage.tsx#preview": ["EditorLayout", "EditorPreview", "PreviewToggle"],
  "routes/ArticleEditorPage.tsx#preview": ["EditorLayout", "EditorPreview", "PreviewToggle"],
  "routes/SiteOverviewPage.tsx#activity": ["RecentActivity"],
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
  "LayerDialog",
  "Checkbox",
  "Tooltip",
  "RefreshButton",
  "LinkButton",
  "CodeHighlighted",
  "PreviewPanel",
  "DecisionBadge",
  "ActorBadge",
  "OutcomeBadge",
  "TableOfContents",
  "InputGroup",
  "Radio",
  "Collapsible",
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
    (key, required) => {
      // `file#topic` lets one file carry several independent requirements.
      const file = key.split("#")[0] as string;
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

  it("every iframe is fully sandboxed (previews include drafts)", () => {
    const UI_BLOCKS = path.resolve(here, "../../../packages/ui/src/blocks");
    const sources = [
      ...files,
      ...walk(UI_BLOCKS).map((f) => ({ file: f, text: readFileSync(f, "utf8") })),
    ];
    const unsandboxed = sources.flatMap((f) =>
      [...f.text.matchAll(/<iframe\b[^>]*>/g)]
        .filter((m) => !/\bsandbox=""/.test(m[0]))
        .map(() => path.basename(f.file)),
    );
    expect(unsandboxed, 'use sandbox="" (no scripts, no same-origin)').toEqual([]);
  });

  it("LayerDialog.Content gets its parts directly (Kumo throws on fragments/conditionals)", () => {
    const offenders = uiFiles
      .filter((f) => /<LayerDialog\.Content[^>]*>\s*(?:\{|<>)/.test(f.text))
      .map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it("mode pickers are Kumo radio cards over the key modes only (bypass is local, ADR-0015)", () => {
    const modes = files.find((f) => f.file === "components/AgentModes.tsx") as { text: string };
    const picker = modes.text.slice(modes.text.indexOf("export function ModePicker"));
    expect(picker).toMatch(/<Radio\.Group[\s\S]*appearance="card"/);
    // modes come from `modeRules`, which only ever yields key modes (test/lib.test.ts)
    expect(picker).toMatch(/useAgentModeRules\(\)[\s\S]*modes\.map/);
    // Nothing in Studio may offer or send bypass for a key.
    const offenders = files
      .filter((f) => /value=["{]+["']?bypass|mode:\s*["']bypass/.test(f.text))
      .map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it("elevation offers only modes above the key's own and never sends bypass (ADR-0016)", () => {
    const dialog = files.find((f) => f.file === "components/ElevateAgentKeyDialog.tsx") as {
      text: string;
    };
    // The picker is narrowed to `modesAbove(own, rules.modes)`; the rules only yield key modes.
    expect(dialog.text).toMatch(/const targets = modesAbove\(own, rules\.modes\)/);
    expect(dialog.text).toMatch(/<ModePicker[\s\S]*?only=\{targets\}/);
    // The request carries the chosen card's mode, and only when it is one of those targets.
    expect(dialog.text).toMatch(/!targets\.includes\(mode\)/);
    expect(dialog.text).not.toMatch(/bypass/);
  });

  it("every screen that can elevate a key asks for consent before Auto", () => {
    const elevating = uiFiles.filter((f) => /api\.agentKeys\.elevate\b/.test(f.text));
    expect(elevating.map((f) => f.file)).toEqual(["components/ElevateAgentKeyDialog.tsx"]);
    for (const f of elevating) {
      expect(f.text, f.file).toMatch(/<AutoModeConfirm\b/);
      expect(f.text, f.file).toMatch(/needsConsent && !autoConfirmed\) return/);
    }
  });

  it("every screen that can pick Auto asks for consent first", () => {
    const pickers = uiFiles.filter(
      (f) => /<ModePicker\b/.test(f.text) && f.file !== "components/AgentModes.tsx",
    );
    expect(pickers.length).toBeGreaterThan(0);
    const missing = pickers.filter((f) => !/<AutoModeConfirm\b/.test(f.text)).map((f) => f.file);
    expect(missing).toEqual([]);
  });

  it("never injects HTML (approval prompts and skill text can carry agent-written titles)", () => {
    const offenders = files
      .filter((f) => /dangerouslySetInnerHTML|\.innerHTML\s*=/.test(f.text))
      .map((f) => f.file);
    expect(offenders).toEqual([]);
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
