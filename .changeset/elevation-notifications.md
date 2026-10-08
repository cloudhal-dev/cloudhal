---
"@cloudhal/agent-runtime": minor
"@cloudhal/api": minor
"@cloudhal/mcp-server": minor
---

Told before an elevation ends: `GET /api/notifications` lists the owner's elevations ending within 10 minutes and agents' pending elevation requests (derived per request, stable ids); `get_mode` reports `minutesLeft` and `endingSoon`; `/api/instance` reports `noticeMinutes`.
