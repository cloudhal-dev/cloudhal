# RFC-0025: Site chrome and overlays
- Status: Accepted (2026-10-16; the directions were decided in the companion R&D report)
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-16
- Related:
  - RFC-0003 (menus), RFC-0004 (media and `ImageRef`), RFC-0017 (theme settings), RFC-0020 (surfaces, the interaction runtime), RFC-0021 (`render_page`), RFC-0023 (tokens and surfaces), RFC-0024 (motion, the pause control);
  - `docs/design/site-chrome-and-overlays.md`, the R&D report: platform status, accessibility patterns and the decisions this RFC takes over (sources there).

## Summary
Every Cloudhal site has the same top and bottom. The blog theme's `Base.astro` hard-codes:
- a text site name, a menu and a search box;
- a "Built with Cloudhal" footer;

and agents cannot change any of it. There are no overlays either: no dialog, drawer, popover, tooltip or lightbox.

This RFC makes the **header and footer structured site data**:
- layouts, behaviors and mobile styles as enums;
- slots for the logo, menus, actions, footer columns, social links and the legal row;
- an announcement bar and a consent bar.

The theme renders it with accessibility built in. It also adds **overlay components** to the catalog, opened by a button through the platform's Invoker Commands and working without JavaScript.

Agents choose; the renderer guarantees landmarks, focus handling and contrast.

## Motivation
- **Sameness and lost brand.** A site with a logo, a call to action in the header and a footer of link columns looks like a business; ours look like a blog template. Builders offer header and footer variants as a first choice (Squarespace, Wix, Webflow, Framer; see the report).
- **Agents cannot do it.** The header and footer are theme code. An agent building a landing page cannot add a "Start free" button to the header, a transparent header over the hero, or a newsletter footer.
- **Phones.** The header wraps; there is no menu button.
- **Overlays are a common need done badly.** Video lightboxes, terms in a sign-up flow, filters in a drawer and definitions in a popover are done badly by hand: focus traps, Esc and scroll locking.
  - The platform now provides most of it: `<dialog>` is widely available, the Popover API is Baseline 2024, Invoker Commands Baseline 2025 and anchor positioning Baseline 2026.
  - A small set of catalog components can use the platform and cover the gaps.

## Proposal

### 1. Data: `Site.brand`, `Site.chrome`, `Page.chrome`
New optional fields (a contract change; schema subset; enums and references only).

```jsonc
// Site
"brand": {
  "logo": ImageRef,            // with assetId (RFC-0004); the site name as text when absent
  "logoDark": ImageRef,        // for dark mode, when the logo needs one
  "logoHeight": "s" | "m" | "l",
  "social": [ { "network": "x" | "bluesky" | "mastodon" | "github" | "linkedin" | "instagram" | "facebook" | "youtube" | "tiktok" | "threads" | "rss" | "email", "href": "…" } ]   // ≤ 8
},
"chrome": {
  "header": {
    "layout": "logo-left" | "logo-left-nav-center" | "centered" | "split" | "minimal",
    "behavior": "static" | "sticky" | "hide-on-scroll" | "fixed",
    "shrink": false,
    "overHero": "solid" | "transparent",
    "width": "content" | "wide" | "full",
    "surface": "plain" | "muted" | "raised" | "inverse" | "brand",
    "mobileStyle": "dropdown" | "drawer-start" | "drawer-end" | "fullscreen",
    "collapseAt": "sm" | "md" | "lg" | "always",
    "nav": "primary",                       // a menu key (RFC-0003)
    "utility": "utility",                   // an optional second menu, shown small
    "actions": [ { "kind": "button" | "search" | "locale" | "theme-toggle" | "motion-toggle", "label": "…", "href": "…", "variant": "primary" | "secondary" } ]   // ≤ 3
  },
  "footer": {
    "layout": "simple" | "columns" | "cta-band" | "minimal",
    "surface": "plain" | "muted" | "inverse",
    "tagline": "…",
    "columns": [ { "heading": "…", "menu": "footer-product" } ],   // ≤ 5
    "ctaHeading": "…", "ctaLabel": "…", "ctaHref": "…",           // for cta-band
    "social": true,                          // Site.brand.social as labelled icon links
    "copyright": "© {year} {site}",          // the only placeholders
    "legal": "legal",                        // a menu key
    "extras": [ "locale" | "theme-toggle" | "motion-toggle" ],
    "credit": true                           // "Built with Cloudhal"; the owner may turn it off
  },
  "announcement": { "id": "spring-2026", "text": "…", "label": "…", "href": "…", "tone": "info" | "brand" | "warning", "dismissible": true },
  "consent": { "mode": "none" | "notice" | "choices", "policy": "/privacy" }
}
// Page
"chrome": { "header": "default" | "transparent" | "hidden", "footer": "default" | "minimal" | "hidden" }
```

