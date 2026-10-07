# Cloudhal Studio design system

**Binding for every admin surface** (`apps/studio`, capability panels, docs UI). Cloudhal is a premium, community-facing product; its admin must read like the current Cloudflare dashboard. The implementation vocabulary is **Kumo** (`@cloudflare/kumo` 2.14, 54 components + 3 blocks) consumed through `@cloudhal/ui`. The official `kumo-design` skill (`.agents/skills/kumo-design`, installed from `cloudflare/kumo`) is part of this document; `apps/studio/test/design-rules.test.ts` enforces the mechanical rules in CI.

Verified sources: kumo-ui.com (installation, components-vs-blocks, blocks, component docs, registry), the Kumo repository (`sidebar.tsx`, blocks, the docs app shell), the kumo-design skill, Cloudflare dashboard documentation and changelogs (accounts/zones navigation, keyboard shortcuts 2026-05, navigation updates 2025–2026). Date: 2026-10-08.

## 1. Dashboard anatomy

The Cloudflare dashboard is: a **left sidebar** that is the primary navigation and whose contents switch between an *account surface* and a *zone surface* (a switcher sits at the top of the sidebar); **grouped, collapsible menus named by capability, not product**; a slim **top bar** with quick search (`/`, ⌘K) and the user menu; a **content area** with breadcrumbs, a page header (title, description, tabs, right-aligned actions), and **cards or tables**; resource lists carry a sticky right column with usage/help; empty states, skeleton loading, toasts and banners are system-wide.

Studio mirrors this one-to-one:

| Part | Kumo implementation |
|---|---|
| App shell | `Sidebar.Provider defaultOpen collapsible="icon" peekable mobileBreakpoint={768} className="h-svh"` → `<Sidebar>` + a content column `flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-kumo-overlay`. The provider must have a definite height because Kumo's `<aside>` is `h-full`; the column scrolls, the sidebar stays viewport-tall. Sidebar 16.25 rem expanded, 57 px icon rail. |
| Surfaces | *Account surface* (all sites) and *site surface* (one site); the switcher at the top of the sidebar is a `DropdownMenu` listing sites and "All sites". |
| Top bar | `header.sticky.top-0.z-10.h-12.shrink-0.border-b.border-kumo-hairline.bg-kumo-canvas` with `Sidebar.Trigger` (below `md`, the only way into the sheet), a ghost `Button` that opens `CommandPalette` (⌘K and `/`), language `Select`, user `DropdownMenu`. |
| Content container | `mx-auto max-w-[1400px] p-6 md:p-8 lg:px-10 lg:py-9` (copied from `ResourceListPage`). |
| Breadcrumbs | `Breadcrumbs` → `Breadcrumbs.Link href icon`, `Breadcrumbs.Separator`, `Breadcrumbs.Current loading`, `Breadcrumbs.Clipboard text` for ids. Always the first row of a detail page (inside `PageHeader`). |
| Page header | Block `PageHeader` (ours, from `kumo add PageHeader` + an `actions` slot and a controlled `tab`): `breadcrumbs`, `title`, `description`, `tabs`, `tab` (derive it from the route so sidebar navigation keeps it in sync; `defaultTab` only for local state), `onValueChange`, actions right-aligned and wrapping under the title on narrow screens. |
| Lists | `ResourceListPage` (`title`, `description`, `icon`, `usage`, `additionalContent`) + `Toolbar` (search/filter) + `LayerCard className="p-0"` + `Table` + `Pagination` + `Empty`. |
| Sections | `LayerCard` with `LayerCard.Secondary` (muted header row: title, badge, "View all") and `LayerCard.Primary` (body; `p-0` when it holds a `Table`). Never nested; never a bare `LayerCard` with hand-made headers. |
| Neutral panels | `Surface` (usage/code panels, login card). |
| Feedback | `Banner` (page/section), `Field`/`Input error` (inline), `Toasty` + `useKumoToastManager` (transient). |
| Confirmation | `ApprovalDialog` (ours, on `Dialog`) for publish/rollback; `DeleteResource` (block) for typed-name deletes; `LayerDialog.Alert` for other destructive alerts. Always rendered, controlled by `open`. |
| Forms & detail sheets | `LayerDialog.Root open onOpenChange` → `LayerDialog.Content` whose **direct** children are `Title`, optional `Description`, `Body`, optional `Actions` (Kumo throws otherwise; branch *inside* each part). Desktop dialog, bottom sheet on phones. |
| Code & config | `CodeHighlighted` from `@cloudhal/ui/code` (Shiki, lazy, `showCopyButton`) for snippets and JSON payloads; `ShikiProvider` lives at the app root (`CodeProvider`, localised copy labels). `Code` stays for one-line CLI hints in usage panels. |

