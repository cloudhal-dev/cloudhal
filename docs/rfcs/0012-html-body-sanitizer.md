# RFC-0012: Sanitize HTML bodies before they reach a page
- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-13
- Related: RFC-0001 (content bodies), RFC-0004 §2.3 (`asset:` links in markdown only), RFC-0005 (roles), ADR-0011 (agent keys over REST), the 2026-10-13 security audit (PR #22, finding "HTML bodies are published as-is"), `packages/astro-renderer/src/markdown.ts`, `csp.ts`
- Sources: WHATWG HTML parsing (https://html.spec.whatwg.org/multipage/parsing.html) · parse5, a spec-compliant HTML parser (https://github.com/inikulin/parse5) · OWASP XSS prevention (https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html) · mutation XSS, Heiderich et al., CCS 2013 (https://cure53.de/fp170.pdf)

## Summary
A content body or rich-text section can be `markdown` or `html`. Markdown is rendered as data: raw HTML is escaped and URLs are checked. HTML is published exactly as stored. This RFC sanitizes `html` bodies when they are rendered, with a fixed allowlist of elements, attributes and URL schemes, parsed the way browsers parse. Stored content is not changed.

## Motivation
- **Anyone who can write content can write HTML.** `renderBody` trusts `html` bodies because "only humans can store them". That is not true:
  - an agent key with `content:write` stores them over REST (ADR-0011);
  - so do `cloudhal push` and a bundle import;
  - so do Contributors and Authors, the least trusted roles (RFC-0005).
- **What an HTML body can do today:**
  - **On the Cloudflare site:** `SITE_CSP` blocks scripts, plugins and foreign frames. It does not block `<meta http-equiv="refresh">` (a redirect off the site), a `<base>` element, forms posting to the site itself, or overlays drawn with inline styles that imitate the site's UI.
  - **Static builds:** CSP comes only from `_headers`, so a host that ignores that file gets none.
  - **Feeds:** RSS and Atom carry the body to feed readers as stored.
- **Who is affected:** every visitor of a site whose content came from a less trusted writer, an agent included. Cloudhal's promise is that agent changes are safe to approve. An approver reading a diff of raw HTML cannot be expected to spot a redirect.
- **Why now:** the audit found this, and agents writing HTML through REST will only become more common.

## Proposal

### Where
`renderBody` in `@cloudhal/astro-renderer` passes `html` bodies through `sanitizeHtml(value)` before returning them. Every page, preview, feed and static build goes through it. Markdown is unchanged: it already escapes raw HTML.

### How
1. **Parse** the body as an HTML fragment with **parse5**, inside a `<div>` context, the way a browser parses `innerHTML`. A sanitizer that parses differently from the browser can be bypassed (mutation XSS). parse5 is a pure-JavaScript, spec-compliant implementation and runs in Workers.
2. **Walk the tree** and keep only the allowlist below.
   - Elements not on the list are **unwrapped**: their children are kept.
   - Elements in the *drop* set are removed **with their content**: `script`, `style`, `template`, `noscript`, `iframe`, `frame`, `object`, `embed`, `svg`, `math`, `form`, `input`, `button`, `select`, `textarea`, `meta`, `link`, `base`, `title`.
   - Comments are removed.
3. **Serialize** the result ourselves: element names from the allowlist, attribute values escaped (`& < > " '`), and text escaped. Nothing from the input reaches the output unescaped except allowlisted names.

```ts
// packages/astro-renderer/src/sanitize.ts
export function sanitizeHtml(html: string): string;
/** What survives, exported for docs and tests. */
export const HTML_ALLOWLIST: { elements: Record<string, readonly string[]>; global: readonly string[] };
```

### The allowlist (v1)
- **Text and structure:** `p br hr h1 h2 h3 h4 h5 h6 blockquote pre code kbd samp var strong b em i u s del ins mark small sub sup q cite abbr dfn time span div section aside figure figcaption details summary`
- **Lists and tables:** `ul ol li dl dt dd table caption thead tbody tfoot tr th td colgroup col`
- **Links and media:** `a img picture source audio video track`
- **Global attributes:** `title lang dir class`, plus `id` written as `user-content-<id>` so it cannot clobber the page's own ids or globals.
- **Per element:**
  - `a`: `href`, checked by the existing `safeHref`. `target` is kept only as `_blank`, and then `rel="noopener noreferrer"` is forced.
  - `img`: `src`, checked by `safeSrc`; `alt width height loading decoding`.
  - `ol`: `start reversed type`.
  - `th`/`td`: `colspan rowspan scope headers`.
  - `time`: `datetime`.
  - `details`: `open`.
  - `audio`/`video`: `src poster controls preload muted loop playsinline`; `poster` is checked like an image, `src` like other media (below).
  - `source`/`track`: `src type kind srclang label`; `src` is checked like other media.
- **URLs**, the same rules markdown already applies (`markdown.ts`):
  - links (`a href`): `safeHref`, so `http`, `https`, `mailto`, `tel` or relative;
  - images (`img src`, `video poster`): `safeSrc`, so `http`, `https`, relative, or a raster `data:image/(png|jpeg|gif|webp|avif);base64,…` URL. Never `data:image/svg+xml`, never `mailto`/`tel`;
  - other media (`audio`/`video`/`source`/`track` `src`): `http`, `https` or relative only, so no `data:` URL.
  - A URL that fails its rule drops the attribute; an `img` without a `src` is dropped.
- **Never kept:** event handlers (`on*`), `style`, `srcset` (v1), `formaction`, `xlink:*` and `data-*` attributes.

### Invariants
1. No element, attribute or URL outside the allowlist reaches a rendered page, a preview, a feed or a static build.
2. Stored bodies are never modified. Sanitizing happens at render time, so a later, wider allowlist applies to old content without a migration.
3. The output is well-formed HTML that the browser parses back to the same tree. The sanitizer's own serializer is the only writer.
4. Markdown rendering is unchanged.
5. The sanitizer is deterministic and Worker-safe: no DOM, no `eval`, no I/O.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Rely on `SITE_CSP` alone | Nothing to build | Misses `meta refresh`, `base`, UI redress; absent where `_headers` is ignored and in feeds | The audit's finding |
| Only Editors and above (humans) may store `html` | Small policy change | Breaks imports and existing content; Editors' agents and pushes still bypass it; a role is not a review | Treats who, not what |
| Sanitize on write | Renderer stays small | Rewrites what people stored; old content stays unsanitized without a migration; imports need it too | Render time covers everything at once |
| `sanitize-html` (htmlparser2) | Popular, configurable | Its parser is not the browser's, and it brings postcss | Parse differences are the classic bypass |
| `ultrahtml` (already installed through Astro) | No new dependency | Lenient parser, not spec-compliant, sanitizing is not its focus | Same parse-difference risk |
| DOMPurify | The reference sanitizer | Needs a DOM; jsdom does not run in Workers | Not Worker-safe |
| Convert HTML bodies to markdown | One renderer | Loses tables, figures and details; lossy for existing content | Too destructive |

## Compatibility & migration
- **Contracts:** none. `format: "html"` stays valid, and stored bodies are untouched.
- **Rendering:** content that used dropped elements renders differently:
  - inline `style`;
  - embeds (`iframe`), which `SITE_CSP` already blocks for foreign origins;
  - forms;
  - SVG inline in the body.
  The changeset lists what is dropped, and `cloudhal snapshot` diffs are unaffected.
- **Bundle size:** parse5 adds to the site Worker bundle. The growth is measured before merge and recorded in the PR, against the Workers script size limits.
- **Rollout:** one release. Rollback: revert the renderer; stored content was never changed.

## Security & policy impact
- Closes the audit's finding for every host, independent of CSP.
- No new scopes or approval points. The `renderBody` comment is corrected: an `html` body may come from any writer.
- The allowlist is code, reviewed like code. Widening it needs a change to this RFC's list.

## Open questions
1. **Inline `style`:** dropped in v1, because it enables UI redress. Should a small safe subset (`text-align`, colours) be kept instead? **[default: drop all]**
2. **Embeds** (YouTube, Vimeo): a later allowlist of `iframe` origins, each paired with a CSP `frame-src` entry for that site. **[default: not in v1]**
3. **`srcset`:** each candidate URL would need checking. **[default: not in v1; `asset:` images already get `srcset` through markdown]**
4. **Approvals:** should the approval diff warn when an HTML body loses content to the sanitizer, so a reviewer sees "3 elements dropped"? **[default: follow-up]**
