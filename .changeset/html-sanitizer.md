---
"@cloudhal/astro-renderer": minor
---

HTML bodies are sanitized when rendered (RFC-0012, ADR-0026).

`format: "html"` bodies and rich-text sections could be stored by any writer: agent keys over REST, `cloudhal push`, every role. They were published as stored. They now go through an allowlist on every page, preview, feed and static build:

- **Parsing:** parse5, the way a browser parses `innerHTML`, so mutation XSS does not get through.
- **Kept:** text structure, lists, tables, links, images, `picture`, `audio`, `video`, `details`, with a few attributes each. `id`s become `user-content-<id>`, and `target="_blank"` links get `rel="noopener noreferrer"`.
- **Removed with their content:** scripts, `style`, frames, embeds, forms, SVG, MathML, `meta`, `base`, comments.
- **Unwrapped:** any element not on the list, keeping its text.
- **Never kept:** event handlers, the `style` attribute and `srcset`.
- **URLs:** links follow the markdown link rules; images follow the markdown image rules (raster `data:` images included, never SVG); other media accept `http`, `https` or relative only.
- **Stored content is never changed:** a later, wider allowlist applies to old content without a migration.
- **The Studio preview** of a rich-text section with an HTML body now goes through the same sanitizer.

`safeHref` and `safeSrc` moved to `src/safe-urls.ts`; `@cloudhal/astro-renderer/markdown` still exports them. The site Worker grows by about 42 KB gzipped (parse5).
