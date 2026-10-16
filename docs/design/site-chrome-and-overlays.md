# Site chrome and overlays: R&D report

**What this covers:**
- how site headers and footers should work in Cloudhal as agent-chosen data;
- how the theme core should provide overlays (modal, drawer, popover, tooltip, lightbox, toast, announcement and consent bars);
- how agents should use them.

Collected 2026-10-16 from an audit of the repository and two web research tracks. It is the groundwork for RFC-0025 (to be written; the directions below are decided) and the companion of RFC-0024 (motion), which reuses the same runtime and accessibility rules.

**Confidence.** Claims about the platform cite primary sources (MDN, specs, browser vendors, W3C). Builder features are vendor pages and marked as such. Anything unverified is listed under "Caveats".

## Summary
- **Where we are.**
  - The header and footer are hard-coded in the blog theme's `Base.astro`; only the menus are data.
  - There is no logo, call-to-action, sticky header, mobile menu button, announcement bar, social links or consent banner.
  - There are no overlays at all; dropdowns are `<details>` without Esc or outside-click handling.
  - Every site therefore has the same top and bottom, and an agent cannot change them.
- **The platform now does most of the work natively.**
  - `<dialog>` (modal, Esc, inert background) is widely available.
  - The Popover API is Baseline 2024; Invoker Commands (`command`/`commandfor`, which open dialogs and popovers **without JavaScript**) are Baseline since December 2025; CSS anchor positioning is Baseline since January 2026.
  - The rest (`closedby`, `popover="hint"`, `interestfor`, scroll-state queries) are not yet in every engine and need fallbacks.
- **Recommendation.**
  - Model the header and footer as **structured site chrome**: enums for layout and behavior, plus slots for logo, menus, actions and social links. The theme renders them with accessibility built in, the same way RFC-0023 made colors data.
  - Model overlays as **catalog components inside surfaces** (`Dialog`, `Drawer`, `Popover`, `Tooltip`, `Lightbox`), opened by a `Button` action that the renderer maps to Invoker Commands, with a real link as the no-JavaScript fallback.
  - Site-wide overlays (mobile menu, announcement, consent, toasts) belong to the chrome, not to page content.

## Where Cloudhal stands
| Area | Today | Evidence |
|---|---|---|
| Header | Site name as text, primary menu (`<details>` dropdowns, 3 levels), optional search form; not sticky; wraps on phones, no menu button | `starters/blog/src/layouts/Base.astro:46-66`, `components/NavMenu.astro:20-35` |
| Footer | Hard-coded "Built with Cloudhal", footer menu or an RSS link | `Base.astro:78-95` |
| Menus | Accepted model (RFC-0003): menus by key, nested items, page/entry/term/collection/url/group; MCP `list/get/set/update/delete_menu` (approval); Studio Navigation | `docs/rfcs/0003-navigation.md`, `mcp-server/src/menu-tools.ts` |
| Site data | `name`, theme, design rules; **no logo, social links or chrome settings** | `core-contracts/schemas/site.schema.json` |
| Overlays | None. A2UI `Modal` imports as a `Disclosure` | RFC-0020 :333 |
| Runtime | `surface.7.js`: actions `set`, `toggle`, `navigate`, `scrollTo` …; no dialog or popover handling | `astro-renderer/src/surface-client.ts` |
| CSP | `script-src 'self'`; `style-src 'self' 'unsafe-inline'` | `astro-renderer/src/csp.ts:12` |

## The platform in October 2026
| Feature | Status | What we use it for | Fallback |
|---|---|---|---|
| `<dialog>` + `showModal()` | Baseline widely available | modal, drawer, lightbox, mobile menu | none needed |
| `closedby="any"` | Chrome 134, Firefox 141; **not Safari** | close on backdrop click | runtime closes on backdrop click |
| Popover API (`auto`, `manual`) | Baseline 2024 | dropdowns, mega menus, footnotes, toasts | `<details>` for menus |
| `popover="hint"` | Chrome, Firefox; **not Safari** | tooltips | treated as `manual`; the runtime opens it on focus and hover |
| Invoker Commands (`command`, `commandfor`) | Baseline 2025 (Chrome 135, Firefox 144, Safari 26.2) | "this button opens that overlay", no JavaScript | also emit `popovertarget` (Baseline 2024) for popovers; dialogs fall back to a real link |
| Interest Invokers (`interestfor`) | Chrome 142 only | hover and focus tooltips | runtime (focus and hover), never the only way in |
| CSS anchor positioning | Baseline newly available (January 2026) | popover and tooltip placement | centered popover or `position-try` fallback |
| `@starting-style` + `allow-discrete` | Baseline 2024 | enter and exit animations (RFC-0024 levels) | no animation |
| `overlay` property | Chrome only | exit animation in the top layer | exit is cut, works anyway |
| `<details name>` | all engines | exclusive accordions, menus without JavaScript | none needed |
| `scroll-state()` queries | Chrome only | "stuck" header style, hide on scroll | small script, or a plain sticky header |