- **Flat shapes.** Header and footer fields are flat (`mobileStyle`, `ctaLabel`) rather than nested, so Studio's generated form (`BlockPropsForm`) and agents edit them the same way. A `chromeSchema` in `@cloudhal/core-ts/chrome` mirrors the contract as a form schema.
- **Menus stay where they are.** The header and footer name menu keys; items are not copied.
- **Defaults reproduce today.** Without `chrome`, the theme renders today's header and footer: the site name, the primary menu, search, the footer menu or RSS, and the credit.

### 2. Rendering (the blog theme; any theme through `@cloudhal/astro-renderer/chrome`)
- **Always emitted:**
  - a skip link to `#main` as the first focusable element;
  - one `<header>`, `<nav aria-label>` named from the menu, one `<main id="main">` and one `<footer>`;
  - disclosure buttons (never `role=menu`) for groups;
  - `html { scroll-padding-top: var(--ch-header-h) }` for sticky and fixed headers;
  - a reserved header height, so nothing shifts.
- **Header layouts** arrange the logo, menu and actions. Header and footer colors come from RFC-0023 surfaces.
- **Transparent over a hero** is allowed only when the page's first band has a loud surface (`inverse`, `brand`, `accent`, `gradient`) or an image with a scrim. The header then takes that surface's text role, so contrast holds, and `render_page` checks it.
- **Behaviors:**
  - `sticky` is `position: sticky`, with a "stuck" style through `scroll-state()` where supported.
  - `hide-on-scroll` uses the motion module's scroll direction (decision 3 of the report). It is off at motion `none` and under reduced motion.
  - `shrink` animates padding through custom properties, never the layout box.
- **Mobile.** A drawer or fullscreen menu is a modal `<dialog>` opened by `command="show-modal"`; `dropdown` is a disclosure. Without Invoker Commands the button is a link to `/menu`, a server-rendered page of the same menus.
- **Footer.** Columns are labelled `nav`s. Social links are icon links with accessible names. `{year}` and `{site}` are filled by the renderer. The pause control (RFC-0024) and other extras go in the legal row.
- **Announcement.** Rendered on the server above the header. A dismissal sets the first-party cookie `ch_dismiss=<id>`, so the server leaves it out next time and nothing shifts.
- **Consent.** A non-modal bottom bar (`popover="manual"`), or a modal dialog for `choices`. It is padded so it never covers the focused element (WCAG 2.4.11), and the choice is kept in a first-party cookie.

### 3. Overlay components
New catalog components. Their children are their content, and they render in the top layer.

| Component | Props | Native | Fallback |
|---|---|---|---|
| `Dialog` | `title` (required), `size`, `dismiss` (`any`/`closerequest`/`explicit`), `fallbackHref` | `<dialog>` + `command="show-modal"`, `closedby` | trigger is a link to `fallbackHref` without JavaScript; the runtime closes on backdrop click where `closedby` is missing (Safari) |
| `Drawer` | `title`, `placement` (start/end/bottom), `size` | modal `<dialog>` at the edge | as `Dialog` |
| `Popover` | `placement`, `width` | `popover="auto"` + `popovertarget`/`toggle-popover`, anchored to its trigger | centered popover |
| `Tooltip` | `text` (≤ 160, no interactive content) | `popover="hint"` + `interestfor` | the runtime opens it on focus and hover (Safari); never the only way to the information |
| `Lightbox` | `items` (assets, alt required), `start` | modal `<dialog>` with `--next`/`--prev` commands | thumbnails link to the full images |

- **Opening.** `Button` gains `onClick: {action: "open" | "close", target}`. The renderer maps it to `command`/`commandfor` (plus `popovertarget`) with `aria-controls`, keeping `href` as the fallback.
- **The checks:**
  - every target exists in the same surface and is an overlay;
  - dialogs and drawers have titles;
  - tooltips hold no interactive content;
  - at most 3 overlays per surface;
  - **no overlay opens without a user action** (not on load, on a timer or on exit intent).
- **The runtime's part** (decided in the report):
  - a first-party shim for the three built-in commands on browsers before December 2025, loaded only on pages with overlays;
  - focus returned to the trigger;
  - backdrop-click closing in Safari;
  - `aria-expanded` on triggers;
  - lightbox navigation;
  - focus and hover tooltips in Safari.