Keyboard parity with the dashboard: `⌘K` / `/` open the palette; `t s` toggles the sidebar; `?` lists shortcuts (palette entry).

## 2. Page templates

### 2a. Resource list (sites, pages, articles, snapshots, agent runs)
```tsx
<ResourceListPage title description icon={<Icon size={32} />}
  usage={<Surface className="px-5 py-4">…CLI parity: <Code>cloudhal …</Code></Surface>}
  additionalContent={…quota / recent activity…}>
  <Toolbar size="sm" className="w-full max-w-md"><Toolbar.Input aria-label placeholder /><Toolbar.Button icon={Funnel} aria-label /></Toolbar>
  <LayerCard className="p-0"><Table><Table.Header><Table.Row><Table.Head/>…<Table.Head sticky="right"/></Table.Row></Table.Header>
    <Table.Body>{rows.map(r => <Table.Row key={r.id}><Table.Cell><Link href>{r.title}</Link></Table.Cell>…<Table.Cell><DropdownMenu>…</DropdownMenu></Table.Cell></Table.Row>)}</Table.Body></Table></LayerCard>
  <Pagination page perPage={25} totalCount setPage controls="full" />
</ResourceListPage>
```
Empty → `Empty icon={<Icon size={48} />} title description commandLine contents`. Loading → `SkeletonLine` rows inside the table.

### 2b. Resource detail / editor
`PageHeader` (breadcrumbs with `Clipboard` id, title, description, `tabs`, actions) → `Grid variant="2-1" gap="base"` → left: `LayerCard` sections (`Secondary` header with `Text as="h2" variant="heading"`, `Primary` body with `Input`/`InputArea`/`Select`/`TagInput` carrying their own `label`/`description`/`error`); right: status card, details card, danger zone (`Button variant="secondary-destructive"` → `DeleteResource`). Lifecycle = explicit actions (`StatusActions`), publish through `ApprovalDialog`.

### 2c. Settings / form
Same header; `Grid variant="1-2"` with `TableOfContents` on the left; one `LayerCard` per section, `Switch` for instant settings, `SensitiveInput` for secrets, `ClipboardText` for ids; sticky footer `border-t border-kumo-line` with `Button variant="primary" type="submit" loading`.

### 2d. Destructive flow
`Button variant="secondary-destructive"` → `DeleteResource open onOpenChange resourceType resourceName onDelete isDeleting errorMessage`. Non-typed destructive confirmations: `LayerDialog.Alert`. Never `{open && <Dialog/>}`.

### 2e. Auth
Centered `Surface` (`max-w-sm`, `ring ring-kumo-line rounded-xl px-6 py-5`), brand mark, `Text as="h1" variant="heading" size="lg"`, `Tabs` (sign in / create account), `Input label`, `Button variant="primary" loading` full width, `Banner variant="error" size="sm"` for failures. No sidebar.