**Accessibility rules that shape the design:**
- **Site navigation is a disclosure pattern, never `role=menu`.** Use buttons with `aria-expanded`; Esc closes the open item and focus returns to its button (WAI-ARIA APG disclosure navigation).
- **A drawer is a modal dialog at the edge** of the screen.
- **Landmarks:** one `header`, labelled `nav`s (Primary, Footer), one `main`, one `footer`, and a skip link first.
- **Sticky headers and non-modal banners must not cover the focused element** (WCAG 2.4.11), which `scroll-padding-top` and `scroll-padding-bottom` solve.
- **Toasts** need a live region that is already in the page. Errors and toasts with actions do not dismiss themselves.

## Header
### Model
Site-wide, in a new `Site.chrome.header` object (a contract change, RFC needed). Every field is an enum or a reference:

```jsonc
{
  "layout": "logo-left" | "logo-left-nav-center" | "centered" | "split" | "minimal",
  "behavior": "static" | "sticky" | "hide-on-scroll" | "fixed",
  "shrink": false,
  "overHero": "solid" | "transparent",          // transparent only over a band with a dark or loud surface
  "width": "content" | "wide" | "full",
  "surface": "plain" | "muted" | "raised" | "inverse" | "brand",   // RFC-0023 surfaces
  "mobile": { "collapseAt": "sm" | "md" | "lg" | "always", "style": "dropdown" | "drawer-start" | "drawer-end" | "fullscreen" },
  "logo": { "asset": "asset:…", "assetDark": "asset:…", "alt": "…", "height": "s" | "m" | "l" },  // name as text when absent
  "nav": "primary",                              // a menu key (RFC-0003)
  "utility": "utility",                          // optional second menu, shown small, above or right
  "actions": [                                   // at most 3
    { "kind": "button", "label": "Start free", "href": "/signup", "variant": "primary" | "secondary" },
    { "kind": "search" }, { "kind": "locale" }, { "kind": "theme-toggle" }, { "kind": "motion-toggle" }
  ]
}
```

- **Menus stay where they are.** The header refers to a menu key; it does not copy items. Menu items gain an optional `mega` kind later, with columns of links and an optional featured card. That is an RFC-0003 amendment.
- **Logo and social links** go in a new `Site.brand { logo, logoDark, mark, social[] }`, so the header, footer, SEO (`Organization` JSON-LD) and Studio share them.
- **Per-page override.** `Page.chrome { header: "default" | "transparent" | "hidden", footer: "default" | "minimal" | "hidden" }` covers landing pages and checkout-like flows.

### Rendering, CSS first
- **Always emitted:**
  - a skip link to `#main`;
  - `<header>`;
  - `<nav aria-label>`, labelled from the menu name;
  - disclosure buttons for groups (the parent link stays a real link next to its toggle);
  - `html { scroll-padding-top: var(--ch-header-h) }` for sticky and fixed headers;
  - a reserved header height so nothing shifts.
- **Desktop submenus and mega menus:** a `popover="auto"` panel opened by its button, placed with anchor positioning. Esc and outside clicks close it natively. Without JavaScript or popover support, the same markup works as `<details name="nav">`.
- **Mobile menu:** a modal `<dialog>` (drawer or fullscreen) opened by `<button command="show-modal">`, or a disclosure dropdown. Without Invoker Commands the button is a link to `/menu`, a server-rendered page of the same menu, so the site always works without JavaScript.
- **Behaviors:**

  | Behavior | Rendering |
  |---|---|
  | `sticky` | `position: sticky`; the "stuck" shadow or solid background uses `scroll-state(stuck: top)` inside `@supports` (Chrome), and stays solid elsewhere |
  | `hide-on-scroll` | a few lines in the motion module set `data-ch-scroll-dir` on `<html>`; CSS translates the header. Disabled at motion `none` and under reduced motion: a plain sticky header |
  | `shrink` | `transform` and padding through custom properties, never height on the layout box |
  | `transparent` over a hero | allowed only when the first band's surface is `inverse`, `brand`, `gradient`, `accent`, or an image with a scrim. The header text then takes that surface's text role, so contrast is guaranteed, and `render_page` checks it |

