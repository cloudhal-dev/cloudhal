# RFC-0026: Icons
- Status: Accepted (2026-10-17; the directions were decided in the companion research)
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-17
- Related:
  - RFC-0020 (surfaces and the catalog), RFC-0023 (tokens), RFC-0025 (site chrome: social links, menus, overlays);
  - `docs/design/icons.md`, the research: Astro's SVG components, the libraries compared, accessibility practice and the decisions this RFC takes over (sources there).

## Summary
Public sites get one curated icon set: about 90 semantic names (`menu`, `close`, `arrow-right`, `mail`, `github`, …) drawn from Phosphor (the family Studio already uses), rendered as inline SVG strings by `@cloudhal/core-ts/icons`. Themes use them for their chrome (menu, carets, close buttons, social links), and agents pick them by name in surfaces (an `Icon` component, `icon` on Button, Badge and Stat). Names are the contract; drawings can change by weight or by theme without touching what agents wrote.

## Motivation
- Sites have almost no icons: the header draws its hamburger, caret and close by hand, and footer social links are text, although RFC-0025 asks for labelled icon links.
- Agents building landing pages, pricing tables and contact sections reach for icons (a check in a feature list, a phone next to a number) and today have none; they cannot write SVG (surfaces are data, never markup).
- Astro's SVG components only work for `.astro` imports at build time; surfaces are rendered to strings in TypeScript, so icons must be data that both can use.

## Proposal

### 1. The set (`@cloudhal/core-ts/icons`, Worker-safe)
```ts
export const ICON_NAMES: readonly IconName[];          // the curated names, in groups
export type IconName = "menu" | "close" | "search" | /* … */ "bluesky";
export const ICON_GROUPS: Record<"interface" | "actions" | "content" | "social", readonly IconName[]>;
export function isIconName(x: unknown): x is IconName;
/** Inline SVG: decorative unless a label is given (then role="img" + aria-label). */
export function renderIcon(name: IconName, o?: { label?: string; className?: string }): string;
```
- **Source**: Phosphor 2.1 (`@phosphor-icons/core`, MIT), regular weight; Bluesky (missing from Phosphor) from Simple Icons 16.35 (CC0), monochrome. A generator (`scripts/gen-icons.ts`) reads the allow-list and writes `src/icons-data.ts`; a test regenerates it and fails when it drifts.
- **Markup**: `<svg class="ch-icon" viewBox="…" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">…</svg>` — it follows the text's size and color; icons that point (arrows, chevrons, external) carry `data-ch-mirror` and flip under `[dir=rtl]`.
- **Accessibility**: decorative by default. An icon-only control takes its name on the control (`aria-label`), the icon stays hidden; a standalone meaningful icon takes `label` (`role="img"`).

### 2. The theme (26a)
- The header's menu, caret and close, overlays' close buttons and the lightbox's arrows use `renderIcon`.
- Footer social links become icon links named by the network (`aria-label="GitHub"`), as RFC-0025 asked.

### 3. The catalog (26b)
- `Icon` primitive: `{ name: IconName, label?, size?: "s"|"m"|"l"|"xl", tone?: "neutral"|"brand"|"accent"|"success"|"warning"|"danger" }`, no children.
- `icon?: IconName` on `Button` (with `iconPosition?: "start"|"end"`), `Badge` and `Stat`; `marker?: IconName` on `List` (decorative bullets).
- The surface checks refuse unknown names; a repair maps common model spellings (`x-mark` → `close`, `envelope` → `mail`, `hamburger` → `menu`) and `catalogPrompt` lists the names by group.

### 4. Later
- 26c: a theme picks the weight (`light`, `regular`, `bold`, `fill`) as a token, each weight a separate generated map behind its own subpath; repeated icons deduplicated with a same-page `<symbol>`/`<use>`.
- 26d: theme packages (RFC-0018) may supply their own drawings for the same names; the generator checks completeness.
- `IconName` joins the JSON Schema contract when a contract field needs it (menu item icons, for example). Today icons live in surface props, which the catalog checks.

### Invariants
1. Agents and people choose names from the set; markup, paths and CSS never come from them.
2. Icons never carry information alone: a decorative icon sits next to text; an icon-only control is named.
3. The set grows only by review (a PR to the allow-list); a name, once released, keeps its meaning.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Lucide (`lucide-static`) | Small, strings natively, stroke width adjustable | No brand logos; differs from Studio | Phosphor matches Studio and has the brand logos we need |
| astro-icon / Iconify at runtime | Any set, `size`/`title` props | `.astro` only; whole sets bundled in server output | Surfaces render outside `.astro` |
| A sprite file (`<use href="/icons.svg#x">`) | Cached once | An extra request on first paint; a file per theme | Inline strings need nothing; same-page dedupe later |
| Simple Icons for every logo | 3,400 brands | Dropped LinkedIn in v14; brands can be removed | Only for Bluesky, until Phosphor has it |
| `IconName` in the contract now | Rust mirrors it | No contract field uses it yet | Added when one does |

## Compatibility & migration
- No contract change. The theme's markup changes for the chrome icons (same size, same names), and social links gain icons; the CLI fixtures follow.
- Rollback: revert the theme files; the icon module has no other users until 26b.

## Security & policy impact
- None new: SVG strings are constants from the generator, never input; CSP unchanged (inline SVG needs no script or style source).
- Logos are shown monochrome in `currentColor`, unaltered, linking to the site owner's own profiles (Bluesky's press guidelines: https://bsky.social/about/blog/press-faq).

## Open questions
None; `docs/design/icons.md` decided them.

## Status
- **26a shipped.**
  - **Package.** `@cloudhal/core-ts/icons` holds 93 names in four groups (interface 20, actions 25, content 36, social 12). It exports `renderIcon`, `isIconName`, `ICON_NAMES` and `ICON_GROUPS`.
  - **Generator.** `scripts/gen-icons.ts` (`pnpm --filter @cloudhal/core-ts gen:icons`) reads `src/icon-names.ts` and Phosphor 2.1.1's regular weight (a dev dependency), plus the vendored Bluesky file (`icons/simple-icons/`, source and license in `SOURCE.md`). It writes `src/generated/icons-data.ts` (36 KB, 12 KB gzipped, Worker bundle only). `test/icons.test.ts` fails when that file drifts.
  - **Theme.** The header's menu and carets, the disclosure carets, the announcement's close, overlays' close buttons and the lightbox's arrows now use the set. Footer social links are icon links named by the network.
  - **CSS.** `.ch-icon` sits on the baseline; pointing icons flip under `[dir=rtl]`; forced colors keep icons visible.
