---
"@cloudhal/cloudflare": patch
"@cloudhal/mcp-server": patch
---

`render_page` on Cloudflare: read Browser Rendering's binary messages when they arrive as Blobs (current compatibility dates), so renders no longer time out while starting the browser; timeouts now say which stage they stopped in.