### 2f. Editor with live preview (page and article editors)
`EditorLayout` (Studio) around the 2b form, with `PreviewPanel` (`@cloudhal/ui`) as the preview:
- **≥ xl (1280 px)**: two equal columns — the form (main sections, then the details card and danger zone) left, the preview right, `sticky top-16`, height `calc(100svh - 9rem)`. A ghost `PreviewToggle` (eye icon, `Tooltip`, `aria-pressed`) in the header actions hides it; the choice is remembered per browser and the layout falls back to `Grid 2-1`.
- **< xl**: underline `Tabs` "Edit | Preview" above the content; Edit shows the 2b `Grid 2-1`.
- `PreviewPanel`: `LayerCard` with a `Secondary` toolbar — heading, status slot (`Badge warning dot` "Unsaved changes" + `Tooltip` when the form is dirty), segmented `Tabs size="sm"` for Desktop/Tablet/Mobile (icon + label, label hidden on phones), `RefreshButton`, `LinkButton external` "open in new tab" — and a `Primary` viewport on `bg-kumo-recessed`. Desktop fills the panel; tablet (768) and mobile (390) render at their real width, scaled down only when the panel is narrower, framed with `ring ring-kumo-line`. Loading = `SkeletonLine` rows in an overlay with `role="status"`.
- The frame is always `<iframe sandbox="">` (no scripts, no same-origin, no forms) on the same-origin `/preview` endpoint; it reloads when the document's `rev` changes (i.e. after every successful save) and on demand.

### 2g. Credentials (agent keys) — create and one-time reveal
List page per 2a (`ResourceListPage`; name + key prefix (`start…`, mono) in one cell, scopes as `Badge`s with a `Tooltip` describing each, created/expiry, status dot, row `DropdownMenu`). The `usage` slot is a `LayerCard` "Connect an MCP client": endpoint and header as `ClipboardText`, segmented `Tabs` over ready-to-paste client configs in `CodeHighlighted`. `additionalContent` explains which tools always need a human.
Create = one `LayerDialog`, two states in the same parts:
1. **Form**: `Input` name (+description, inline `error` after a submit attempt), scopes as `Checkbox`es grouped in `ring-kumo-hairline` panels (Read / Write / Publish and roll back, each with a one-line hint, raw scope in mono next to the human label). New keys start read-only. Selecting a publish/rollback scope shows a `Banner variant="alert"`. Primary action "Create key" (`loading`), dismiss "Cancel"; dismissal disabled while pending. No `<form>` element around Kumo `Checkbox` (it is a `<button>` and would submit) — Enter in the name field submits.
2. **Reveal**: `Banner variant="alert"` "You won't see this key again", the key in `ClipboardText size="lg"`, the client config with the key filled in (`CodeHighlighted` + copy). Primary "I've stored the key". The plaintext lives only in component state and is dropped when the dialog closes.
Revoke = `DeleteResource` with `deleteButtonText` "Revoke key", success toast.

### 2h. Audit log (site › Activity)
Toolbar row: search `Toolbar` (tool, label, actor, skill) + filter `Toolbar` with `Select render={<Toolbar.Button />}` per facet (actor type, decision), "Clear filters" ghost button and a `RefreshButton` aligned right. `LayerCard p-0 overflow-x-auto` + `Table`, columns in reading order: Tool (localised imperative label, raw MCP name in mono below), Decision (`DecisionBadge`: filled, icon; allow = success, approval-required = warning, deny = error), Actor (`ActorBadge` + name), When (relative, absolute in `Tooltip`), Outcome (`OutcomeBadge`, dot), Skill, Snapshot (link to the diff), sticky chevron `Button` that opens the row. The whole row is clickable for pointer users; the chevron is the keyboard path. Paging is cursor-based: `useInfiniteQuery` over `nextBefore`, a footer with "Showing n of m loaded events" and a secondary "Load more" (`loading`), or "You've reached the first recorded event". Filters apply to loaded rows and say so in the filtered-empty state. Detail = `LayerDialog size="lg"`: reason as a `Banner` (error for deny, alert for approval), a `dl` of facts separated by `divide-kumo-hairline`, the input JSON in `CodeHighlighted`, "View changes" → snapshot diff. The overview page shows the five newest events in a compact "Recent activity" card with "View all".

