---
"@cloudhal/storage": minor
"@cloudhal/agent-runtime": minor
"@cloudhal/api": minor
"@cloudhal/cloudflare": minor
"@cloudhal/cli": minor
---

In-editor AI, step 1 (RFC-0016, ADR-0029): Workers AI with the model chosen per site.
- **storage:** migration `0020_ai` adds two tables: `ai_settings` (one row per site; no row means AI is off) and `ai_usage` (per site and UTC day).
- **agent-runtime:**
  - `ai:invoke`, a new person-only scope. Agents bring their own model, so it never goes on an API key.
  - Every role holds it.
  - New abilities `ai.invoke` and `ai.settings`.
- **api:**
  - A dependency-free Workers AI client. `bindingTransport` uses the Worker `AI` binding (no secret). `restTransport` uses the REST API with an account id and token (from Node). Both can route through an optional AI Gateway, and the client parses both stream shapes.
  - `AiStore` holds settings (CAS on `rev`) and enforces the daily cap with one atomic upsert.
  - Routes under `/api/sites/:siteId/ai`:
    - `GET` and `PUT /settings`;
    - `GET /models` (recommended models first, then the account's catalogue, cached for an hour);
    - `POST /commands`: improve, shorten, expand, fix, tone, translate or custom, streamed as `text/plain`, audited as `ai_command` without the text, capped per day.
  - `/api/instance` reports `features.ai`.
  - `createApi({ ai: { store, transport } })`.
- **cloudflare:** the admin Worker passes `env.AI` when it is bound.
- **cli:**
  - `cloudhal.json` `ai: {}` makes `cloudhal deploy` bind Workers AI as `AI`.
  - `cloudhal studio` uses the REST transport when `CLOUDFLARE_ACCOUNT_ID` and `CLOUDHAL_AI_TOKEN` are set.
