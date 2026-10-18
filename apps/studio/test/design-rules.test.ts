/**
 * Design-system enforcement (docs/design/DESIGN.md). Per-file rules live in
 * `scripts/design-lint.ts` (shared with `pnpm design:lint` and the agent hook); this file runs
 * them over every screen and adds the cross-file checks. Keep both in sync with DESIGN.md.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  allFiles,
  format,
  lintFile,
  lintSource,
  ROUTE_TEMPLATES,
  STUDIO_SRC,
} from "../scripts/design-lint.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
  });
}
/** Every source file (`.ts` and `.tsx`), for checks that span helpers too. */
function walkAll(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walkAll(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}
const files = walk(SRC).map((f) => ({
  file: path.relative(SRC, f),
  text: readFileSync(f, "utf8"),
}));
/**
 * A screen split into its route and a components folder of its own (docs/engineering/
 * code-structure.md §8) is checked as one text: its rules hold for the screen, wherever the
 * markup lives.
 */
const SCREEN_PARTS: Readonly<Record<string, string>> = {
  "routes/PageEditorPage.tsx": "components/page-editor",
  "routes/ArticleEditorPage.tsx": "components/article-editor",
};
function screenText(file: string): string {
  const own = (files.find((f) => f.file === file) as { text: string }).text;
  const dir = SCREEN_PARTS[file];
  if (!dir) return own;
  return [own, ...walkAll(path.join(SRC, dir)).map((f) => readFileSync(f, "utf8"))].join("\n");
}
const uiFiles = files.filter(
  (f) => f.file.startsWith("routes/") || f.file.startsWith("components/"),
);

/** Every screen must be composed from these; the matrix in DESIGN.md maps the rest. */
const REQUIRED_IMPORTS: Record<string, string[]> = {
  "components/AppFrame.tsx": [
    "Sidebar",
    "CommandMenu",
    "Sidebar.Loading",
    "Sidebar.Trigger",
    "Sidebar.Rail",
    "UserMenu",
  ],
  // The palette loads with its first opening (bundle-budget.ts): Kumo's CommandPalette in its own module.
  "components/CommandMenu.tsx": ["CommandPalette"],
  "components/UserMenu.tsx": ["DropdownMenu", "Avatar"],
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
    "ArticleTermsCard",
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
  // Navigation menus (§2t, RFC-0003 §8): the MenuTree editor with its preview, picker and delta.
  "routes/NavigationPage.tsx": [
    "PageLayout",
    "SiteCrumbs",
    "EditorLayout",
    "PreviewToggle",
    "SectionCard",
    "SectionEmpty",
    "MenuTree",
    "NavigationPreview",
    "MenuItemDialog",
    "MenuSaveDialog",
    "CreateMenuDialog",
    "FromPagesDialog",
    "ConfirmDialog",
    "DangerZoneCard",
    "DetailsCard",
    "DropdownMenu.Item",
    "Tooltip",
    "Banner",
    "Tabs",
    "useGate",
  ],
  "components/MenuItemDialog.tsx": [
    "LayerDialog",
    "LayerDialog.Actions.Primary",
    "Combobox",
    "Combobox.Group",
    "Combobox.GroupLabel",
    "Input",
    "Checkbox",
    "InsetPanel",
    "Select",
  ],
  "components/MenuSaveDialog.tsx": ["LayerDialog", "LayerDialog.Actions.Primary", "InsetPanel"],
  "components/MenuDialogs.tsx": ["LayerDialog", "Radio", "Checkbox", "InsetPanel", "SkeletonLine"],
  "routes/PageEditorPage.tsx#menus": ["UsedInMenusCard", "MenuDeleteNotice"],
  "routes/ArticleEditorPage.tsx#menus": ["UsedInMenusCard", "MenuDeleteNotice"],
  "routes/TermEditorPage.tsx#menus": ["UsedInMenusCard"],
  "routes/PagesPage.tsx#menus": ["MenuDeleteNotice"],
  "routes/ArticlesPage.tsx#menus": ["MenuDeleteNotice"],
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
  // The editors' preview follows the unsaved form (RFC-0014 phase 1c): `DraftEditorPreview`
  // wraps `EditorPreview`.
  "routes/PageEditorPage.tsx#preview": ["EditorLayout", "DraftEditorPreview", "PreviewToggle"],
  "routes/ArticleEditorPage.tsx#preview": ["EditorLayout", "DraftEditorPreview", "PreviewToggle"],
  "components/DraftPreview.tsx": ["EditorPreview"],
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
  // Search and sharing (§2o): cover image, search/social preview, page SEO panel, list markers.
  "components/Seo.tsx": [
    "SectionCard",
    "ImagePreview",
    "SearchResultPreview",
    "SocialCardPreview",
    "InsetPanel",
    "Input",
    "InputArea",
    "Switch",
    "Banner",
    "Collapsible",
    "Tabs",
    "Badge",
    "SettingRow",
    "CharacterCount",
    "imageRefPreviewUrl",
    "truncateForSearch",
    "searchBreadcrumb",
  ],
  "routes/ArticleEditorPage.tsx#seo": [
    "CoverImageCard",
    "ArticleSeoPreviewCard",
    "CountedHint",
    "validateImageRef",
    "primaryHostname",
  ],
  "routes/PageEditorPage.tsx#seo": ["PageSeoCard", "validateSeo", "cleanSeo", "primaryHostname"],
  "routes/PagesPage.tsx#seo": ["Badge", "Tooltip", "EyeSlash"],
  "routes/ArticlesPage.tsx#seo": ["ImagePreview", "imageRefPreviewUrl"],
  // Categories, tags and redirects (§2p, RFC-0002 §8).
  "routes/TaxonomyPage.tsx": [
    "PageLayout",
    "SiteCrumbs",
    "ListToolbar",
    "Tabs",
    "Table",
    "TableSkeleton",
    "Empty",
    "Pagination",
    "DropdownMenu",
    "Tooltip",
    "Banner",
    "SectionCard",
    "SettingRow",
    "GovernanceDialog",
    "CreateTermDialog",
    "TaxonomyHealthCard",
    "TagsMigrationBanner",
    "IndexBadge",
    "ActorCell",
    "termTree",
  ],
  "routes/TermEditorPage.tsx": [
    "PageLayout",
    "SiteCrumbs",
    "EditorLayout",
    "SectionCard",
    "SectionEmpty",
    "Input",
    "TagInput",
    "InputArea",
    "InsetPanel",
    "CoverImageCard",
    "SeoFields",
    "DetailsCard",
    "DangerZoneCard",
    "DropdownMenu",
    "GovernanceDialog",
    "IndexBadge",
    "validateTerm",
  ],
  "routes/RedirectsPage.tsx": [
    "PageLayout",
    "SiteCrumbs",
    "ListToolbar",
    "Toolbar",
    "Select",
    "Table",
    "TableSkeleton",
    "Empty",
    "Pagination",
    "DropdownMenu",
    "Tooltip",
    "Badge",
    "RelativeTime",
    "ConfirmDialog",
    "RedirectDialog",
    "servedPaths",
  ],
  "components/GovernanceDialog.tsx": [
    "LayerDialog",
    "LayerDialog.Actions.Primary",
    "Banner",
    "InsetPanel",
    "Badge",
    "SkeletonLine",
    "InputGroup",
    "Checkbox",
    "TermCombobox",
    "Status",
  ],
  "components/TermPickers.tsx": [
    "Combobox",
    "Combobox.TriggerInput",
    "Combobox.TriggerMultipleWithInput",
    "Combobox.Chip",
    "Autocomplete",
    "Autocomplete.InputGroup",
    "Select",
    "TermChip",
    "TermChipList",
    "Badge",
    "tagSuggestions",
  ],
  "components/CreateTermDialog.tsx": [
    "LayerDialog",
    "Input",
    "InputGroup",
    "Switch",
    "Banner",
    "TermCombobox",
    "similarTerms",
    "validateSlug",
  ],
  "components/RedirectDialog.tsx": [
    "LayerDialog",
    "Radio",
    "InputGroup",
    "Input",
    "Banner",
    "InsetPanel",
    "externalHost",
    "validateRedirect",
  ],
  "components/TaxonomyHealthCard.tsx": ["SectionCard", "SectionEmpty", "Badge", "taxonomyReport"],
  "components/TagsMigration.tsx": ["Banner", "Banner.Action", "LayerDialog", "InsetPanel"],
  "components/ArticleTerms.tsx": [
    "SectionCard",
    "CategoryPicker",
    "TagPicker",
    "TagInput",
    "Banner",
    "withAssignment",
  ],
  "components/Taxonomy.tsx": ["Badge", "Tooltip", "Link", "IndexStatus"],
  "routes/ArticleEditorPage.tsx#taxonomy": [
    "ArticleTermsCard",
    "TagsMigrationBanner",
    "useTaxonomyData",
    "missingPrimaries",
  ],
  "routes/ArticlesPage.tsx#taxonomy": [
    "Select",
    "Toolbar",
    "Badge",
    "Tooltip",
    "facetFilter",
    "TagsMigrationBanner",
  ],
  "routes/SiteShell.tsx#taxonomy": ["useTaxonomyData", "Signpost", "Tag"],
  "components/SnapshotDiffDialog.tsx#taxonomy": ["AssignmentDeltas", "useTaxonomyData"],
  // Staff roles and invites (§2q–§2s, RFC-0005): Team page, invite flow, token pages, gating.
  "routes/MembersPage.tsx": [
    "PageLayout",
    "Crumbs",
    "ListToolbar",
    "LayerCard",
    "Table",
    "TableSkeleton",
    "Empty",
    "SectionCard",
    "SectionEmpty",
    "Pagination",
    "DropdownMenu",
    "Tooltip",
    "Badge",
    "RelativeTime",
    "ConfirmDialog",
    "RoleBadge",
    "RoleList",
    "InviteDialog",
    "ChangeRoleDialog",
    "RemoveMemberDialog",
    "ResetLinkDialog",
    "TransferOwnershipDialog",
    "ActivityList",
    "useGate",
  ],
  "components/InviteDialog.tsx": [
    "LayerDialog",
    "LayerDialog.Actions.Primary",
    "Input",
    "Select",
    "Radio",
    "Banner",
    "ClipboardText",
    "InsetPanel",
    "RoleExplainer",
    "invitePresets",
    "invitableRoles",
  ],
  "components/MemberDialogs.tsx": [
    "LayerDialog",
    "LayerDialog.Alert",
    "LayerDialog.Actions.Primary",
    "Select",
    "Banner",
    "InsetPanel",
    "ClipboardText",
    "PasswordField",
    "Avatar",
    "RoleBadge",
    "ModeBadge",
    "ScopeBadge",
    "keysNarrowed",
  ],
  "components/Roles.tsx": ["Badge", "Tooltip", "Table", "roleCan"],
  "components/Gating.tsx": ["Banner", "fieldset"],
  "components/NewPassword.tsx": ["Meter", "PasswordField", "passwordStrength"],
  "routes/InvitePage.tsx": [
    "AuthLayout",
    "Banner",
    "Banner.Action",
    "Input",
    "InsetPanel",
    "PasswordField",
    "NewPasswordFields",
    "Button",
    "SkeletonLine",
    "RoleBadge",
    "takeHashToken",
  ],
  "routes/ResetPasswordPage.tsx": [
    "AuthLayout",
    "Banner",
    "Input",
    "InsetPanel",
    "NewPasswordFields",
    "Button",
    "takeHashToken",
  ],
  // RFC-0011: asking for a reset link by email (the same answer for every address).
  "routes/ForgotPasswordPage.tsx": ["AuthLayout", "Banner", "Input", "Button", "LinkButton"],
  "routes/LoginPage.tsx#reset": ["forgotPassword.link", "Link"],
  "components/UserMenu.tsx#roles": ["RoleBadge", "useMe"],
  "routes/AccountShell.tsx#roles": ["UsersThree", "useMembers"],
  "routes/AccountPage.tsx#roles": ["Avatar", "RoleBadge"],
  "routes/AgentsPage.tsx#roles": ["AllKeys", "OthersKeyMenu", "RoleBadge", "effectiveScopes"],
  "components/CreateAgentKeyDialog.tsx#roles": ["scopeOptions", "roleScopes"],
  "components/AgentModes.tsx#roles": ["keyModes", "RoleCapHint"],
  "routes/ApprovalsPage.tsx#roles": ["canDecide", "useDecideReason", "cannotDecideMessage"],
  "routes/ActivityPage.tsx#roles": ["useCan", "useMemberRoles", "ActivitySource"],
  "components/SitePublish.tsx#roles": ["usePublishMode", "usePublishSite"],
  "routes/SnapshotsPage.tsx#roles": ["usePublishMode", "publishDisabledReason"],
  "components/StatusActions.tsx#roles": ["allowed", "publishReason", "readOnlyReason"],
  "routes/ArticleEditorPage.tsx#roles": ["entryAccess", "ViewOnlyBanner"],
  "routes/PageEditorPage.tsx#roles": ["useGate", "ViewOnlyBanner"],
  "routes/TaxonomyPage.tsx#roles": ["useGate", "ReadOnly", "ViewOnlyBanner"],
  "routes/TermEditorPage.tsx#roles": ["useGate", "ReadOnly", "ViewOnlyBanner"],
  "routes/RedirectsPage.tsx#roles": ["useGate", "ReadOnly", "ViewOnlyBanner"],
  "routes/SiteSettingsPage.tsx#roles": ["useGate", "ReadOnly", "ViewOnlyBanner"],
  "components/NotificationsBell.tsx#roles": ["MemberJoinedItem", "RoleChangedItem"],
  // Media library (§2u, RFC-0004 §8): library, file page, upload queue, picker, takedown.
  "routes/MediaPage.tsx": [
    "PageLayout",
    "SiteCrumbs",
    "ListToolbar",
    "Toolbar",
    "Select",
    "Tabs",
    "MediaDropZone",
    "MediaGrid",
    "MediaTile",
    "LayerCard",
    "Table",
    "TableSkeleton",
    "Empty",
    "RowMenu",
    "RelativeTime",
    "UploadDialog",
    "useFileChooser",
    "useGate",
  ],
  "routes/AssetPage.tsx": [
    "PageLayout",
    "SiteCrumbs",
    "EditorLayout",
    "SectionCard",
    "SectionEmpty",
    "Input",
    "InputArea",
    "InputGroup",
    "Switch",
    "Select",
    "Tabs",
    "Table",
    "InlineCopyText",
    "LinkButton",
    "Banner",
    "DetailsCard",
    "DangerZoneCard",
    "DeleteResource",
    "TakedownDialog",
    "ViewOnlyBanner",
    "ReadOnly",
    "useGate",
    "validateAssetForm",
  ],
  "components/MediaUpload.tsx": [
    "MediaDropZone",
    "MediaKindFrame",
    "ImagePreview",
    "LayerDialog",
    "LayerDialog.Actions.Primary",
    "Meter",
    "Checkbox",
    "Banner",
    "InsetPanel",
    "Input",
    "putUpload",
  ],
  "components/MediaPicker.tsx": [
    "LayerDialog",
    "LayerDialog.Actions.Primary",
    "Tabs",
    "MediaGrid",
    "MediaTile",
    "SectionEmpty",
    "SkeletonLine",
    "ImagePreview",
    "InsetPanel",
    "InputArea",
    "Collapsible",
    "UploadPanel",
    "imageRefFor",
    "useGate",
  ],
  "components/Media.tsx": ["ImagePreview", "MediaKindFrame", "Badge", "Tooltip"],
  "components/TakedownDialog.tsx": [
    "LayerDialog.Alert",
    "LayerDialog.Actions.Primary",
    "Banner",
    "InsetPanel",
    "InputArea",
    "Checkbox",
  ],
  "components/Seo.tsx#media": ["ImageRefField"],
  "routes/PageEditorPage.tsx#media": ["ImageRefField"],
  // "Go to media" lives with the site's palette commands (`useSitePalette.ts`, RFC-0029 §7;
  // checked in command-menu.test.tsx)
  "routes/SiteShell.tsx#media": ["Images", "nav.media"],
  "components/SnapshotDiffDialog.tsx#media": ["assetTitle"],
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
  "ImagePreview",
  "SearchResultPreview",
  "SocialCardPreview",
  "Combobox",
  "Autocomplete",
  "TermChip",
  "Avatar",
  "Meter",
  "MediaDropZone",
  "MediaGrid",
  "MediaTile",
  "MediaKindFrame",
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
      const text = screenText(file);
      const missing = required.filter((name) => !new RegExp(`\\b${name}\\b`).test(text));
      expect(missing, `${file} must use ${missing.join(", ")}`).toEqual([]);
    },
  );

  it("uses every Kumo component the design system requires today", () => {
    const all = files.map((f) => f.text).join("\n");
    const missing = REQUIRED_SOMEWHERE.filter((name) => !new RegExp(`\\b${name}\\b`).test(all));
    expect(missing).toEqual([]);
  });

  it("every iframe is fully sandboxed (previews include drafts); only the Build view merges", () => {
    const UI_BLOCKS = path.resolve(here, "../../../packages/ui/src/blocks");
    const sources = [
      ...files,
      ...walk(UI_BLOCKS).map((f) => ({ file: f, text: readFileSync(f, "utf8") })),
    ];
    const unsandboxed = sources.flatMap((f) =>
      [...f.text.matchAll(/<iframe\b[^>]*>/g)]
        // DESIGN.md §2ac: a morphing panel needs same-origin access for itself; the body editor's
        // drawn ```surface (§2y) reads its own height. Scripts never run in either.
        .filter(
          (m) =>
            !/\bsandbox=""/.test(m[0]) &&
            !/\bsandbox=\{morph \? "allow-same-origin" : ""\}/.test(m[0]) &&
            !(
              path.basename(f.file) === "extensions.tsx" &&
              /\bsandbox="allow-same-origin"/.test(m[0])
            ),
        )
        .map(() => path.basename(f.file)),
    );
    expect(unsandboxed, 'use sandbox="" (no scripts, no same-origin)').toEqual([]);
    const scripted = sources.filter((f) => /allow-scripts|allow-top-navigation/.test(f.text));
    expect(
      scripted.map((f) => path.basename(f.file)),
      "frames never run scripts",
    ).toEqual([]);
  });

  it("chart and map tooltips are never HTML formatters (RFC-0006 §10.1)", () => {
    const UI_SRC = path.resolve(here, "../../../packages/ui/src");
    const KUMO_COPIES = path.join(UI_SRC, "blocks", "kumo");
    const sources = [...walkAll(SRC), ...walkAll(UI_SRC).filter((f) => !f.startsWith(KUMO_COPIES))];
    const offenders = sources.filter((f) =>
      /\b(?:tooltipFormatter|dangerousHtmlFormatter)\s*[=:]/.test(readFileSync(f, "utf8")),
    );
    expect(offenders.map((f) => path.basename(f))).toEqual([]);
    // The lint rule that backs it (screens and blocks, also on every agent edit).
    const flagged = lintSource(
      "components/X.tsx",
      "<ChoroplethMap tooltipFormatter={(r) => r.name} />",
      "screen",
    ).map((v) => v.rule);
    expect(flagged).toContain("no-html-tooltip");
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
    // The picker is narrowed to `modesAbove(own, rules.keyModes)`: key modes up to the role's cap.
    expect(dialog.text).toMatch(/const targets = modesAbove\(own, rules\.keyModes\)/);
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

  it("images are drawn only by ImagePreview, from a validated source (§2o)", () => {
    // <img> lives only in the ImagePreview block and the focal point picker (RFC-0028), each
    // without referrer.
    const UI_BLOCKS = path.resolve(here, "../../../packages/ui/src/blocks");
    const withImg = walk(UI_BLOCKS)
      .filter((f) => /<img\b/.test(readFileSync(f, "utf8")))
      .map((f) => path.basename(f));
    expect(withImg.sort()).toEqual(["FocalPointPicker.tsx", "SeoPreview.tsx"]);
    for (const name of withImg) {
      const block = readFileSync(path.join(UI_BLOCKS, name), "utf8");
      // Every <img> carries the policy (one per element).
      expect(block.match(/referrerPolicy="no-referrer"/g)?.length, name).toBe(
        block.match(/^\s*<img\b/gm)?.length,
      );
    }
    // The picker is fed the media library's private content route only.
    const assetPage = uiFiles.find((f) => f.file === "routes/AssetPage.tsx") as { text: string };
    expect(assetPage.text).toMatch(/const focalSrc =[^;]*assetPreviewUrl\(siteId, asset\)/);
    expect(uiFiles.filter((f) => /<FocalPointPicker\b/.test(f.text)).map((f) => f.file)).toEqual([
      "routes/AssetPage.tsx",
    ]);
    // Screens pass ImagePreview a URL that went through previewImageUrl (safe source, site
    // paths resolved against the primary domain), a media-library file's private content route
    // (assetPreviewUrl, drafts included, §2u) or the person's own chosen file (an object URL) —
    // never a raw stored src.
    const users = uiFiles.filter((f) => /<ImagePreview\b/.test(f.text));
    expect(users.map((f) => f.file).sort()).toEqual([
      "components/Media.tsx",
      "components/MediaPicker.tsx",
      "components/MediaUpload.tsx",
      "components/Seo.tsx",
      "routes/ArticlesPage.tsx",
    ]);
    for (const f of users) {
      expect(f.text, f.file).toMatch(
        /previewImageUrl\(|imageRefPreviewUrl\(|assetPreviewUrl\(|useObjectUrl\(/,
      );
      expect(f.text, f.file).not.toMatch(/<ImagePreview[^>]*src=\{[^}]*\.src\}/);
    }
    // The content route is the only asset source, and it is Studio's own (same origin).
    const media = readFileSync(path.join(SRC, "lib/media.ts"), "utf8");
    expect(media).toMatch(/return api\.assets\.contentUrl\(siteId, asset\.id\)/);
  });

  it("file bytes go up only through a single-use ticket (§2u, RFC-0004 §5.5)", () => {
    const sources = walkAll(SRC).map((f) => ({
      file: path.relative(SRC, f),
      text: readFileSync(f, "utf8"),
    }));
    // One XMLHttpRequest in Studio (progress), in the upload helper; no multipart bodies.
    const xhr = sources.filter((f) => /XMLHttpRequest/.test(f.text)).map((f) => f.file);
    expect(xhr).toEqual(["lib/uploads.ts"]);
    expect(sources.filter((f) => /new FormData\(/.test(f.text)).map((f) => f.file)).toEqual([]);
    const uploads = sources.find((f) => f.file === "lib/uploads.ts") as { text: string };
    // It only PUTs to the ticket's own URL (same origin, signed, `upl_` id).
    expect(uploads.text).toMatch(/\^\\\/api\\\/sites\\\/\[\^\/\]\+\\\/assets\\\/uploads\\\/upl_/);
    // Tickets are asked for in one place, and the bytes follow the ticket the server returned.
    const asking = sources.filter((f) => /api\.assets\.requestUploads\(/.test(f.text));
    expect(asking.map((f) => f.file)).toEqual(["components/MediaUpload.tsx"]);
    const putting = sources.filter((f) => /\bputUpload\(/.test(f.text));
    expect(putting.map((f) => f.file).sort()).toEqual([
      "components/MediaUpload.tsx",
      "lib/uploads.ts",
    ]);
    const queue = asking[0] as { text: string };
    expect(queue.text).toMatch(
      /api\.assets\.requestUploads\(siteId, requests\)[\s\S]*isOpenTicket\(ticket\)[\s\S]*putUpload\(ticket, item\.file/,
    );
    const api = sources.find((f) => f.file === "lib/api/media.ts") as { text: string };
    expect(api.text).toMatch(/\/assets\/uploads`, \{\s*method: "POST"/);
  });

  it("images say what they show before they upload and before they save (§2u)", () => {
    const queue = files.find((f) => f.file === "components/MediaUpload.tsx") as { text: string };
    // An image needs alt text or "decorative"; Upload stays disabled until every image has one.
    expect(queue.text).toMatch(
      /described = \(item: UploadItem\) =>\s*!isImage\(item\) \|\| item\.decorative \|\| item\.alt\.trim\(\)\.length > 0/,
    );
    expect(queue.text).toMatch(/canStart = ready\.length > 0 && ready\.every\(described\)/);
    expect(queue.text).toMatch(/disabled=\{pending \? !upload\.canStart/);
    // The file page validates before every save; the rule is the server's (PUT /assets/:id).
    const page = files.find((f) => f.file === "routes/AssetPage.tsx") as { text: string };
    const saves = page.text.match(/save\.mutate\(/g) ?? [];
    expect(saves.length).toBeGreaterThan(0);
    expect(page.text.match(/if \(valid\(\)\) save\.mutate\(/g)?.length).toBe(saves.length);
    const media = readFileSync(path.join(SRC, "lib/media.ts"), "utf8");
    expect(media).toMatch(
      /kind === "image" && !form\.decorative && !form\.alt\[defaultLocale\]\?\.trim\(\)\)\s*errors\.alt = "required"/,
    );
  });

  it("media controls follow the asset abilities; takedown is the Owner's (§2u, §2s)", () => {
    const library = files.find((f) => f.file === "routes/MediaPage.tsx") as { text: string };
    expect(library.text).toMatch(/const upload = useGate\("assets\.upload"\)/);
    expect(library.text).toMatch(/disabled=\{!upload\.allowed\}\s*title=\{upload\.reason\}/);
    expect(library.text).toMatch(/disabledReason=\{upload\.reason\}/);
    const page = files.find((f) => f.file === "routes/AssetPage.tsx") as { text: string };
    expect(page.text).toMatch(/const manage = useGate\("assets\.manage"\)/);
    // Retire, restore and delete carry the manage gate's reason; takedown the Owner's.
    expect(page.text.match(/manage\.reason/g)?.length).toBeGreaterThanOrEqual(3);
    expect(page.text).toMatch(/useCan\("ownership\.transfer"\)/);
    expect(page.text).toMatch(/media\.takedown\.ownerOnly/);
    // Edits follow the server's own/manage answer, read-only otherwise.
    expect(page.text).toMatch(/disabled=\{!dirty \|\| !data\.editable\}/);
    const picker = files.find((f) => f.file === "components/MediaPicker.tsx") as { text: string };
    expect(picker.text).toMatch(/useGate\("assets\.upload"\)/);
    // A picked file is written as `assetId` + its URL; typing an address detaches it (lib/seo.ts).
    expect(picker.text).toMatch(/onChange\(imageRefFor\(item, alt\)\)/);
    const seo = readFileSync(path.join(SRC, "lib/seo.ts"), "utf8");
    expect(seo).toMatch(/delete next\.assetId/);
  });

  it("every save path in the editors validates search and image fields first (§2o)", () => {
    // `valid(status)` also checks the required primary category for the status being saved (§2p).
    for (const file of [
      "routes/ArticleEditorPage.tsx",
      "routes/PageEditorPage.tsx",
      "routes/TermEditorPage.tsx",
    ]) {
      const text = screenText(file);
      const saves = text.match(/save\.mutate\(/g) ?? [];
      const guarded = text.match(/if \(valid\([^)]*\)\) save\.mutate\(/g) ?? [];
      expect(saves.length, file).toBeGreaterThan(0);
      expect(guarded.length, `${file}: unguarded save.mutate`).toBe(saves.length);
      if (file !== "routes/TermEditorPage.tsx")
        expect(text, file).toMatch(/if \(valid\([^)]*\)\) setPublishOpen\(true\)/);
    }
    // Review and publish check the status they move to (RFC-0002 invariant 2).
    const article = files.find((f) => f.file === "routes/ArticleEditorPage.tsx") as {
      text: string;
    };
    expect(article.text).toMatch(
      /if \(valid\(next\)\) save\.mutate\(\{ \.\.\.draft, status: next \}\)/,
    );
    expect(article.text).toMatch(/if \(valid\("published"\)\) setPublishOpen\(true\)/);
  });

  it("the noindex switch always comes with its warning (§2o)", () => {
    const seo = files.find((f) => f.file === "components/Seo.tsx") as { text: string };
    expect(seo.text).toMatch(/<Switch[\s\S]*?patchSeo\(seo, \{ noindex: checked \}\)/);
    expect(seo.text).toMatch(/\{seo\.noindex && \(\s*<Banner\s+variant="alert"/);
  });

  it("governance operations run only through the dialog that previews them (§2p)", () => {
    // Rename, merge, retire, move, visibility and reject go through GovernanceDialog, which shows
    // the dry run first; approving a proposal is the one direct call (non-destructive, like
    // approving a non-destructive agent request).
    const governing = uiFiles.filter((f) => /api\.terms\.govern\(/.test(f.text));
    expect(governing.map((f) => f.file).sort()).toEqual([
      "components/GovernanceDialog.tsx",
      "routes/TaxonomyPage.tsx",
      "routes/TermEditorPage.tsx",
    ]);
    for (const f of governing.filter((x) => x.file !== "components/GovernanceDialog.tsx"))
      for (const m of f.text.matchAll(/api\.terms\.govern\([^)]*\)/g))
        expect(m[0], f.file).toMatch(/decision: "approve"/);
    const dialog = governing.find((f) => f.file === "components/GovernanceDialog.tsx") as {
      text: string;
    };
    // Preview first; the action stays disabled until it is in, and over the limit or when a
    // required category would be lost.
    expect(dialog.text).toMatch(/api\.terms\.preview\(/);
    expect(dialog.text).toMatch(
      /disabled=\{!ready \|\| Boolean\(tooLarge\) \|\| Boolean\(blocked\)\}/,
    );
    // "One change, one snapshot; live with the next publish", the 400 limit and the 410 copy.
    expect(dialog.text).toMatch(/t\("governance\.oneSnapshot"\)/);
    expect(dialog.text).toMatch(/governance\.tooLarge\.description/);
    expect(dialog.text).toMatch(/governance\.gone\.description/);
  });

  it("people confirm an external redirect target by its host (§2p, RFC-0002 security)", () => {
    const dialog = files.find((f) => f.file === "components/RedirectDialog.tsx") as {
      text: string;
    };
    expect(dialog.text).toMatch(/const external = externalHost\(to\)/);
    expect(dialog.text).toMatch(
      /if \(external && step === "form"[\s\S]*?\) \{\s*setStep\("confirm"\)/,
    );
    expect(dialog.text).toMatch(/redirects\.external\.confirm/);
  });

  it("migrated articles save terms from the pickers, never free tags (§2p)", () => {
    const editor = files.find((f) => f.file === "routes/ArticleEditorPage.tsx") as {
      text: string;
    };
    expect(editor.text).not.toMatch(/<TagInput\b/);
    const card = files.find((f) => f.file === "components/ArticleTerms.tsx") as { text: string };
    // The free TagInput only appears for sites without taxonomies (legacy `tags`).
    expect(card.text).toMatch(/!migrated \? \(\s*<TagInput/);
  });

  it("invite and reset tokens come from the fragment and travel only in POST bodies (RFC-0005 §7.1)", () => {
    const roles = readFileSync(path.join(SRC, "lib/roles.ts"), "utf8");
    const take = roles.slice(roles.indexOf("export function takeHashToken"));
    // read from location.hash, stripped at once with replaceState
    expect(take).toMatch(/window\.location\.hash[\s\S]*window\.history\.replaceState\(/);
    for (const file of ["routes/InvitePage.tsx", "routes/ResetPasswordPage.tsx"]) {
      const text = screenText(file);
      expect(text, file).toMatch(/useState\(\(\) => takeHashToken\(/);
      expect(text, file).not.toMatch(/searchParams|location\.search|\?token=/);
    }
    const api = readFileSync(path.join(SRC, "lib/api/team.ts"), "utf8");
    for (const route of [
      "/api/invites/inspect",
      "/api/invites/accept",
      "/api/password-reset/inspect",
      "/api/password-reset/complete",
    ])
      expect(api).toMatch(
        new RegExp(`"${route.replaceAll("/", "\\/")}",\\s*\\{\\s*method: "POST"`),
      );
    // no screen builds a URL with a token in it
    const offenders = uiFiles
      .filter((f) => /[?&]token=|\/(?:invite|reset-password)\?/.test(f.text))
      .map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it("gating reads abilities from /api/me, never role names (RFC-0005 I16)", () => {
    // Screens ask `useCan` / `useGate` what the person may do; only the role screens name roles.
    const allowed = new Set([
      "components/Roles.tsx",
      "components/MemberDialogs.tsx",
      "components/InviteDialog.tsx",
      "routes/MembersPage.tsx",
    ]);
    const offenders = uiFiles
      .filter((f) => !allowed.has(f.file))
      .filter((f) => /\brole\s*[!=]==\s*"(?:administrator|editor|author|contributor)"/.test(f.text))
      .map((f) => f.file);
    expect(offenders).toEqual([]);
    // A disabled gated control always carries the reason for its tooltip.
    for (const f of uiFiles) {
      for (const m of f.text.matchAll(/disabled=\{!(\w+)\.allowed[^}]*\}/g)) {
        const after = f.text.slice(m.index ?? 0, (m.index ?? 0) + 200);
        expect(after, `${f.file}: ${m[0]} needs title={${m[1]}.reason}`).toMatch(
          new RegExp(`title=\\{${m[1]}\\.reason\\}`),
        );
      }
    }
  });

  it("the Team page and the public token pages are routed", () => {
    const router = readFileSync(path.join(SRC, "router.tsx"), "utf8");
    expect(router).toMatch(/path: "\/team"/);
    expect(router).toMatch(/path: "\/invite"/);
    expect(router).toMatch(/path: "\/reset-password"/);
    expect(router).toMatch(/path: "\/forgot-password"/);
    // the token pages need no session
    const invite = router.slice(
      router.indexOf("const inviteRoute"),
      router.indexOf("const indexRoute"),
    );
    expect(invite).not.toMatch(/requireSession/);
  });

  it("menus are saved only after the delta confirmation, one PUT with rev (§2t, RFC-0003 §8)", () => {
    const saving = uiFiles.filter((f) => /api\.menus\.save\(/.test(f.text));
    expect(saving.map((f) => f.file)).toEqual(["routes/NavigationPage.tsx"]);
    const page = saving[0] as { text: string };
    // Save opens the confirmation (after the local checks); only its confirm runs the mutation.
    expect(page.text).toMatch(
      /const startSave = \(\) => \{[\s\S]*?draftProblem\([\s\S]*?setSaveOpen\(true\)/,
    );
    expect(page.text).toMatch(/<MenuSaveDialog[\s\S]*?onConfirm=\{\(\) => save\.mutate\(\)\}/);
    expect(page.text).toMatch(/saveBody\(base, draft\)/);
    const dialog = files.find((f) => f.file === "components/MenuSaveDialog.tsx") as {
      text: string;
    };
    expect(dialog.text).toMatch(/t\("governance\.oneSnapshot"\)/);
    // Writes are gated on structure.write (cosmetic; the API refuses anyway).
    expect(page.text).toMatch(/readOnly=\{!can\}/);
  });

  it("external menu links show their host and new tabs are opt-in (§2t, RFC-0003 security)", () => {
    const dialog = files.find((f) => f.file === "components/MenuItemDialog.tsx") as {
      text: string;
    };
    expect(dialog.text).toMatch(/hostOf\(form\.href\.trim\(\)\)/);
    expect(dialog.text).toMatch(/menus\.item\.leavesFor/);
    expect(dialog.text).toMatch(/label=\{t\("menus\.item\.newTab"\)\}/);
    const chips = files.find((f) => f.file === "components/Menus.tsx") as { text: string };
    expect(chips.text).toMatch(/menus\.chips\.newTab/);
  });

  it("deleting a page or article names the menu items it hides (§2t, RFC-0003 invariant 10)", () => {
    for (const file of [
      "routes/PageEditorPage.tsx",
      "routes/ArticleEditorPage.tsx",
      "routes/PagesPage.tsx",
      "routes/ArticlesPage.tsx",
    ]) {
      const text = screenText(file);
      expect(text, file).toMatch(/<DeleteResource[\s\S]*?notice=\{<MenuDeleteNotice/);
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
});
