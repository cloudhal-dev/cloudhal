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
Studio implements it as `SettingsLayout` + `SettingsSection` (`components/Settings.tsx`): the `TableOfContents` is sticky from `md` (hidden on phones, which scroll one column) and driven by Kumo's `useTableOfContentsActiveId`; items scroll the content column themselves (no router hash navigation), and a `#section` deep link lands on its card. Each section is a `LayerCard`: `Secondary` header (title, optional badge/actions right), `Primary` body with a muted description, controls carrying their own `label`/`description`/`error`, label/value rows as `dl` (`SettingRow`), and a footer row `border-t border-kumo-hairline` with the section's own actions (ghost "Discard" only while dirty, primary "Save changes" disabled until dirty). Sections save independently. A section holding a `Table` uses `flush` (no body padding). Text inputs in cards get `className="w-full"` so they never overflow the card at 375 px.
Saves that `PUT` a whole document send the latest cached copy plus the section's fields; a 409 shows `Banner variant="alert"` "This site changed somewhere else" with `Banner.Action` "Load latest" (the form keeps unsaved edits unless the server's values for those fields changed).

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

### 2g. Credentials (agent keys) — modes, create, one-time reveal
Every key has a **mode** (ADR-0015) — how independently the agent works; scopes stay the hard limit and a mode never grants more. Studio offers the four key modes, in order of autonomy: `plan` (read + preview), `manual` (every change waits), `edits` (default: edits free, publish/rollback/delete wait), `auto` (like edits, small article-only publishes go live without a person). `bypass` is never offered or sent for a key (the API answers 400); it is only *explained*, with `cloudhal mcp --mode bypass`.

List page per 2a (`ResourceListPage`): name + key prefix (`start…`, mono) in one cell; **Mode** column with `ModeBadge` (while elevated: `KeyModeCell`, see *Elevation* below); scopes — one outline `Badge` "Mode default · n scopes" (scopes in its `Tooltip`) when they equal the mode's prefill, otherwise the full `ScopeBadge` list (a `Tooltip` per scope), so customised keys stand out; created/expiry; status dot; row `DropdownMenu` (Change mode, Elevate temporarily, End elevation now while one runs, Copy key ID, separator, Revoke). The `usage` slot is a `LayerCard` "Connect an MCP client": endpoint and header as `ClipboardText`, segmented `Tabs` over ready-to-paste client configs in `CodeHighlighted` (the local tab uses `cloudhal mcp --mode edits`); the copy says the agent is told its mode when it connects. `additionalContent` is the compact **"How modes work"** `LayerCard`: one-line description, a compact `Table` (Mode × Content / Publish / Rollback, delete) whose cells are dot `Badge`s — Blocked neutral, Waits warning, Free success, "Small: free" success — each with a `Tooltip` explaining the rule, then the tools that always wait with a key (rollback, delete_page, delete_entry; label + mono name), a `ClockCountdown` line recommending a temporary elevation over a permanent Auto key, and the local bypass command. The table overrides Kumo's cell padding to `px-2` (first column `pl-5`) so four columns fit the 380 px side column in English and Turkish; keep labels short.

**Mode picker** (`ModePicker`, `components/AgentModes.tsx`) — the one way to choose a mode:
- `Radio.Group appearance="card"` (legend visually hidden via `Radio.Legend className="sr-only"`), one `Radio.Item` per key mode, iterating `KEY_MODES` (never a literal list; CI checks).
- Card `label`: mode icon (Phosphor: plan `Eye`, manual `UserCheck`, edits `PencilSimple`, auto `Lightning`, bypass `LockSimpleOpen`, 16 px, `text-kumo-subtle`), the name, a **risk `Badge`**: plan/manual `success` + `ShieldCheck` "Safest", edits `info` + `Star` "Recommended", auto `warning` + `Warning` "Use with care"; in the change dialog the key's current mode adds an outline "Current".
- Card `description`: one line on behaviour, then a `HandPalm` line "**Waits for you:** …".
- `BypassHint` under the cards; `edits` preselected.
- Choosing `auto` (where it is not already the mode) shows `AutoModeConfirm`: `Banner variant="alert"` with a `Lightning` icon explaining the low-risk rule (articles only, nothing removed, ≤ 20 changes, marked auto-approved, one-click rollback), and a `Checkbox` "I understand that this agent can publish without my approval" that must be ticked; the primary action shows an inline error otherwise. CI checks that every screen rendering `ModePicker` also renders `AutoModeConfirm`.

