---
"@cloudhal/astro-renderer": patch
"@cloudhal/mcp-server": patch
"@cloudhal/cli": patch
---

Theme scripts work on deployed sites, and `render_page` says when they would not.

- The `cloudhal()` integration no longer lets Astro inline a component's `<script>` (under 4 KB) into the page, where the Site Worker's `script-src 'self'` blocked it: script chunks always ship as files (`build.assetsInlineLimit`), other assets keep the project's own limit. A theme that set `vite.build.assetsInlineLimit` itself for this can drop it.
- `cloudhal dev` sends the Site Worker's policy as `Content-Security-Policy-Report-Only` on pages without their own, so the browser console shows what a deploy would block without breaking Vite's dev client.
- `render_page` and `cloudhal render` gain two checks: `surface-broken` (a body ```` ```surface ```` fence the preview cannot draw, or a component with an unknown block type or props that do not fit, named with the problem) and `script-blocked` (a script the page's CSP refused, inline or by URL; under `cloudhal dev`'s report-only policy, what a deploy would block).