### 2i. Snapshot diff
Opened from the snapshot row's ghost "Compare" button or `?diff=<snapshotId>` (Activity links there), so it is linkable and closes back to the plain URL. `LayerDialog size="xl"`: segmented `Tabs` choosing the base (previous snapshot / live version; plain text when only one exists), counts as `Badge`s (`n added` success, `n changed` warning, `n removed` error, with icons), then one section per non-empty change type: heading + count, `LayerCard p-0` + `Table` with the item (title linked to its editor, kind as an outline `Badge`, path and copyable id below; "No longer exists" for deleted nodes) and the revision (`rev a → b`). Empty states: "No differences", "Nothing to compare with".

## 3. Sidebar specification
```tsx
<Sidebar.Provider defaultOpen collapsible="icon" peekable mobileBreakpoint={768}>
  <Sidebar>
    <Sidebar.Header>{/* switcher: DropdownMenu listing sites + "All sites" */}</Sidebar.Header>
    <Sidebar.Content>
      <Sidebar.Group><Sidebar.GroupLabel>Overview</Sidebar.GroupLabel><Sidebar.Menu>
        <Sidebar.MenuButton icon={House} href active tooltip>Overview</Sidebar.MenuButton>
      </Sidebar.Menu></Sidebar.Group>
      <Sidebar.Group><Sidebar.GroupLabel>Content</Sidebar.GroupLabel><Sidebar.Menu>…Pages, Articles…</Sidebar.Menu></Sidebar.Group>
      <Sidebar.Group><Sidebar.GroupLabel>History</Sidebar.GroupLabel><Sidebar.Menu>…Snapshots, Activity…</Sidebar.Menu></Sidebar.Group>
      <Sidebar.Group><Sidebar.GroupLabel>Automation</Sidebar.GroupLabel><Sidebar.Menu>…Agents (collapsible: Keys and MCP → /agents, Skills "Soon"), Schedules "Soon"…</Sidebar.Menu></Sidebar.Group>
    </Sidebar.Content>
    <Sidebar.Footer>{/* user menu + Sidebar.Trigger */}</Sidebar.Footer>
    <Sidebar.Rail />
  </Sidebar>
  <main className="flex-1 bg-kumo-overlay">…</main>
</Sidebar.Provider>
```
Composition rules verified against Kumo's own `SidebarDemo.tsx`:
- The header switcher is **not** a `MenuButton` (that auto-wraps in `<li>` and renders a bullet outside a `Menu`); it is a plain row trigger for `DropdownMenu` with `w-(--anchor-width)` content and a check on the current item — `@cloudhal/ui` ships it as `SidebarSwitcher`.
- `Sidebar.Loading` replaces `Sidebar.Content` until navigation data resolves; never render an empty menu.
- Counts and states go in `Sidebar.MenuBadge` (`4`, `Soon`, `Beta`); unavailable items are `disabled`, never hidden.
- Sub-navigation uses `Sidebar.MenuItem` → `Sidebar.Collapsible` → `CollapsibleTrigger render={<Sidebar.MenuButton>… <Sidebar.MenuChevron /></Sidebar.MenuButton>}` → `CollapsibleContent` → `MenuSub`/`MenuSubButton`.
- The user menu is a `DropdownMenu` on a `MenuButton` inside `Sidebar.Footer`, next to `Sidebar.Trigger`; `Sidebar.Rail` closes the sidebar.

Rules from `sidebar.tsx`: `MenuButton` auto-wraps in `<li>`; `MenuItem` only around `Collapsible`; `tooltip` shows only when collapsed and not peekable; `GroupLabel` becomes a divider when collapsed; sub-menus via `Sidebar.Collapsible` + `MenuSub`/`MenuSubButton`; account↔site via `Sidebar.SlidingViews`; below `mobileBreakpoint` the sidebar is a sheet. Group names follow capabilities (Overview, Content, History, Automation, Settings), never product names.

