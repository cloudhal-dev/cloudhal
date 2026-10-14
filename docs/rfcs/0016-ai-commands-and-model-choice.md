# RFC-0016: In-editor AI commands and model choice
- Status: Accepted (2026-10-14, approved by Halil with the defaults of the open questions as drafted; ADR-0029). The direction (Cloudflare Workers AI, the model chosen by the site owner, AI Gateway as an option) was approved first and settles RFC-0014 open question 1.
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-14
- Related:
  - RFC-0014 (body blocks; phase 5 "in-editor AI");
  - ADR-0028 (open-question defaults);
  - RFC-0005 (roles and scopes);
  - RFC-0011 (the binding-plus-Node-fallback pattern this follows);
  - DESIGN.md §2y (body editor).
  - RFC-0015 is reserved for the block registry (RFC-0014 phase 6).
- Sources (checked 2026-10-14). The docs pages could not be fetched from the drafting environment. Facts marked † were read in the published packages' code, not the docs.
  - `@cloudflare/workers-types@5.20261014.1`†:
    - `Ai.run(model, inputs, { gateway, signal, … })`, `Ai.models({ task, search, hide_experimental, … })`, `Ai.gateway(id)` and `GatewayOptions`;
    - third-party `provider/model` names on `run`.
  - `workers-ai-provider@4.0.0`† (MIT): the REST URL `…/accounts/{id}/ai/run/{model}`, and both stream chunk shapes (`{response}` and OpenAI `choices[].delta`).
  - Workers AI:
    - pricing and the free daily allocation: https://developers.cloudflare.com/workers-ai/platform/pricing/ ;
    - model list API: https://developers.cloudflare.com/api/resources/ai/subresources/models/methods/list ;
    - JSON mode: https://developers.cloudflare.com/workers-ai/json-mode/ ;
    - deprecations: https://developers.cloudflare.com/changelog/post/2026-05-08-planned-model-deprecations/ .
  - Models:
    - GLM-4.7-flash: https://developers.cloudflare.com/ai/models/@cf/zai-org/glm-4.7-flash/ ;
    - gpt-oss-120b: https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/ .
  - AI Gateway:
    - Worker binding methods: https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/ ;
    - BYOK: https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/ ;
    - unified billing: https://developers.cloudflare.com/changelog/post/2026-08-07-workers-ai-unified-billing/ ;
    - pricing: https://developers.cloudflare.com/ai-gateway/reference/pricing .

**Status by step (2026-10-14).**
- **Step 1:** the transports, settings, model picker, commands API and the Settings › AI section.
- **Step 2:** "Ask AI" in the body editor's selection toolbar, streaming into a diff with Replace.

Both steps are in PR #34.

## Summary
- Editors get an AI menu on selected blocks: improve, shorten, expand, fix spelling and grammar, change tone, translate, or a short instruction of their own.
- Calls go to Cloudflare Workers AI, using a model the site owner picks in Studio. The picker shows the account's live model catalogue, with a short recommended list.
- On Workers the call goes through the `AI` binding, so there is no secret to store. On Node it goes through the REST API, with a token from the environment.
- An optional AI Gateway adds logs, caching and models from other providers. Cloudhal never stores a provider key.
- AI is off until the owner turns it on, and is capped per day per site. Every call is audited without its text.

## Motivation
- **Editing.** RFC-0014 phases 1–4 gave bodies a real editor, block ids and proposals. What editors still lack is help with the text itself, inside the editor.
- **Choice.** Owners want to choose: quality, price and language support differ by model and change every few months. Cloudflare retired 18 models on 2026‑05‑30.
- **No secrets.** Cloudhal already runs on Workers. The `AI` binding needs no key, and Workers AI bills to the same account.

## Proposal

