---
"@cloudhal/cli": patch
---

`cloudhal studio` no longer answers unknown or unmounted `/api/*` paths with the Studio's `index.html`: they get the API's JSON 404. With `--no-auth`, `GET /api/agent-keys` used to return the HTML page with a 200 and every Studio screen crashed; Studio now also reads a non-list answer from the agent-keys and members routes as an empty list.