## 4. Typography, spacing, colour
- **Text only through `Text`**: body 14 px (`size="base"`), `xs` 12 / `sm` 13 for captions, `lg` 16 only for headings; `variant="heading"` (16 px) and `size="lg"` (20 px) for page-level; page titles come from the blocks. Sentence case; product names title-cased; `bold` prop for emphasis; never `font-bold`, never `tracking-*`, never uppercase.
- **Spacing**: `gap-1.5` between a heading and its description, `gap-6` between blocks, card padding `px-5 py-4`, page container `p-6 md:p-8 lg:px-10 lg:py-9`, `max-w-[1400px]`.
- **Colour**: semantic tokens only — surfaces `bg-kumo-canvas|base|elevated|recessed|tint|overlay|contrast`, brand `bg-kumo-brand`, status `kumo-info|success|warning|danger` (+`-tint`), text `text-kumo-default|strong|subtle|inactive|placeholder|inverse|link`. No raw Tailwind colours, no `dark:` (Kumo themes via `light-dark()`; toggle with `data-mode="dark"`). Studio follows the OS scheme: an inline script in `index.html` sets `data-mode` on `<html>` before first paint and tracks `prefers-color-scheme`. The only fixed colours allowed are inside the preview frame, which shows the visitor-facing site (its own theme) on a light canvas.
- **Semantic badge colours**: decisions and outcomes use the status variants (success / warning / error); actor kinds and scope groups use tints (`info`, `secondary`, `outline`, `warning` for publish/rollback scopes) — never the saturated `purple`/`blue`/`neutral` fills, which out-shout the status column.
- **Edges**: `ring ring-kumo-line` (elevated) / `ring-kumo-hairline` (flat); never `border` + `shadow`; concentric radii (`rounded-xl p-1` → `rounded-lg`); sticky elements separate with `border-b border-kumo-line`; no `transition-colors` on hover.
- **Icons** (Phosphor): 16 px in nav, inline text, toolbars; 20 px icon-only buttons; 32 px list-page title; 48 px `Empty`; `weight="fill"` only for status (banners, toasts). Icon-only buttons need `aria-label` and `shape="square"`.

## 5. States
| State | Implementation |
|---|---|
| Loading | Prefer each component's own loading affordance: `Sidebar.Loading`, `Breadcrumbs.Current loading`, `Select loading`, `Button loading`, `InputGroup.Addon` with `Loader` for async validation; `SkeletonLine` rows only where no component owns the state (table bodies, text cards). Never a spinner-only page. |
| Empty | `Empty` with icon (48), title, description, `commandLine` for CLI parity, `contents` for the CTA. |
| Error | `Banner variant="error"` with `Banner.Action` retry; field errors via `Input error`; conflicts (409) explain "someone else changed this" and offer reload. |
| Success | `useKumoToastManager().add({ title, description, type: "success" })`; long jobs via `promise()`. |
| Confirm | `ApprovalDialog`, `DeleteResource`, `LayerDialog.Alert`; controlled by `open`. |
| Busy | `Button loading`, dismiss disabled while pending. |
| Not available | A feature the server does not run (404 from `/activity`, `/agent-keys`) is not an error: `Banner variant="secondary"` with an info icon explaining what to start or enable; create actions are disabled. |
| More data | Cursor APIs (`nextBefore`): footer with "Showing n of m loaded" and a secondary "Load more" (`loading`); client-side `Pagination` stays for fully loaded lists. |
| Time | Relative in lists ("5 minutes ago", `Intl.RelativeTimeFormat` in the active locale, re-rendered every 30 s) with the absolute timestamp in a `Tooltip`; absolute in detail views. |

## 6. Component usage matrix (all 54)
Studio must use each component where it fits; "later" means the surface does not exist yet (analytics, scheduling, agents) and the component is reserved for it.