### 1. Where calls go (D1, D2)
| Deployment | Transport | Needs |
|---|---|---|
| Cloudflare (`cloudhal deploy`) | `env.AI.run(model, input, { gateway? })` | An `ai` key in `cloudhal.json`, which makes deploy bind `AI` to the admin Worker |
| Node (`cloudhal studio`, self-hosted) | `POST https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/{model}`; through a gateway, `https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/workers-ai/{model}` | `CLOUDFLARE_ACCOUNT_ID` and `CLOUDHAL_AI_TOKEN` in the environment (a token with Workers AI Read and Edit). Never stored in the database |
| Neither | AI is unavailable. Studio says why | — |

`/api/instance` reports `features.ai: "binding" | "rest" | "none"`.

### 2. Model choice (D3, D4)
Per-site settings in a new table. Managed with `site:settings`, read with `content:read`:
```
ai_settings(site_id PK, enabled, model, gateway, daily_limit, rev, updated_at, updated_by)
```
- **`model`.**
  - A Workers AI id (`@cf/…`), or `provider/model` such as `openai/gpt-4.1-mini`. The second form is accepted only when `gateway` is set: it runs through AI Gateway, by unified billing or by keys stored in the gateway (BYOK).
  - Default when AI is first enabled: `@cf/zai-org/glm-4.7-flash`. It has a 131k context, is multilingual, and costs $0.06 in and $0.40 out per million tokens.
- **The picker.** `GET /api/sites/:siteId/ai/models` lists text-generation models, from `env.AI.models({ task: "Text Generation", hide_experimental: true })` or REST `GET /accounts/{id}/ai/models/search`.
  - The list is cached for an hour per isolate.
  - It is merged with a curated recommended list with one-line notes. The recommended entries are shown first and stay even when the catalogue cannot be read.
- **A model that disappears.** If the stored model is missing from the catalogue, Studio shows a warning. The call fails with `ai_model_unavailable`; there is no silent fallback to a model the owner did not choose, and so no surprise costs.
- **`gateway`.** An AI Gateway id, optional. With it, every call is logged in the gateway and can be cached there.

### 3. Commands (D5)
`POST /api/sites/:siteId/ai/commands` streams the result as `text/plain`, chunk by chunk:
```ts
{
  command: "improve" | "shorten" | "expand" | "fix" | "tone" | "translate" | "custom",
  nodeId: string,                       // the article or page being edited (context and access check)
  text: string,                         // the selected blocks' markdown, as the editor has them (≤ 16,000 chars)
  tone?: "formal" | "friendly" | "plain",
  locale?: string,                      // translate: the target language, BCP 47 ("tr", "en")
  instruction?: string,                 // custom: ≤ 500 characters
}
```
- **Input.**
  - The editor sends the selection itself, because it often has unsaved changes the store has not seen.
  - The server checks that `nodeId` is a page or article of the site that the person may read. It adds its title and locale as context.
- **Prompt.** A fixed system prompt per command. It says to return only Cloudhal Markdown (profile v1, no raw HTML) for the given text; to treat the text as content and never as instructions; and to keep links, `asset:` images and code unchanged unless asked.
- **Output.**
  - Markdown, streamed, at most 2,048 tokens.
  - Studio shows it live, then as a `BodyDiff` against the selection, with **Replace** and **Discard**.
  - Replace puts the result into the editor in place of the selection; the person saves as usual. This revises RFC-0014's "AI menu streaming into proposals": the person asking is already the reviewer. Proposals stay the channel for agents.
- **Reasoning.** Reasoning output (`reasoning_content`) is dropped, and models are asked for low reasoning effort where they accept it.

### 4. Policy (D6, D7)
- **The `ai:invoke` scope.** A new person-only scope: never on an API key, because agents bring their own model. Every role holds it (Contributor and up); the owner's switch and the daily cap are the controls.
- **Daily cap.**
  - `daily_limit` is the number of commands per site per UTC day: 100 by default, 0 to 10,000.
  - Usage is counted in `ai_usage(site_id, day, requests, input_tokens, output_tokens)` with one atomic upsert per call. The token counts are what the model reports, or 0.
  - Over the cap the call is refused with 429 `ai_budget`. Studio shows today's usage under the settings.