### How agents should use it
- **Most sites:** `logo-left` with `sticky` and one primary button. Landing pages: `transparent` over a loud hero. Editorial: `centered` or `split` with a utility bar.
- **Keep it short:** at most 7 top-level items and at most 1 primary button. `mobile.style` follows the item count: fewer than 5 items → `dropdown`; otherwise `drawer-end`.
- **Never** place the newsletter, cookie notice or chat in the header.

## Footer
### Model
`Site.chrome.footer`:

```jsonc
{
  "layout": "simple" | "columns" | "columns-newsletter" | "cta-band" | "minimal",
  "surface": "plain" | "muted" | "inverse",
  "tagline": "…",
  "columns": [ { "heading": "Product", "menu": "footer-product" } ],   // up to 5, each a <nav aria-label>
  "cta": { "heading": "…", "button": { "label": "…", "href": "…" } },  // for cta-band
  "newsletter": { "heading": "…", "form": "newsletter" },             // needs the reader-actions RFC (G11)
  "social": true,                                                      // from Site.brand.social, icons with labels
  "legal": { "copyright": "© {year} {site}", "menu": "legal" },
  "extras": ["locale", "theme-toggle", "motion-toggle"],
  "credit": true                                                       // "Built with Cloudhal", owner can turn it off
}
```

