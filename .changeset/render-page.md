---
"@cloudhal/mcp-server": minor
"@cloudhal/api": minor
"@cloudhal/cli": minor
"@cloudhal/cloudflare": minor
---

`render_page` (RFC-0021 21b): agents look at what they build.
- **MCP.** `render_page` renders a page's or article's draft through its preview link at 1440, 768 and 390 px. It returns JPEG screenshots (one viewport each) and eight automatic checks (sideways scrolling, alt text, broken images, heading order, contrast, empty sections, tap targets, line length) that name the section and component behind each problem. It is read-only, rate-limited (10 a minute per key, 200 a day per site) and times out after 20 s.
- **Runtimes.** One DevTools client (`@cloudhal/mcp-server/render`) drives the local Chrome in `cloudhal studio` and `cloudhal mcp` (`CHROME_PATH`; `CLOUDHAL_RENDER=off`) and Cloudflare Browser Rendering in the admin Worker (`BROWSER`).
- **Deploy.** `cloudhal deploy` binds Browser Rendering unless `cloudhal.json` has `"render": false`.