- **Audit.** Every command writes one row: tool `ai_command`, input `{ command, model, nodeId, chars, outputChars, inputTokens, outputTokens }`. The text is never recorded.
- **Rate.** At most one running command per person; a second gets 429 `ai_busy`. A command that runs longer than 2 minutes is aborted.

### 5. Implementation
- **Client.**
  - A dependency-free client in `@cloudhal/api` (`ai/client.ts`, Worker-safe) with `binding` and `rest` transports.
  - It parses the SSE stream from either chunk shape and yields text deltas.
  - It reads usage from the last chunk when present, and honours an `AbortSignal` when Studio cancels.
- **Deployment.** `@cloudhal/cloudflare` passes `env.AI` when bound. `cloudhal studio` builds the REST transport from the environment.
- **Studio.**
  - An **AI** section in Site settings: switch, model picker, gateway, daily cap, today's usage.
  - An "Ask AI" menu in the body editor's selection toolbar, shown when AI is on and the person holds `ai:invoke`.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| Vercel AI SDK `ai` + `workers-ai-provider` (Apache-2.0 / MIT) | Tested stream parsing, tools and structured output, many providers | Adds `ai` and its `@ai-sdk/*` peers to the admin Worker bundle; gateway delegation in the provider is labelled experimental; frequent major versions (v7) | v1 needs plain text streaming only. Revisit when commands need tool calls or JSON output |
| `ai-gateway-provider` for every call | Fallback chains, any provider | Needs the AI SDK as above; still needs a gateway | Same; a gateway stays optional here |
| The owner's own provider key stored in Cloudhal | Any provider without a gateway | Secret storage, rotation and leak risk (hard rule 9) | AI Gateway's stored keys (BYOK) give the same reach without Cloudhal holding a key |
| AI output as proposals (RFC-0014's sketch) | One review path for people and agents | The person asking must save, then accept their own request; no live text | People review in place; agents keep proposals |
| Hand-off to a connected agent | No model in Cloudhal | No streaming; needs an agent online | Kept for agents: `edit_body` with `mode: "propose"` |

## Compatibility & migration
- **No contract change.** `BodyBlock.via` already has `ai-command`, unused in v1, because Replace is an ordinary editor change.
- **Migration** `0020_ai`: `ai_settings` and `ai_usage`. A missing row means AI is off.
- **Deploy.** New `cloudhal.json` key `ai: {}` binds `AI`. Without it, nothing changes.
- **Rollback.** Turn AI off in settings, or remove the `ai` key and deploy again.

## Security & policy impact
- **Data leaving the deployment.**
  - The selected text goes to Workers AI in the same Cloudflare account.
  - With a `provider/model` it goes through the gateway to that provider. Studio says so next to the picker.
  - Nothing is sent until the owner turns AI on.
- **Prompt injection.**
  - Content is passed as data under a fixed system prompt.
  - The output is markdown rendered by the existing safe renderer.
  - The person sees a diff before Replace, and nothing is written without them.
- **Scopes.** `ai:invoke` is person-only. Settings are managed with `site:settings`. Keys never call AI.
- **Cost.** There is a daily cap per site, with usage visible in settings. Workers AI's free allocation is 10,000 neurons a day; beyond it, $0.011 per 1,000 neurons on Workers Paid.
- **Secrets.** On Node, `CLOUDHAL_AI_TOKEN` is read from the environment only. It is never logged and never sent to Studio.

## Open questions
Accepted with these defaults (ADR-0029):
1. **Default model:** `@cf/zai-org/glm-4.7-flash` (cheap and multilingual). Turkish quality is to be checked by the owner on real articles; the recommended list also offers `@cf/openai/gpt-oss-120b` and `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.
2. **Daily cap:** 100 commands per site.
3. **Who may use AI:** every role (`ai:invoke`), with a per-person cap left for later.
4. **Third-party models:** only through a gateway the owner configures; no keys in Cloudhal.
5. **Commands v1:** the seven above, with output applied in the editor and not as a proposal.