`ModeBadge`: filled, semantic tone by autonomy — plan `secondary`, manual `success`, edits `info`, auto/bypass `warning` — with the mode icon and a `Tooltip` (behaviour + what waits). `subtle` renders it `outline` for dense audit cells so the decision badge stays loudest. Carries `data-mode`.

Create = one `LayerDialog`, three states in the same parts (no fragments in `Content`):
1. **Mode** (step 1 of 2): the mode picker (+ auto consent, bypass hint). Primary "Continue".
2. **Name and scopes** (step 2 of 2): a `ring-kumo-hairline` summary row (Mode + `ModeBadge`, "Waits for you: …", secondary "Change" back to step 1), `Input` name (+description, inline `error` after a submit attempt), then `Collapsible` **"Advanced: scopes"** — closed by default, a "Customised" `Badge info` in the trigger when the set differs from the mode's prefill. Inside: "Prefilled for {mode} mode…" hint, ghost "Use the mode's scopes" reset when customised, the scope `Checkbox`es grouped in `ring-kumo-hairline` panels (Read / Write / Publish and roll back, hint per group, raw scope in mono), and `Banner variant="secondary"` when scopes the mode needs are missing. Changing the mode re-fills the scopes. The request sends `{name, mode}` and adds `scopes` only when customised (the server prefills from the mode). Primary "Create key" (`loading`); dismissal disabled while pending. No `<form>` element around Kumo `Checkbox` (it is a `<button>` and would submit) — Enter in the name field submits.
3. **Reveal**: `Banner variant="alert"` "You won't see this key again", the key in `ClipboardText size="lg"`, the client config with the key filled in (`CodeHighlighted` + copy). Primary "I've stored the key". The plaintext lives only in component state and is dropped when the dialog closes.

Change mode = `LayerDialog` from the row menu (`ChangeAgentModeDialog`): the mode picker starting at the current mode, bypass hint, auto consent, then — right above the action — a `ring-kumo-hairline` panel "Now [ModeBadge] → New [ModeBadge]" with "Applies on the agent's next call" (running calls finish in the old mode; the change is audited). Primary "Change mode" is disabled until the mode differs. A refusal (400) stays in the dialog as `Banner variant="error"` with the server's message; success closes it, shows a success toast "{name} now works in {mode} mode." and refetches the list.
Revoke = `DeleteResource` with `deleteButtonText` "Revoke key", success toast.

