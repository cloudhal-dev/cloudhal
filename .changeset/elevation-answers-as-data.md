---
"@cloudhal/agent-runtime": minor
"@cloudhal/api": minor
"@cloudhal/mcp-server": minor
"@cloudhal/storage": minor
---

Elevation answers as data: granted requests record `grant` (migration 0010) and `get_mode` reports it; requests carry the key's `ownMode`; grant audit rows carry `input.requestId`; a key that cannot take a still-pending request answers 409 `elevation_conflict` (vs `conflict` for a decided one); early ends audit their `elevation`.
