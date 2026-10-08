/**
 * Design-system enforcement (docs/design/DESIGN.md). Per-file rules live in
 * `scripts/design-lint.ts` (shared with `pnpm design:lint` and the agent hook); this file runs
 * them over every screen and adds the cross-file checks. Keep both in sync with DESIGN.md.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { allFiles, format, lintFile, ROUTE_TEMPLATES, STUDIO_SRC } from "../scripts/design-lint.ts";

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
  "components/SitePublish.tsx": ["ButtonGroup", "DropdownMenu", "ApprovalDialog"],
  "routes/SiteShell.tsx#publish": ["SitePublish"],
  "components/Crumbs.tsx": ["Breadcrumbs", "Breadcrumbs.Current", "Breadcrumbs.Clipboard"],
  "routes/SitesPage.tsx": ["PageLayout", "Table", "Empty", "SectionCard", "Code", "Pagination"],
  "routes/SiteOverviewPage.tsx": [
    "Columns",
    "SectionCard",
    "Table",
    "SectionEmpty",
    "InlineCopyText",
  ],
  "routes/PagesPage.tsx": [
    "ListToolbar",
    "Table",
    "Empty",
    "Pagination",
    "DeleteResource",
    "RowMenu",
  ],
  "routes/ArticlesPage.tsx": [
    "PageLayout",
    "ListToolbar",
    "Table",
    "TableSkeleton",
    "Empty",
    "Pagination",
    "DeleteResource",
    "RowMenu",
    "RelativeTime",
  ],
  "routes/ArticleEditorPage.tsx": [
    "PageLayout",
    "SiteCrumbs",
    "SectionCard",
    "StatusActions",
    "DetailsCard",
    "DangerZoneCard",
    "InputGroup",
    "Input",
    "InputArea",
    "TagInput",
    "ApprovalDialog",
    "DeleteResource",
    "SkeletonLine",
  ],
  "routes/PageEditorPage.tsx": [
    "PageLayout",
    "SiteCrumbs",
    "SectionCard",
    "StatusActions",
    "DetailsCard",
    "DangerZoneCard",
    "Tooltip",
    "ConfirmDialog",
    "Empty",
    "DropdownMenu",
    "ApprovalDialog",
    "DeleteResource",
    "SkeletonLine",
  ],
  "routes/SnapshotsPage.tsx": [
    "PageLayout",
    "ListToolbar",
    "SnapshotTimeline",
    "Table",
    "TableSkeleton",
    "Empty",
    "Pagination",
    "LayerDialog",
    "Radio",
    "ApprovalDialog",
    "SnapshotDiffDialog",
    "RelativeTime",
  ],
  "routes/LoginPage.tsx": ["AuthLayout", "Tabs", "Input", "Button", "Banner"],
  "routes/AgentsPage.tsx": [
    "PageLayout",
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
    "PageLayout",
    "SiteCrumbs",
    "ListToolbar",
    "LayerCard",
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
    "SectionCard",
    "Table",
  ],
  // Side panels are SectionCards; summaries inside dialogs are InsetPanels (DESIGN.md §1).
  "routes/AgentsPage.tsx#layout": ["Crumbs", "SectionCard", "SectionEmpty"],
  "routes/SkillsPage.tsx#layout": ["Crumbs", "SectionCard", "SectionEmpty"],
  "components/CreateAgentKeyDialog.tsx#layout": ["InsetPanel"],
  "components/ChangeAgentModeDialog.tsx#layout": ["InsetPanel"],
  "components/ElevateAgentKeyDialog.tsx#layout": ["InsetPanel"],
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
  // Agents ask for an elevation (§2m, ADR-0016 addendum): own rendering, grant dialog, badges.
  "routes/ApprovalsPage.tsx#elevation-requests": [
    "ApproveElevationDialog",
    "ElevationRequestCell",
    "ElevationRequestDetails",
    "elevationRequestOf",
    "requestOwnMode",
  ],
  "components/ElevationRequest.tsx": [
    "ModeBadge",
    "Badge",
    "Tooltip",
    "Link",
    "Text",
    "InsetPanel",
  ],
  "components/ApproveElevationDialog.tsx": [
    "LayerDialog",
    "LayerDialog.Actions.Primary",
    "AutoModeConfirm",
    "ModeBadge",
    "InsetPanel",
    "AgentReason",
    "Tabs",
    "Input",
    "Select",
    "Banner",
    "useToast",
    "grantPresets",
  ],
  "routes/AgentsPage.tsx#elevation-requests": ["usePendingElevations"],
  "components/Elevation.tsx#elevation-requests": ["AsksForBadge"],
  "components/Audit.tsx#elevation-requests": ["ElevationGrant", "requestedByAgent"],
  "components/ActivityDetailDialog.tsx#elevation-requests": ["ElevationGrant"],
  "components/ActivityDetailDialog.tsx": ["LayerDialog", "Banner", "CodeHighlighted"],
  "components/SnapshotDiffDialog.tsx": [
    "LayerDialog",
    "Tabs",
    "Badge",
    "Table",
    "SectionEmpty",
    "InsetPanel",
  ],
  "components/EditorLayout.tsx": ["Columns", "Tabs", "Tooltip", "SectionCard"],
  "components/StatusActions.tsx": ["DropdownMenu", "Tooltip", "TRANSITIONS"],
  "components/EditorPreview.tsx": ["PreviewPanel"],
  // Settings template (§2c): Columns 1-2 with a sticky TableOfContents + one SectionCard per section.
  "components/Settings.tsx": [
    "Columns",
    "TableOfContents",
    "useTableOfContentsActiveId",
    "SectionCard",
  ],
  "routes/AccountPage.tsx": [
    "PageLayout",
    "Crumbs",
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
    "PageLayout",
    "SiteCrumbs",
    "SettingsLayout",
    "SettingsSection",
    "InputGroup",
    "Select",
    "Radio",
    "Table",
    "SectionEmpty",
    "DropdownMenu",
    "ClipboardText",
    "ConfirmDialog",
    "InsetPanel",
  ],
  "routes/SkillsPage.tsx": [
    "PageLayout",
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
  // Approvals (§2m): pending requests as divided rows in one SectionCard, history Table, LayerDialog confirmation.
  "routes/ApprovalsPage.tsx": [
    "PageLayout",
    "SiteCrumbs",
    "SectionCard",
    "Table",
    "SectionEmpty",
    "Collapsible",
    "CodeHighlighted",
    "RefreshButton",
    "ApproveRequestDialog",
    "ActorCell",
    "ToolCell",
  ],
  "components/ApproveRequestDialog.tsx": ["LayerDialog", "Banner", "Badge", "InsetPanel"],
  "components/PendingApprovalsBanner.tsx": ["Banner", "Banner.Action"],
  "routes/SiteOverviewPage.tsx#approvals": ["PendingApprovalsBanner"],
  "routes/SiteShell.tsx#approvals": ["usePendingApprovals", "Sidebar.MenuBadge"],
  "routes/PageEditorPage.tsx#preview": ["EditorLayout", "EditorPreview", "PreviewToggle"],
  "routes/ArticleEditorPage.tsx#preview": ["EditorLayout", "EditorPreview", "PreviewToggle"],
  "routes/SiteOverviewPage.tsx#activity": ["RecentActivity"],
  // Notifications (§2n, ADR-0016 addendum "told before it ends"): bell, panel, toasts, opt-in.
  "components/AppFrame.tsx#notifications": ["NotificationsBell"],
  "components/NotificationsBell.tsx": [
    "NotificationBell",
    "NotificationItem",
    "SectionEmpty",
    "Badge",
    "ButtonGroup",
    "DropdownMenu",
    "LinkButton",
    "ModeBadge",
    "AgentReason",
    "RelativeTime",
    "useExtendElevation",
    "useEndElevation",
    "useNotifications",
    "useNotificationAlerts",
    "liveNotifications",
  ],
  "components/NotificationSettings.tsx": [
    "SettingsSection",
    "SettingRow",
    "Switch",
    "Badge",
    "Banner",
    "requestPermission",
  ],
  "routes/AccountPage.tsx#notifications": ["NotificationSettings"],
  "components/Elevation.tsx#notifications": ["useExtendElevation", "endsWithin"],
  "routes/AgentsPage.tsx#notifications": ["useExtendElevation", "noticeMinutes"],
};

/** DESIGN.md §6: components that must be in use somewhere in Studio today (the rest are reserved for later surfaces). */
const REQUIRED_SOMEWHERE = [
  "Sidebar",
  "Breadcrumbs",
  "PageLayout",
  "SectionCard",
  "InsetPanel",
  "AuthLayout",
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
  "Switch",
  "NotificationBell",
];