| Component | Studio use |
|---|---|
| Autocomplete | tag/author suggestions (editor) |
| Badge | status pills; `Sidebar.MenuBadge` for "Soon/Beta"; scopes, change counts, diff kinds; Cloudhal wrappers `StatusBadge`, `DecisionBadge`, `OutcomeBadge`, `ActorBadge` carry `data-*` for tests |
| Banner | page/section errors (with `Banner.Action` retry), limits, warnings, one-time-secret notice, policy reasons |
| Breadcrumbs | every detail/editor page, `Clipboard` for ids |
| BubbleMap / Chart / ChoroplethMap / GlobeMap / SankeyChart / TimeseriesChart | analytics page (later) |
| Button | all actions; 6 variants; `loading` |
| ButtonGroup | split actions (Save ▾, Publish ▾) |
| Checkbox | bulk select (`Table.CheckCell`), non-instant settings, agent-key scopes (grouped) |
| ClipboardText | ids and keys in settings; MCP endpoint/header; the one-time key reveal (`size="lg"`) |
| CloudflareLogo | not used (Cloudflare brand) |
| Code | one-line CLI parity in usage panels |
| CodeHighlighted (`@cloudhal/ui/code`) | client config snippets, tool input JSON (`showCopyButton`) |
| Collapsible | advanced settings, run step details |
| Combobox | site/page pickers |
| CommandPalette | global ⌘K / `/` |
| DatePicker / DateRangePicker | scheduled publish, history filters |
| Dialog | small decisions (`ApprovalDialog`) |
| DropdownMenu | row menus, switcher, user menu, "More" actions |
| Empty | every list |
| Field | wraps controls that lack a `label` prop |
| Grid | detail/settings layouts |
| InlineCopyText | ids in dense cells |
| Input / InputArea / InputGroup | forms; `InputGroup.Addon` for slug/URL prefixes and async validation state |
| Label | standalone labels only |
| LayerCard | section cards (never nested) |
| LayerDialog | create/edit forms (create agent key), detail sheets (activity event), snapshot diff, destructive alerts |
| Link / LinkButton | in-table titles, inline links, "View changes", "Open in new tab" (`external`); hrefs with `?query` are split for TanStack Router by `AppLink` |
| Loader | inline busy only |
| MenuBar | editor formatting toolbar (later) |
| Meter | quota/usage in `additionalContent` |
| Pagination | every table |
| Popover | filters, help |
| Radio | exclusive settings |
| Select | filters, enums (never for status mutation) |
| SensitiveInput | API keys, secrets |
| Sidebar | app navigation (§3) |
| SkeletonLine | loading rows |
| Slider | agent parameters (later) |
| Surface | usage panels, login card |
| Switch | instant settings |
| Table | all lists |
| TableOfContents | settings sections |
| Tabs | page-header tabs (controlled from the route), segmented switches (device width, snippet format, diff base), underline Edit/Preview on narrow editors |
| TagInput | article tags |
| Text | all text |
| Toasty | root provider |
| Toolbar | search/filter rows (`Select render={<Toolbar.Button />}` for facets), snapshot actions |
| Tooltip | icon buttons, truncated cells, absolute time behind relative time, scope descriptions (`TooltipProvider` at root) |
| RefreshButton | reload a live list (activity) or the preview frame |
| PreviewPanel (Cloudhal block) | every editor (§2f); the only place an `<iframe>` may appear |

## 7. Anti-patterns (CI-enforced where mechanical)
Raw `<table>/<h1>/<button>/<input>/<select>/<a>/<ul>/<p>` in screens; hand-rolled sidebars, headers, cards; raw Tailwind colours; `dark:`; `font-bold`, `tracking-*`, uppercase headings; hover colour transitions; `border` + `shadow`; nested `LayerCard`; conditionally rendered dialogs; status mutation through `Select`; `DANGEROUS_className` to restyle Kumo; hard-coded English (every string through `useT()`; Kumo's own labels through `KumoLocaleProvider`); spinner-only pages; uniform `p-5` card padding; a raw `<iframe>` in a screen or any iframe without `sandbox=""`; fragments or conditionals directly inside `LayerDialog.Content`; a `<form>` around Kumo `Checkbox`/`Switch` (they are buttons and submit it); past-tense labels for audit events ("Deleted page" for a call that was denied) — use the tool's imperative name; a top bar that can shrink (`shrink-0` on sticky bars inside flex columns).

## 8. Review checklist
Before merging UI: screenshot against this document; run `pnpm --filter @cloudhal/studio test` (design rules); confirm every new string exists in `en.ts` and `tr.ts`; confirm the kumo-design rules (14px, sentence case, tokens) by reading the diff.
