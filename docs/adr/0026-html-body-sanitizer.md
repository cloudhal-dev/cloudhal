# ADR-0026: HTML bodies are sanitized at render time
- Status: Accepted
- Date: 2026-10-13
- Related: RFC-0012 (the design), RFC-0001 (content bodies), RFC-0005 (roles), ADR-0011 (agent keys over REST), the 2026-10-13 security audit (PR #22)
- Sources: WHATWG HTML parsing — https://html.spec.whatwg.org/multipage/parsing.html · parse5 — https://github.com/inikulin/parse5 · OWASP XSS prevention — https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html

## Context
Content bodies and rich-text sections can be `markdown` or `html`. Markdown has always been rendered as data. HTML was published exactly as stored, on the assumption that only humans write it. That assumption was wrong: agent keys over REST, `cloudhal push` and the least trusted roles can all store HTML. `SITE_CSP` blocks scripts on the Cloudflare site, but not `<meta http-equiv="refresh">`, `<base>` or UI redress. Static builds have a CSP only where the host reads `_headers`, and feeds have none.

## Decision
Adopt RFC-0012 with its defaults, accepted by the owner on 2026-10-13:
- **Where.** `renderBody` sanitizes every `html` body, so pages, previews, feeds and static builds all go through it. Stored bodies are never modified.
- **How.**
  - Parse as an HTML fragment with parse5, the way a browser parses `innerHTML`.
  - Keep a fixed allowlist of elements and attributes. Unknown elements are unwrapped (their children are kept). A drop set (`script`, `style`, `iframe`, forms, `svg`, `math`, `meta`, `base`, …) is removed with its content. Comments are removed.
  - Serialize with our own escaping, so nothing from the input reaches the output unescaped except allowlisted names.
- **URLs.** The rules markdown already applies:
  - `safeHref` for links;
  - `safeSrc` for images, so raster `data:` images are kept and SVG `data:` URLs are not;
  - `http`, `https` or relative only for other media.
- **Defaults of the open questions:** no inline `style`; no embeds; no `srcset` in v1. A warning in the approval diff when content is dropped is left for later.

## Alternatives considered
| Alternative | Why not |
|---|---|
| Rely on CSP | Misses meta refresh, `base` and UI redress, and is absent where `_headers` is ignored and in feeds |
| Restrict `html` to Editors and above | Treats who, not what; imports and pushes still bypass it |
| Sanitize on write | Rewrites stored content; old content stays unsafe without a migration |
| `sanitize-html`, `ultrahtml` | Parsers that are not the browser's: parse differences are the classic bypass |
| DOMPurify | Needs a DOM; not Worker-safe |

## Consequences
- **Positive:** HTML bodies are safe on every host, whoever wrote them, independent of CSP. A wider allowlist later applies to old content without a migration.
- **Negative:** parse5 adds to the site Worker bundle. Content that relied on inline styles, embeds, forms or inline SVG renders without them.
- **Risks:** an allowlist bug could drop legitimate markup (tests pin the list) or keep something dangerous (tests pin the known vectors).