- **Rendering.** Each column is a labelled `nav`. Social links are icon links with visible or `aria-label` names (an icon set from RFC-0024's companion work, G7). `{year}` and `{site}` are the only placeholders, filled by the renderer.
- **Pause control.** When the page needs one (RFC-0024 §1), the footer is where the "Pause motion" button lives.
- **How agents should use it:**
  - `columns` with 2–4 menus for sites with many pages;
  - `simple` for small sites;
  - `cta-band` for landing pages (it replaces a last CTA band in the page, so agents should not build both).

## Announcement and consent bars
- **Announcement:** `Site.chrome.announcement { text, link, tone, dismissible, id }`.
  - Rendered on the server above the header, never injected, so there is no layout shift.
  - A dismissal sets a first-party cookie `ch_dismiss=<id>`, so the server leaves the bar out next time. A versioned `id` brings it back when the text changes.
- **Consent:** `Site.chrome.consent { mode: "none" | "notice" | "choices", policy: "/privacy" }`.
  - A non-modal bottom bar (`popover="manual"`) with `scroll-padding-bottom` while it is open (WCAG 2.4.11), or a modal `<dialog>` for `choices`.
  - The choice is stored in a first-party cookie.
  - Cloudhal's own analytics (RFC-0006) is cookieless, so most sites need `none` or `notice`. This is a legal decision per site, so agents propose it and a person sets it (approval).

## Overlays in the theme core
### Primitives
New catalog components. Their content is their children, so it is built, checked and streamed like any surface content. They render outside the flow, in the top layer.

| Component | Props | Native element | No-JS / missing-feature fallback |
|---|---|---|---|
| `Dialog` | `title` (required, accessible name), `size` (sm/md/lg/full), `dismiss` (`any`/`closerequest`/`explicit`), `fallbackHref` | `<dialog>` + `showModal()` via `command="show-modal"`; `closedby` | trigger is a link to `fallbackHref`; backdrop close by the runtime in Safari |
| `Drawer` | `title`, `placement` (start/end/bottom), `size` | modal `<dialog>` at the edge | as `Dialog` |
| `Popover` | `placement` (block-end/block-start/inline-end/inline-start), `width` | `popover="auto"` + `popovertarget`/`toggle-popover`, anchor-positioned on its trigger | centered popover; footnote-style popovers also link to an `#id` in the page |
| `Tooltip` | `text` (≤ 160 characters, no interactive content) | `popover="hint"` + `interestfor` | runtime opens it on focus and hover; Esc closes it; never the only way to get the information |
| `Lightbox` | `items` (assets or videos with alt), `start` | modal `<dialog>` with `--next`/`--prev` commands handled by the runtime | thumbnails link to the full image or video |

- **Opening.** A `Button` gets a new action, `onClick: { action: "open", target: "<component id>" }`, plus `close` for buttons inside an overlay.
  - The renderer maps it to `command` and `commandfor` (and `popovertarget` for popovers), sets `aria-controls`, and keeps `href` as the fallback.
  - The store checks that the target exists in the same surface and is an overlay component.
- **The runtime's part** (a small addition to the interaction runtime or the motion module):
  - return focus to the trigger on close where the browser does not;
  - close on backdrop click where `closedby` is missing;
  - set `aria-expanded` on triggers;
  - lightbox navigation;
  - open tooltips on focus and hover in Safari.
- **Scroll lock:** `html:has(dialog:modal) { overflow: hidden; scrollbar-gutter: stable }` in CSS. Overlays get `overscroll-behavior: contain`.
- **Motion:** enter and exit with `@starting-style` and `allow-discrete`, scoped to RFC-0024's levels (fade at `subtle`, slide and scale at `standard` and above, none under reduced motion).
- **A2UI interop:** `Modal` now maps to `Dialog` instead of `Disclosure`.

### How agents should use overlays
- **Prefer the page.** Content people need to read or link to belongs on a page, not in a dialog. Overlays are for short, optional detail: terms in a sign-up flow, a video, an image gallery, a definition, filters.
- **Choosing a kind:**
  - `Dialog` for a focused task or a short read;
  - `Drawer` for a list beside the page (filters, cart, table of contents);
  - `Popover` for a small panel tied to a button;
  - `Tooltip` for a few words of explanation;
  - `Lightbox` for media.
- **Never open an overlay on page load, on a timer or on exit intent.** Newsletter and promotion pop-ups are not available. This is a rule the store enforces: overlays open only from a user action.
- Every `Dialog` and `Drawer` has a title and a visible close button (the renderer adds it). Popovers and tooltips never hold forms.

## Agents, MCP and CLI
- **MCP tools:**
  - `get_chrome` (read) returns the header, footer, announcement and consent settings with their allowed values;
  - `set_chrome` changes them, with a person's approval like `set_theme_settings`;
  - `get_design` summarizes them;
  - `set_brand` sets the logo and social links (approval).
  - Menus keep their own tools.
- **Catalog and checks.** `catalogPrompt` teaches the overlay components and the `open` action. Checks:
  - every `open` target resolves;
  - overlays have titles;
  - tooltips hold no interactive content;
  - at most 3 overlays per surface.
- **`render_page` checks:**
  - `skip-link`;
  - `landmarks`;
  - `focus-obscured` (focus every link while scrolling and check the sticky header and bars do not cover it);
  - `header-contrast` (transparent headers);
  - `overlay-open`: open each overlay through its trigger and check focus moves in, Esc closes it, focus returns and its contrast passes. The screenshots include each open overlay.
- **CLI:**
  - `cloudhal chrome get` / `cloudhal chrome set --file chrome.json`;
  - `cloudhal render` (from RFC-0024) also renders the mobile menu open with `--open-menu`.
- **Studio:** a "Header and footer" section in Site settings (layout, behavior, mobile style, actions, footer columns, announcement), next to Navigation. The site-design skill gains chrome recipes per kind of site.

## Proposed phases (for RFC-0025)
| Phase | Scope |
|---|---|
| 25a | `Site.brand` and `Site.chrome.header`/`footer` (contract), the theme's header and footer from data (layouts, sticky, logo, actions, columns, social, legal, credit), skip link and landmarks, `get_chrome`/`set_chrome`, Studio section |
| 25b | Mobile menu (drawer, fullscreen, dropdown, `/menu` fallback), popover submenus with anchor positioning, `hide-on-scroll`, `shrink`, transparent over hero with the contrast rule |
| 25c | Overlay components (`Dialog`, `Drawer`, `Popover`, `Tooltip`, `Lightbox`), the `open`/`close` actions, the runtime additions, the overlay checks |
| 25d | Announcement and consent bars, toasts, `Page.chrome` overrides, `mega` menu items (RFC-0003 amendment) |

## Decisions (formerly open questions)
These were decided on 2026-10-16 for RFC-0025, with the same test as RFC-0024: what serves developers, agent users and readers best.

1. **Invoker Commands: a tiny first-party shim plus the link fallback.**
   - The runtime carries a shim of about 30 lines for the three built-ins we use (`show-modal`, `close`, `toggle-popover`). It loads only on pages with overlays, and only when `HTMLButtonElement.prototype.commandForElement` is missing.
   - `fallbackHref` stays for readers without JavaScript.
   - Readers on older browsers keep the experience, and no third-party script is needed.
2. **Safari: ship now with runtime fallbacks.** Backdrop-click closing (in place of `closedby`) and focus/hover tooltips (in place of `popover="hint"` and `interestfor`) are small runtime additions. They are removed once Safari ships the features.
3. **Hide on scroll: a small script by default, CSS where available.**
   - The motion module sets `data-ch-scroll-dir`. On Chrome, `scroll-state(scrolled)` does the same without script.
   - It is off under reduced motion and at motion `none`, so the header is then simply sticky.
4. **Footer freedom: yes, one optional surface region.**
   - `footer.region` holds a surface, built and checked like any surface content (for example a sign-up card or a map), rendered above the columns.
   - The structured parts (landmarks, legal row, social links) stay guaranteed.
   - The header gets no free region: its accessibility (focus, disclosure, height) depends on staying structured.
5. **Consent: `none` by default, with `notice` suggested when needed.**
   - Cloudhal's analytics is cookieless, so most sites need nothing.
   - When a site uses third-party embeds (video, maps), `get_design` and `render_page` suggest `notice` or `choices`. A person sets it (approval), since it is a legal choice.
   - Default texts ship in English and Turkish, written by the theme, editable by the owner.

## Caveats
- **Firefox:** there are reports that it still does not animate `display` for top-layer exits; the exit animation is cosmetic, so overlays work anyway.
- **iOS Safari:** there are reports that `overflow: hidden` on `<html>` does not fully stop background scrolling. The fallback is `overscroll-behavior` plus the dialog's own inertness.
- **Builder catalogs:** the Tailwind Plus category counts come from a page behind a login, and the Framer "scroll variants" details are from third-party summaries.

## Sources
- **Platform (MDN):**
  - Dialog: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
  - `closedby`: https://caniuse.com/mdn-html_elements_dialog_closedby
  - Popover API: https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using
  - `popover="hint"`: https://caniuse.com/mdn-html_global_attributes_popover_hint
  - Invoker Commands: https://developer.mozilla.org/en-US/docs/Web/API/Invoker_Commands_API
  - `overlay`: https://developer.mozilla.org/en-US/docs/Web/CSS/overlay
  - `scroll-padding-top`: https://developer.mozilla.org/en-US/docs/Web/CSS/scroll-padding-top
  - `overscroll-behavior`: https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior
- **Platform (vendors):**
  - Invoker Commands, Baseline December 2025: https://web.dev/blog/web-platform-12-2025
  - Anchor positioning, Baseline January 2026: https://web.dev/blog/web-platform-01-2026
  - Interest Invokers (Chrome 142): https://developer.chrome.com/release-notes/142
  - Scroll-state queries: https://developer.chrome.com/blog/css-scroll-state-queries
  - Exclusive accordions: https://developer.chrome.com/docs/css-ui/exclusive-accordion
  - Interop 2026: https://webkit.org/blog/17818/announcing-interop-2026/
  - CSS for Web Vitals: https://web.dev/articles/css-web-vitals
- **Accessibility:**
  - Disclosure navigation: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/
  - Modal dialog: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
  - Landmarks: https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/
  - Focus Not Obscured: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured
  - Link + disclosure navigation: https://adrianroselli.com/2019/06/link-disclosure-widget-navigation.html
  - Toasts: https://adrianroselli.com/2020/01/defining-toast-messages.html
- **Builders (vendor pages):**
  - Wix header scroll effects: https://support.wix.com/en/article/studio-editor-adding-header-scroll-effects
  - Webflow menu button: https://help.webflow.com/article/menu-button
  - Squarespace transparent header: https://www.bigcatcreative.com/blog/transparent-header-menu-squarespace
  - Tailwind Plus blocks: https://tailwindcss.com/plus/ui-blocks
  - Relume components: https://www.relume.ai/components
