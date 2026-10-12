---
"@cloudhal/agent-runtime": minor
"@cloudhal/api": minor
"@cloudhal/mcp-server": minor
---

Agents can ask for a time-boxed elevation (ADR-0016 addendum): MCP tools `request_elevation` (files an approval a person grants in Studio, optionally shorter) and `get_mode` (current/own mode, elevation in force, latest request). Approving grants the elevation with the approver's rights and marks the request used; `/api/instance` reports `features.elevationRequests`.
