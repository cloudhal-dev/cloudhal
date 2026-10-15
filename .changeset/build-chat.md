---
"@cloudhal/api": minor
"@cloudhal/ui": minor
---

Studio's Build chat (RFC-0020 phase 20c): `POST /api/sites/:siteId/ai/build/:pageId` runs a turn on the site's model, which writes JSON Lines (`say`, `ops`, `done`); each finished step is repaired, validated, written to the draft and shown in the Build view; refused steps go back to the model with their JSON Pointers (at most 3 rounds); one AI command, one snapshot and one `build_chat` audit row per turn; progress streams as NDJSON. `AiMessage` gains the `assistant` role. `@cloudhal/ui` adds `BuildChatLog`.