describe("design rules (DESIGN.md)", () => {
  it.each(allFiles().map((f) => path.relative(path.resolve(STUDIO_SRC, "../../.."), f)))(
    "%s passes the design lint",
    (rel) => {
      const abs = path.resolve(STUDIO_SRC, "../../..", rel);
      const violations = lintFile(abs);
      expect(violations, format(abs, violations)).toEqual([]);
    },
  );

  it("every registered route template points at an existing file", () => {
    const missing = Object.keys(ROUTE_TEMPLATES).filter((f) => !files.some((x) => x.file === f));
    expect(missing).toEqual([]);
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
    // The dialog grants; Elevation.tsx only extends an elevation in force (next test).
    expect(elevating.map((f) => f.file)).toEqual([
      "components/ElevateAgentKeyDialog.tsx",
      "components/Elevation.tsx",
    ]);
    const dialog = elevating[0] as { file: string; text: string };
    expect(dialog.text).toMatch(/<AutoModeConfirm\b/);
    expect(dialog.text).toMatch(/needsConsent && !autoConfirmed\) return/);
  });

  it("extending re-posts the mode in force, never a new grant (ADR-0016 addendum)", () => {
    const elevation = files.find((f) => f.file === "components/Elevation.tsx") as { text: string };
    const extend = elevation.text.slice(
      elevation.text.indexOf("export function useExtendElevation"),
    );
    // One call, inside useExtendElevation, after re-reading the keys: refused when the elevation
    // ended or changed mode; the body is `extensionInput(target, …)` = the target's own mode.
    expect(elevation.text.match(/api\.agentKeys\.elevate\(/g)).toHaveLength(1);
    expect(extend).toMatch(
      /api\.agentKeys\.list\(\)[\s\S]*!canExtend\(target, now\) \|\| inForce\?\.mode !== target\.mode[\s\S]*throw new ElevationGoneError[\s\S]*api\.agentKeys\.elevate\(target\.keyId, extensionInput\(target,/,
    );
    expect(elevation.text).not.toMatch(/bypass/);
  });

  it("every notification action routes through the shared extend/end helpers", () => {
    const alerts = readFileSync(path.join(SRC, "components/useNotifications.ts"), "utf8");
    const notificationFiles = [
      ...["components/NotificationsBell.tsx", "routes/AgentsPage.tsx"].map(
        (file) => files.find((f) => f.file === file) as { file: string; text: string },
      ),
      { file: "components/useNotifications.ts", text: alerts },
    ];
    for (const f of notificationFiles) {
      // No direct key mutations: only `useExtendElevation` / `useEndElevation` change elevations.
      expect(f.text, f.file).not.toMatch(/api\.agentKeys\.(elevate|endElevation)\b/);
      expect(f.text, f.file).toMatch(/\buseExtendElevation\(\)/);
    }
    const bell = notificationFiles[0] as { text: string };
    expect(bell.text).toMatch(/\buseEndElevation\(\)/);
    // Ending early has one implementation too.
    const ending = uiFiles.filter((f) => /api\.agentKeys\.endElevation\b/.test(f.text));
    expect(ending.map((f) => f.file)).toEqual(["components/Elevation.tsx"]);
    // The toast's "Extend" is the same helper with the same default.
    expect(alerts).toMatch(/extend\(\{ targets: \[target\], minutes: DEFAULT_EXTEND_MINUTES \}\)/);
  });

  it("every screen that grants an agent's elevation request asks for consent before Auto", () => {
    // Approving a request_elevation grants it on the server, so it only ever goes through the
    // grant dialog: fixed mode, never longer than asked, Auto consent (ADR-0016 addendum).
    const granting = uiFiles.filter((f) => /api\.approvals\.grantElevation\b/.test(f.text));
    expect(granting.map((f) => f.file)).toEqual(["components/ApproveElevationDialog.tsx"]);
    for (const f of granting) {
      expect(f.text, f.file).toMatch(/<AutoModeConfirm\b/);
      expect(f.text, f.file).toMatch(/needsConsent && !autoConfirmed\) return/);
      expect(f.text, f.file).toMatch(/minutes > requested\) return/);
      expect(f.text, f.file).not.toMatch(/<ModePicker\b/);
    }
    const page = files.find((f) => f.file === "routes/ApprovalsPage.tsx") as { text: string };
    // An elevation request is routed to that dialog before any other approve path.
    expect(page.text).toMatch(
      /if \(decision === "approve" && elevationRequestOf\(request\)\) setGranting\(request\);\s*else if/,
    );
    expect(page.text).toMatch(/<ApproveElevationDialog\b/);
  });

  it("every screen that can pick Auto asks for consent first", () => {
    const pickers = uiFiles.filter(
      (f) => /<ModePicker\b/.test(f.text) && f.file !== "components/AgentModes.tsx",
    );
    expect(pickers.length).toBeGreaterThan(0);
    const missing = pickers.filter((f) => !/<AutoModeConfirm\b/.test(f.text)).map((f) => f.file);
    expect(missing).toEqual([]);
  });
});