- **Scroll lock** uses `html:has(dialog:modal)` in CSS.
- **Motion.** Entrances and exits use `@starting-style`, at the RFC-0024 levels.
- **A2UI.** `Modal` now maps to `Dialog`.

### 4. Agents, MCP and CLI
- **MCP tools:**
  - `get_chrome` (read): the brand, chrome and page overrides with their allowed values;
  - `set_chrome` and `set_brand`: changes with a person's approval, like `set_theme_settings`;
  - `get_design` summarizes them.
- **Catalog.** `catalogPrompt` teaches the overlays and the `open` action.
- **`render_page` checks:**
  - `skip-link`;
  - `landmarks`;
  - `focus-obscured` (sticky header and bars never cover the focused element);
  - `header-contrast` (transparent headers);
  - `overlay-open`: each overlay opened through its trigger, focus moves in, Esc closes it, focus returns, and its contrast passes.
- **CLI.** `cloudhal chrome get` and `cloudhal chrome set --file chrome.json`.
- **Studio.** A "Header and footer" section in Site settings (the generated form from `chromeSchema`, plus the logo picker), next to Navigation.
- **The site-design skill** gains chrome recipes per kind of site.

### Invariants
1. Agents and people choose enums, menu keys, assets and short texts. Markup, CSS and scripts in the chrome never come from them.
2. Every page has a skip link, one header, one main, one footer and labelled navigation, whatever the settings.
3. A sticky or fixed header and every bar leave the focused element visible; a transparent header keeps its contrast.
4. The site works without JavaScript: menus, overlays (through their fallback links) and dismissals.
5. No overlay opens without the reader asking.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Header and footer as surfaces | Full freedom | No guaranteed landmarks, focus or contrast; every agent reinvents navigation | The report's decision 4: structured, with a free region in the footer later |
| Theme settings (RFC-0017) for the chrome | No contract change | Scalars only: no lists (actions, columns, social), no assets | The chrome needs lists and images |
| Page-level `overlays` list | One place per page | A second content model beside surfaces | Overlays as catalog components reuse checks, streaming and the outline |
| Hand-rolled dialogs (`div` + JavaScript) | Works everywhere | Focus traps and Esc by hand, inert backgrounds missing | The platform does it now, with small fallbacks |

## Compatibility & migration
- **Contract.** `Site.brand`, `Site.chrome` and `Page.chrome` are optional new fields (`schemaVersion` unchanged); `pnpm gen` updates TypeScript and Rust. The overlay components and the `open` action are catalog features.
- **Existing sites** keep today's header and footer until someone sets `chrome`. The defaults render the same markup, plus the skip link and the `main` id.
- **Rollback.** A renderer that does not know `chrome` ignores it, and the store keeps it.

## Security & policy impact
- **Scopes and approvals.** `set_chrome` and `set_brand` need `site:write` and a person's approval: the chrome is on every page. Menus keep their own tools and approvals.
- **No free-form markup.** Texts are escaped; links pass the existing safe-link check; logos are assets (RFC-0004 scanning).
- **Consent** is a legal choice. Agents may propose it (`get_design` suggests `notice` when a page embeds third-party content), and a person sets it.
- **The Invoker Commands shim** is first-party and loaded only where needed, so the CSP is unchanged.

## Rollout
| Phase | Scope |
|---|---|
| 25a | `Site.brand`, `Site.chrome.header`/`footer`, `Page.chrome` (contract); the blog theme's header and footer from data (layouts, sticky, logo, actions, columns, social, legal, credit), skip link and landmarks; `get_chrome`/`set_chrome`/`set_brand`; `cloudhal chrome`; Studio section |
| 25b | Mobile menu (drawer, fullscreen, dropdown, `/menu` fallback), popover submenus, `hide-on-scroll`, `shrink`, transparent over hero with the contrast rule; `skip-link`, `landmarks`, `header-contrast`, `focus-obscured` checks |
| 25c | Overlay components, the `open`/`close` actions, the runtime additions and the shim, the `overlay-open` check |
| 25d | Announcement and consent bars, toasts, `mega` menu items (RFC-0003 amendment), the footer's optional surface region |

## Open questions
None; the report decided them:
- the shim with a link fallback;
- Safari fallbacks now;
- hide-on-scroll by script with CSS where supported;
- an optional footer surface region;
- consent `none` by default, suggested when needed.

