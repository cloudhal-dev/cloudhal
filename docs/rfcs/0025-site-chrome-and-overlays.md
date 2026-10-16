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
