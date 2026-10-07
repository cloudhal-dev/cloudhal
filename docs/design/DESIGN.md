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
| Top bar | `header.sticky.top-0.z-10.h-12.border-b.border-kumo-hairline.bg-kumo-canvas` with `Sidebar.Trigger` (mobile), a ghost `Button` that opens `CommandPalette` (⌘K and `/`), language `Select`, user `DropdownMenu`. |
| Content container | `mx-auto max-w-[1400px] p-6 md:p-8 lg:px-10 lg:py-9` (copied from `ResourceListPage`). |
| Breadcrumbs | `Breadcrumbs` → `Breadcrumbs.Link href icon`, `Breadcrumbs.Separator`, `Breadcrumbs.Current loading`, `Breadcrumbs.Clipboard text` for ids. Always the first row of a detail page (inside `PageHeader`). |
| Page header | Block `PageHeader` (ours, from `kumo add PageHeader` + an `actions` slot): `breadcrumbs`, `title`, `description`, `tabs`, `defaultTab`, `onValueChange`, actions right-aligned. |
| Lists | `ResourceListPage` (`title`, `description`, `icon`, `usage`, `additionalContent`) + `Toolbar` (search/filter) + `LayerCard className="p-0"` + `Table` + `Pagination` + `Empty`. |
| Sections | `LayerCard` with `LayerCard.Secondary` (muted header row: title, badge, "View all") and `LayerCard.Primary` (body; `p-0` when it holds a `Table`). Never nested; never a bare `LayerCard` with hand-made headers. |
| Neutral panels | `Surface` (usage/code panels, login card). |
| Feedback | `Banner` (page/section), `Field`/`Input error` (inline), `Toasty` + `useKumoToastManager` (transient). |
| Confirmation | `ApprovalDialog` (ours, on `Dialog`) for publish/rollback; `DeleteResource` (block) for typed-name deletes; `LayerDialog.Alert` for other destructive alerts. Always rendered, controlled by `open`. |

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
      <Sidebar.Group><Sidebar.GroupLabel>History</Sidebar.GroupLabel><Sidebar.Menu>…Snapshots…</Sidebar.Menu></Sidebar.Group>
      <Sidebar.Group><Sidebar.GroupLabel>Automation</Sidebar.GroupLabel><Sidebar.Menu>…Agents (Sprint 5), with Sidebar.MenuBadge "Soon"…</Sidebar.Menu></Sidebar.Group>
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
- **Colour**: semantic tokens only — surfaces `bg-kumo-canvas|base|elevated|recessed|tint|overlay|contrast`, brand `bg-kumo-brand`, status `kumo-info|success|warning|danger` (+`-tint`), text `text-kumo-default|strong|subtle|inactive|placeholder|inverse|link`. No raw Tailwind colours, no `dark:` (Kumo themes via `light-dark()`; toggle with `data-mode="dark"`).
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

## 6. Component usage matrix (all 54)
Studio must use each component where it fits; "later" means the surface does not exist yet (analytics, scheduling, agents) and the component is reserved for it.

| Component | Studio use |
|---|---|
| Autocomplete | tag/author suggestions (editor) |
| Badge | status pills; `Sidebar.MenuBadge` for "Soon/Beta" |
| Banner | page/section errors, limits, warnings |
| Breadcrumbs | every detail/editor page, `Clipboard` for ids |
| BubbleMap / Chart / ChoroplethMap / GlobeMap / SankeyChart / TimeseriesChart | analytics page (later) |
| Button | all actions; 6 variants; `loading` |
| ButtonGroup | split actions (Save ▾, Publish ▾) |
| Checkbox | bulk select (`Table.CheckCell`), non-instant settings |
| ClipboardText | ids and keys in settings |
| CloudflareLogo | not used (Cloudflare brand) |
| Code | CLI parity in usage panels, diffs, run logs |
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
| LayerDialog | create/edit forms, destructive alerts |
| Link | in-table titles, inline links (via `LinkProvider`) |
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
| Tabs | page-header tabs, segmented filters |
| TagInput | article tags |
| Text | all text |
| Toasty | root provider |
| Toolbar | search/filter rows, snapshot actions |
| Tooltip | icon buttons, truncated cells (`TooltipProvider` at root) |

## 7. Anti-patterns (CI-enforced where mechanical)
Raw `<table>/<h1>/<button>/<input>/<select>/<a>/<ul>/<p>` in screens; hand-rolled sidebars, headers, cards; raw Tailwind colours; `dark:`; `font-bold`, `tracking-*`, uppercase headings; hover colour transitions; `border` + `shadow`; nested `LayerCard`; conditionally rendered dialogs; status mutation through `Select`; `DANGEROUS_className` to restyle Kumo; hard-coded English (every string through `useT()`; Kumo's own labels through `KumoLocaleProvider`); spinner-only pages; uniform `p-5` card padding.

## 8. Review checklist
Before merging UI: screenshot against this document; run `pnpm --filter @cloudhal/studio test` (design rules); confirm every new string exists in `en.ts` and `tr.ts`; confirm the kumo-design rules (14px, sentence case, tokens) by reading the diff.