## Status
- **25a shipped.**
  - **Contract.** `Site.brand`, `Site.chrome` (header, footer; announcement and consent are in the contract, rendered from 25d) and `Page.chrome` are optional; `pnpm gen` updated TypeScript and Rust, with fixtures.
  - **Core.** `@cloudhal/core-ts/chrome`:
    - `resolveChrome` (defaults reproduce the former header and footer, so sites that never set `chrome` render the same);
    - `checkChrome` (menus that exist, buttons with label and link, an action kind once, a complete cta-band, only `{year}`/`{site}`);
    - `chromeSchemas` (en/tr form schemas);
    - `brandFromForm`/`brandToForm`/`logoAsset` (logos as `asset:<id>` in forms, `ImageRef`s with the asset's URL and size on the site);
    - `applyChromeForm`, shared by the API and the CLI.
  - **Theme.** The blog theme draws its header and footer from the chrome:
    - five header layouts and three widths, `sticky` (`hide-on-scroll` and `fixed` act as sticky until 25b), surfaces, a logo with a dark-mode variant, button and search actions;
    - four footer layouts with labelled column menus, social links as text, copyright, the legal menu and the credit;
    - a skip link, `main#main` and `scroll-padding-top` under sticky headers.
    - A page's `chrome` hides the header or footer, thins the footer, or marks the header transparent (its fill on scroll comes in 25b).
  - **Agents.**
    - `get_chrome` (site:read);
    - `set_chrome` and `set_brand` (site:write, approval; merges, null removes);
    - `update_page` accepts `chrome` and `motion` (null removes).
    - 96 MCP tools.
  - **People.**
    - Studio › Settings › Header and footer: header, footer and brand segments from the same schemas, logos from the media library; its words live in the `appearance` lazy namespace (formerly `appearanceColors`), so the first load stays at 475.0 kB.
    - REST `GET/PUT /api/sites/:id/chrome` (content:read / site:settings).
    - `cloudhal chrome get|set --file`.
  - **Gap.** Logos are not yet counted as asset uses (deleting a logo asset does not warn); this lands with 25b. (Closed in 25b.)
- **25b shipped.**
  - **Phone menu.** Below `collapseAt` (always for the `minimal` layout) the bar's menus and search move behind a Menu control:
    - `dropdown` is a `<details>` disclosure, with no script;
    - `drawer-start`, `drawer-end` and `fullscreen` are a modal `<dialog>` opened from a link to `/menu`.
    - Without the chrome module, or before it loads, the link opens `/menu`: a server-rendered, noindex page with the same menus (any site page at `/menu` wins).
    - The dialog closes with Escape, its Close button (`form method="dialog"`, no script), a click on the backdrop or a link; the browser returns focus.
    - We kept a link rather than `command="show-modal"`. It degrades to `/menu` everywhere, and the module adds `role=button`, `aria-haspopup` and `aria-expanded`.
  - **Submenus.** A group in the bar is a native popover (`popover="auto"` + `popovertarget`) placed by CSS anchor positioning (the invoker is the implicit anchor). The module places it where that is missing. Groups in the phone menu stay disclosures.
  - **Chrome module.** `/_cloudhal/chrome.1.js` is about 1.1 kB gzipped and loads only when the header needs it:
    - it keeps `--ch-header-h`;
    - it sets `data-ch-scrolled`;
    - `hide-on-scroll` hides the header on the way down, but never at motion `none`, under reduced motion, or with keyboard focus in the header;
    - it handles the menu dialog;
    - it closes an open disclosure on Escape or a click elsewhere;
    - it places popovers where anchor positioning is missing.
  - **Shrink.** It moves the header and its row with `translate`, never their box, so nothing below shifts. `fixed` behaves like `sticky`.
  - **Transparent over a hero.** `heroSurface(page)` finds a first band painted `inverse`, `brand`, `accent` or `gradient` (the root or its first child, three levels at most; an old `tone` counts).
    - `resolveChrome` keeps the header solid anywhere else.
    - The header takes that surface's text role (`data-over`), and the primary button swaps to stay visible on a brand hero.
    - It fills with the page surface once scrolled. The first band starts under it and keeps its own room.
    - An image with a scrim does not count yet.
  - **Checks.** `render_page` adds four checks: `skip-link`, `landmarks`, `header-contrast` (a transparent header's text against the band at the top) and `focus-obscured` (tabbing back up, a sticky header never covers the focused element).
  - **Asset uses.** The brand's logos are asset uses (`asset_refs`, node kind `site`, fields `brand.logo` and `brand.logoDark`): canonical `ImageRef`s, delete refused while used, retired assets refused. Studio's file page lists "Site logo" and links to the settings section.
  - **Footer contrast.** On the muted surface the footer's text is `text-muted`, the role checked against `surface-muted`; the old zinc-500 was 4.4:1.
- **25c shipped.**
  - **Components.** `Dialog` (title, size, dismiss, fallbackHref), `Drawer` (title, placement, size), `Popover` (placement, width), `Tooltip` (text, `for` a Button or Link) and `Lightbox` (up to 24 items with asset and alt, start) join the catalog.
    - A `Button`'s `onClick` gains `open` (target) and `close` (its own overlay, or target).
    - `catalogPrompt` teaches them.
    - A2UI `Modal` imports as a `Dialog` with the Button that opens it, and a `Dialog` or `Drawer` exports as a `Modal`.
  - **Checks.**
    - Targets are overlays of the same surface.
    - A close button is inside an overlay or names one.
    - Dialogs and drawers have titles.
    - Tooltips point at a Button or Link and hold no children.
    - No modal opens inside another.
    - At most 3 dialogs, drawers and popovers per section. A Lightbox's thumbnails are content and don't count.
    - At most 8 tooltips.
    - There is no prop that opens an overlay by itself, so nothing opens on load or on a timer.
  - **Rendering.** Everything is native and needs no script in current browsers:
    - dialogs and drawers are `<dialog>` with `command="show-modal"`/`close` and `closedby` (`explicit` → `none`);
    - a Dialog with `fallbackHref` opens from a real link;
    - popovers use `popover="auto"` + `popovertarget`, anchored to their trigger;
    - tooltips use `popover="hint"` + `interestfor` and `aria-describedby`;
    - a Lightbox's thumbnails link to their images and open a dialog that moves with `--next`/`--prev` commands.
    - Buttons that only open or close overlays no longer make a surface interactive, so the interaction runtime and data are not loaded for them.
  - **Overlay module.** `/_cloudhal/overlay.1.js` is about 1.5 kB gzipped and loads only with an overlay:
    - it shims Invoker Commands, `closedby` and `interestfor` where they are missing;
    - it opens a dialog from its fallback link;
    - it keeps `aria-expanded` on triggers;
    - it handles lightbox navigation (buttons and arrow keys);
    - it places popovers and tooltips where anchor positioning is missing.
  - **Theme.** The scroll lock is `html:has(dialog:modal)`. Entrances use `@starting-style` and follow the motion level; there are none under reduced motion.
  - **Check.** `render_page` adds `overlay-open`: each overlay is opened through its trigger, focus moves in, it closes, focus returns, and its text contrast is checked. An overlay nothing opens is reported. Screenshots of open overlays are left for later.
  - **25b fix.** The drawer and full-screen menu dialog showed when closed on wide screens; only an open one is now laid out.
- **25d shipped.**
  - **Contract.**
    - `chrome.footer.region` is one section, refused unless it is a surface, and checked like a page's surfaces.
    - Menu items gain `display: "mega"` (an RFC-0003 amendment), allowed only on a top-level item with children.
    - The MCP menu tools and `update` operations carry it. Studio's menu editor does not edit it yet.
  - **Announcement.** A bar above the header (`role=region`, a tone, an optional link). Its close button writes `ch_dismiss=<id>` (the last five ids, a year, `SameSite=Lax`). A new `id` shows a new bar.
    - **Changed from the design:** the edge cache does not vary on cookies, so the server cannot leave a closed bar out. Instead, `/_cloudhal/prefs.1.js` (a 263 B classic script in `<head>`, loaded only with a dismissible bar or a consent bar) reads the cookies and marks the root (`data-ch-announcement-dismissed`, `data-ch-consent`). CSS hides the bar before the page paints, so nothing shifts.
  - **Consent.** `notice` (OK) or `choices` (allow all, only essential): a fixed bottom bar with the privacy link that writes `ch_consent`. While it shows, the page keeps room below it (`scroll-padding-bottom`, body padding from `--ch-consent-h`) so it never covers what has focus.
    - Cloudhal sites are cookieless and embeds load on a reader's click, so `choices` records the choice and exposes it on the root for later third-party features. The bars' buttons appear only with JavaScript; without it the bar still informs.
  - **Toasts.** A live region (`role=status`) on every page. The interaction runtime (`surface.10.js`; `surface.9.js` is an alias) says "Copied" or "Link copied" there after `copy` and `share`. Toasts go after four seconds.
  - **Mega menus.** One wide popover under the header, its groups as columns (loose links form a first column).
  - **Footer region.** Drawn above the columns with the page's `Sections`, its entry sources loaded and cache-tagged like a page's.
  - **Agents and people.**
    - `set_chrome` takes `announcement`, `consent` and `footer.region`; `get_chrome` resolves the bars.
    - Studio's Header and footer section gains a Bars segment.
    - `chrome.2.js` (with `chrome.1.js` as an alias) handles the bars' buttons.