**Elevation** (ADR-0016) — a key works in a more autonomous mode for a while, then returns to its own mode by itself. The icon for anything time-boxed is Phosphor `ClockCountdown`.
- **Row menu** "Elevate temporarily" sits under "Change mode". For a key whose own mode is already `auto` nothing is above it (bypass is local), so the item is `disabled` with a `Tooltip` "Already in Auto…" (the tooltip hangs on a `render={<div />}` wrapper because a disabled Kumo menu item takes no pointer events). Never hidden.
- **Elevate dialog** (`ElevateAgentKeyDialog`, `LayerDialog size="base"`), top to bottom: an info `Banner size="sm"` "This replaces the elevation in force" when one runs (with its mode and end); "Own mode [ModeBadge]" with "Stays as it is"; a visible "Elevate to" label over `ModePicker only={modesAbove(own)}` — cards with nothing to offer are absent, the next mode up is preselected; `AutoModeConfirm` whenever the target is `auto` (also when replacing an Auto elevation); **Duration** as a `fieldset` with segmented `Tabs` presets 15 min / 1 hour (default) / 4 hours / 1 day / Custom — presets outside the server's `agentModes.elevation` bounds are dropped; Custom shows `Input type="number"` (label, "Between 5 minutes and 1 day." description, inline `error` "At least …"/"At most …" while typing, "Enter a number" after a submit attempt) next to a `Select` Minutes/Hours (hours accept a decimal comma, rounded to whole minutes); **Reason** `Input` (optional, ≤ 200 characters, "Shown in the audit log."). Right above the action, the `ring-kumo-hairline` summary panel: "Now [own] → Elevated [target]", then `ClockCountdown` + bold "Until 14:30 (in 1 hour), then back to Edits." (`elevationSummary`: today → time only, within the week → weekday + time, else date + time; the person's locale and time zone) and "Applies on the agent's next call. You can end it early from the key's menu." A 400 stays in the dialog as `Banner variant="error"` with the server's message; success closes it, toasts "Desk works in Auto mode until 14:30, then back to Edits." and refetches. Primary "Elevate" (`loading`), dismissal disabled while pending.
- **Mode cell while elevated** (`KeyModeCell`): the elevated `ModeBadge`, then an outline `Badge` with `ClockCountdown` "42 min left" (short units, nearest minute, at least 1) whose `Tooltip` reads "Elevated from Edits until 14:30 by you" plus the reason in quotes; under them `Text xs secondary` "Own mode: Edits", so the key's own mode stays recognisable. One line (`whitespace-nowrap`); the table scrolls sideways on phones. The page re-reads the clock every 30 s (`useNow`) and schedules a refetch one second after the earliest end (`useElevationExpiry`); a cell whose end has passed shows the own mode even before the refetch lands.
- **Summary banner** (`ElevatedKeysBanner`, top of the list, `role="status"`): "1 agent key is elevated" / "n agent keys are elevated", one line per key "Desk: Edits → Auto until 14:30", `Banner.Action` "End now" (or "End all now"). `alert` tone when any key is elevated to Auto, `default` otherwise.
- **End now** (row menu, banner) acts immediately with a success toast "Elevation ended · Desk is back in Edits mode." — no confirmation dialog: it only takes autonomy away, is audited, and elevating again is one dialog away (the same reasoning as approving a non-destructive request, §2m). Failures are error toasts.
- **Change mode while elevated**: an info `Banner size="sm"` at the top of the dialog, "Elevated to Auto until 14:30", whose description follows the selected card — "The elevation stays in force until 14:30, then the key works in Manual mode." while the new own mode is still below the elevation, "Auto reaches the elevated mode, so this change ends the elevation." otherwise (the server's rule). The list is updated from the returned summary as a whole, so an ended elevation disappears at once.

### 2h. Audit log (site › Activity)
Toolbar row: search `Toolbar` (tool, label, actor, skill) + filter `Toolbar` with `Select render={<Toolbar.Button />}` per facet (actor type, decision), "Clear filters" ghost button and a `RefreshButton` aligned right. `LayerCard p-0 overflow-x-auto` + `Table`, columns in reading order: Tool (localised imperative label, raw MCP name in mono below), Decision (`DecisionBadge`: filled, icon; allow = success, approval-required = warning, deny = error; an `auto`-mode publish that went live without a person — `autoCheck.lowRisk` on an allow row (older rows: reason starting "auto mode: published without approval") — adds `AutoApprovedBadge`, `warning` + `Lightning` "Auto-approved" with a localised tooltip; both via `DecisionCell`, also on the overview's recent activity), Actor (`ActorBadge` + name + the mode the call ran under as a subtle `ModeBadge`; people have none; a call made under a time-boxed elevation — `elevation: {from, until}` on the row — gets a `ClockCountdown` marker inside the badge (`role="img"`, label "Temporarily elevated") and its tooltip leads with "Temporarily elevated from Edits until 14:30"), When (relative, absolute in `Tooltip`), Outcome (`OutcomeBadge`, dot), Skill, Snapshot (link to the diff), sticky chevron `Button` that opens the row. The whole row is clickable for pointer users; the chevron is the keyboard path. Paging is cursor-based: `useInfiniteQuery` over `nextBefore`, a footer with "Showing n of m loaded events" and a secondary "Load more" (`loading`), or "You've reached the first recorded event". Filters apply to loaded rows and say so in the filtered-empty state. Search also matches the mode. Detail = `LayerDialog size="lg"`: reason as a `Banner` (error for deny, alert for approval; for an auto-approved publish an alert "Published without a person" with the article count, replacing the raw reason), a `dl` of facts (including **Mode** with a full `ModeBadge`, and for elevated calls an **Elevation** row: "Temporarily elevated from Edits until <absolute time>" with a muted line on the key's own mode) separated by `divide-kumo-hairline`, the input JSON in `CodeHighlighted`, "View changes" → snapshot diff. The overview page shows the five newest events in a compact "Recent activity" card with "View all".

### 2i. Snapshot diff
Opened from the snapshot row's ghost "Compare" button or `?diff=<snapshotId>` (Activity links there), so it is linkable and closes back to the plain URL. `LayerDialog size="xl"`: segmented `Tabs` choosing the base (previous snapshot / live version; plain text when only one exists), counts as `Badge`s (`n added` success, `n changed` warning, `n removed` error, with icons), then one section per non-empty change type: heading + count, `LayerCard p-0` + `Table` with the item (title linked to its editor, kind as an outline `Badge`, path and copyable id below; "No longer exists" for deleted nodes) and the revision (`rev a → b`). Empty states: "No differences", "Nothing to compare with".

### 2j. Account (account surface › Settings › Account; also in the user menu)
Settings template (§2c). **Profile**: initials avatar (`rounded-full bg-kumo-tint ring`), name `Input` (validated, Enter saves), email read-only `Input` with an explanation, actor ID (`user_…`, what activity and snapshots record) as `InlineCopyText`. **Password**: `PasswordField` — Kumo's `InputGroup` password pattern (`InputGroup.Input` + `InputGroup.Button` eye toggle with tooltip) — for current / new / confirm; errors appear after the first submit attempt and Better Auth codes map onto fields (`INVALID_PASSWORD` → current password); "Sign out of all other sessions" `Checkbox`, checked by default; no `<form>` (Kumo `Checkbox` is a button), Enter submits. **Active sessions**: flush `Table` (device icon + "Chrome on macOS" with the raw user agent in a `Tooltip`, "This device" `Badge info`, IP in mono, last active / signed in as `RelativeTime`, ghost "Sign out" on other rows) and a header action "Sign out other sessions"; both confirm through `ConfirmDialog` (`LayerDialog.Alert`). Better Auth lists sessions only for a sign-in younger than a day (`SESSION_NOT_FRESH`): that is `Banner variant="secondary"` with "Sign in again", not an error. **Studio access**: the sign-up policy from `/api/instance` as a `SettingRow` with a dot `Badge` and a plain explanation of the mode (owner only / closed / open / not reported; `open` adds `Banner variant="alert"`), how to change it, and "This server" features with On/Off dot badges.

### 2k. Site settings (site › Settings tab and the sidebar group "Settings")
Settings template inside the site tab layout. **General**: name `Input`, slug read-only in an `InputGroup` with a `/` addon, default language `Select` over `site.locales`, languages as outline `Badge`s, site ID `InlineCopyText`. **Domains**: flush `Table` (hostname in mono, role `Badge info` with a star for primary / outline "Alias", row `DropdownMenu`: Visit, Make primary, Remove domain) or `Empty`; an add row `InputGroup` with an `https://` addon and a secondary "Add domain" button. Input is normalised (scheme, path, case) and validated with the contract's hostname pattern; the first domain becomes primary, removing the primary promotes the next (the `ConfirmDialog` says which). Every change is a full-document `PUT` (CAS). A muted info line says DNS is configured separately. **Preview links**: `Radio appearance="card"` (current drafts / a snapshot), snapshot `Select` (label · time · live), page `InputGroup` with the primary host as addon, lifetime `Select` (1 h / 1 d / 7 d); the result is a `Surface` panel with the URL in `ClipboardText`, "Open link" `LinkButton external`, target `Badge` and expiry; without a domain the token is shown under `Banner variant="alert"`. A server without a preview secret (`features.previewLinks === false`, or 404) gets `Banner variant="secondary"` and no form.

### 2l. Skills (account surface › Agents › Skills)
`ResourceListPage` (`usage`: "How agents use skills" `LayerCard` — four numbered steps and a `Collapsible` `tools/call` example whose `_meta["cloudhal.skill"]` narrows the call; `additionalContent`: "Add your own"). Table: skill (name, two-line description, `skill://…/SKILL.md` as `InlineCopyText`), scopes (the agent-keys `ScopeBadge`; unknown scopes as mono outline badges), tools that need approval (warning `Badge` with a hand icon, localised tool name), reference count (file names in a `Tooltip`), chevron → `SkillDetailDialog` (`LayerDialog lg`: scopes with the "never more than the key" note, approvals, requirements, reference files, `ClipboardText` resource, `CodeHighlighted` call). Empty: `Empty` with a `commandLine`; a server without MCP: `Banner variant="secondary"`.

### 2m. Approvals (site › Activity › Approvals; sidebar History › Approvals with a count)
Agents with keys cannot approve their own publish / rollback / delete (ADR-0014): the request waits here for a person. Agents in `manual` mode (ADR-0015) also send every content edit here; those requests (`cause: "manual-mode"`; older servers: reason starting "manual mode:") are not shown with the server's terse reason but replaced by a localised sentence with a `ModeBadge mode="manual"` ("{agent} works in Manual mode, so this change waits for you: Update article.") plus a muted hint, and by "Manual mode: {tool}" in History; they approve directly (no confirmation dialog), like any non-destructive tool. Every other request shows its `mode` as a subtle `ModeBadge` before the prompt; an `auto`-mode publish the low-risk rule held back (`autoCheck.lowRisk === false`) adds a muted line saying why in the person's language ("Auto mode publishes small article updates on its own. This one waits for you because it changes pages or site settings."). Activity and Approvals share the Activity tab through a segmented `Tabs` switch (`ActivityViews`, count `Badge warning`); the sidebar item and the overview show the same count from one query, polled every 15 s (`refetchInterval`) only while the site shell is mounted; a 404 (approvals off) stops polling and shows `Banner variant="secondary"`.
- **Waiting for you**: one `LayerCard p-0` with `divide-y` rows (no nested cards): `ToolCell` (localised label + raw name), `ActorCell` (`ActorBadge` + name), Deny (secondary) / Approve (primary) with `loading`, the server's prompt as **plain text** (it can quote agent-written titles; never HTML — CI checks there is no `dangerouslySetInnerHTML`), requested / expires as `RelativeTime` with a warning `Badge` under an hour, and `Collapsible` arguments in `CodeHighlighted`. Ordered by expiry. Empty: `Empty` "Nothing is waiting for you".
- **Approve** on `publish`, `rollback`, `delete_page`, `delete_entry` opens `ApproveRequestDialog` (`LayerDialog`): the prompt in a `Surface`; for publish the approximate changes (live snapshot → newest snapshot: count badges + "View changes", labelled as an approximation because edits after the newest snapshot are not counted); for rollback the target snapshot with "View changes"; for deletes the target id; and an info `Banner` "Single use, for the site as it is now" (void if anything changes before the agent calls again). Other tools and Deny act immediately with a toast.
- **409** (decided, used or expired meanwhile): error toast "This request is no longer pending", the dialog closes, the list refetches.
- **History**: `Table` with request (tool + truncated prompt in a `Tooltip`), status dot `Badge` (approved success, denied error, used neutral, expired warning), agent, requested, decided (time + "by you" or the deciding actor id).
- **Overview**: while requests wait, `Banner variant="alert"` with a hand icon and `Banner.Action` "Review requests" above the cards.

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
      <Sidebar.Group><Sidebar.GroupLabel>History</Sidebar.GroupLabel><Sidebar.Menu>…Snapshots, Activity, Approvals (pending count)…</Sidebar.Menu></Sidebar.Group>
      <Sidebar.Group><Sidebar.GroupLabel>Automation</Sidebar.GroupLabel><Sidebar.Menu>…Agents (collapsible: Keys and MCP → /agents, Skills → /agents/skills), Schedules "Soon"…</Sidebar.Menu></Sidebar.Group>
      <Sidebar.Group><Sidebar.GroupLabel>Settings</Sidebar.GroupLabel><Sidebar.Menu>…Settings → site settings (account surface: Account → /account)…</Sidebar.Menu></Sidebar.Group>
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
| Polling | Counts that must stay current (pending approvals) use `refetchInterval` (15 s) on a query owned by the surface shell, so polling stops when the surface unmounts; a 404 stops it for good. |
| Re-authenticate | Actions the auth server allows only after a recent sign-in (the session list) show `Banner variant="secondary"` with a "Sign in again" action, never an error. |
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
| Collapsible | approval arguments, the skills `tools/call` example, "Advanced: scopes" when creating an agent key; run step details (later) |
| Combobox | site/page pickers |
| CommandPalette | global ⌘K / `/` |
| DatePicker / DateRangePicker | scheduled publish, history filters |
| Dialog | small decisions (`ApprovalDialog`) |
| DropdownMenu | row menus, switcher, user menu, "More" actions |
| Empty | every list |
| Field | wraps controls that lack a `label` prop |
| Grid | detail/settings layouts |
| InlineCopyText | ids in dense cells |
| Input / InputArea / InputGroup | forms; `InputGroup.Addon` for slug/URL/host prefixes (`/`, `https://`, the preview host) and async validation state; `InputGroup.Button` for the password show/hide toggle (`PasswordField`) |
| Label | standalone labels only |
| LayerCard | section cards (never nested) |
| LayerDialog | create/edit forms (create agent key), detail sheets (activity event), snapshot diff, destructive alerts |
| Link / LinkButton | in-table titles, inline links, "View changes", "Open in new tab" (`external`); hrefs with `?query` are split for TanStack Router by `AppLink` |
| Loader | inline busy only |
| MenuBar | editor formatting toolbar (later) |
| Meter | quota/usage in `additionalContent` |
| Pagination | every table |
| Popover | filters, help |
| Radio | exclusive settings; `appearance="card"` for the preview-link target and the agent mode picker (§2g) |
| Select | filters, enums (never for status mutation) |
| SensitiveInput | API keys, secrets |
| Sidebar | app navigation (§3) |
| SkeletonLine | loading rows |
| Slider | agent parameters (later) |
| Surface | usage panels, login card |
| Switch | instant settings |
| Table | all lists |
| TableOfContents | settings sections (`SettingsLayout`, driven by `useTableOfContentsActiveId`) |
| Tabs | page-header tabs (controlled from the route), segmented switches (device width, snippet format, diff base, elevation duration presets), underline Edit/Preview on narrow editors |
| TagInput | article tags |
| Text | all text |
| Toasty | root provider |
| Toolbar | search/filter rows (`Select render={<Toolbar.Button />}` for facets), snapshot actions |
| Tooltip | icon buttons, truncated cells, absolute time behind relative time, scope descriptions (`TooltipProvider` at root) |
| RefreshButton | reload a live list (activity) or the preview frame |
| PreviewPanel (Cloudhal block) | every editor (§2f); the only place an `<iframe>` may appear |

## 7. Anti-patterns (CI-enforced where mechanical)
Raw `<table>/<h1>/<button>/<input>/<select>/<a>/<ul>/<p>` in screens; hand-rolled sidebars, headers, cards; raw Tailwind colours; `dark:`; `font-bold`, `tracking-*`, uppercase headings; hover colour transitions; `border` + `shadow`; nested `LayerCard`; conditionally rendered dialogs; status mutation through `Select`; `DANGEROUS_className` to restyle Kumo; hard-coded English (every string through `useT()`; Kumo's own labels through `KumoLocaleProvider`); spinner-only pages; uniform `p-5` card padding; a raw `<iframe>` in a screen or any iframe without `sandbox=""`; fragments or conditionals directly inside `LayerDialog.Content`; a `<form>` around Kumo `Checkbox`/`Switch` (they are buttons and submit it); past-tense labels for audit events ("Deleted page" for a call that was denied) — use the tool's imperative name; a top bar that can shrink (`shrink-0` on sticky bars inside flex columns); rendering agent- or server-supplied text (approval prompts, skill descriptions) as HTML — always plain `Text`, never `dangerouslySetInnerHTML`; letting a self-approved action skip the person (approvals are decided only in Studio, ADR-0014); offering or sending `bypass` for an API key, a mode list that is not `KEY_MODES`, or letting a key become `auto` without the explicit consent checkbox (ADR-0015); offering an elevation to a mode that is not above the key's own, or elevating to `auto` without that same checkbox (ADR-0016).

## 8. Review checklist
Before merging UI: screenshot against this document; run `pnpm --filter @cloudhal/studio test` (design rules); confirm every new string exists in `en.ts` and `tr.ts`; confirm the kumo-design rules (14px, sentence case, tokens) by reading the diff.
