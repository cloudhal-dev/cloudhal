# ADR-0029: In-editor AI on Workers AI, model chosen per site
- Status: Accepted
- Date: 2026-10-14
- Related: RFC-0016 (the design), RFC-0014 open question 1 and phase 5, ADR-0028 (body blocks), ADR-0025 (the binding-plus-Node pattern), PR #34
- Sources:
  - `@cloudflare/workers-types@5.20261014.1`: `Ai.run`, `Ai.models`, `Ai.gateway`, `GatewayOptions`.
  - `workers-ai-provider@4.0.0` (MIT): the REST URL, and both stream chunk shapes.
  - Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
  - Model list API: https://developers.cloudflare.com/api/resources/ai/subresources/models/methods/list
  - AI Gateway BYOK: https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/
  - Unified billing: https://developers.cloudflare.com/changelog/post/2026-08-07-workers-ai-unified-billing/
  - All checked 2026-10-14.

## Context
- **What editors lack.** Since RFC-0014 they have a real editor, block ids and proposals, but no help with the text itself.
- **What was blocking.** RFC-0014 left the model call open (open question 1), so phase 5 waited.
- **What the owner wants.**
  - Cloudflare Workers AI, so there is no secret: it uses the binding and bills to the same account.
  - A choice of model, because quality, price and languages differ and models are retired every few months.
  - AI Gateway as an option.

## Decision
Adopt RFC-0016. The owner accepted it on 2026-10-14 with the defaults below.
- **Transport.**
  - On Workers: the `AI` binding, which `cloudhal.json` `ai: {}` makes deploy bind to the admin Worker.
  - On Node: the Workers AI REST API, with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDHAL_AI_TOKEN` from the environment. Neither is ever stored.
  - Without either, AI is unavailable and Studio says how to connect it.
- **Client.**
  - Our own small, dependency-free client in `@cloudhal/api`. It parses both stream shapes and drops reasoning output.
  - The Vercel AI SDK plus `workers-ai-provider` stays the path for tool calls or structured output.
- **Model choice per site** (`ai_settings`):
  - A Workers AI id, or `provider/model`. The second runs only through an AI Gateway the owner configures, with the gateway's stored keys (BYOK) or unified billing. Cloudhal stores no provider keys.
  - The picker lists the recommended models first, then the account's live text-generation catalogue, cached for an hour.
  - A model that leaves the catalogue is flagged, never silently replaced.
- **Commands.**
  - Improve, shorten, expand, fix, tone, translate and custom (≤ 500 characters).
  - They run on the editor's selected markdown (≤ 16,000 characters) and are streamed as `text/plain`, at most 2,048 output tokens.
  - A fixed system prompt treats the selection as data.
  - The person sees a diff and chooses Replace (into the editor; they save as usual) or Discard. AI output is not filed as a proposal; proposals remain the agents' channel.
- **Policy.**
  - `ai:invoke` is person-only, never on an API key, and every role holds it.
  - Settings need `site:settings`.
  - AI is off until the owner turns it on.
  - A daily cap of commands per site, counted in `ai_usage` with one atomic upsert.
  - One running command per person, aborted after 2 minutes.
  - Every command is audited as `ai_command` with counts, never the text.
- **Defaults for the open questions:**
  1. **Default model:** `@cf/zai-org/glm-4.7-flash`. Recommended alongside: `@cf/openai/gpt-oss-120b` and `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Turkish quality is to be checked on real articles.
  2. **Daily cap:** 100 commands per site (0–10,000).
  3. **Every role** may use AI; a per-person cap can come later.
  4. **Third-party models** only through a gateway.
  5. **The seven commands**, applied in the editor, not as proposals.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Vercel AI SDK + `workers-ai-provider` now | Tested streaming, tools, structured output | Bundle weight and `@ai-sdk/*` peers in the admin Worker; experimental gateway delegation; fast-moving majors | v1 needs text streaming only |
| Owner's provider key stored in Cloudhal | Any provider, no gateway | Secret storage and rotation (hard rule 9) | Gateway BYOK reaches the same providers without Cloudhal holding a key |
| AI output as proposals | One review path for people and agents | The person asking must save, then accept their own request; no live text | The person asking is already the reviewer |
| Hand-off to a connected agent | No model in Cloudhal | No streaming; needs an agent online | Kept for agents (`edit_body` propose) |

## Consequences
- **Positive:**
  - Editors get help in place, at a price the owner sets and sees.
  - No secret on Cloudflare deployments, and no provider key anywhere in Cloudhal.
  - Models can change without a release.
- **Negative:**
  - Workers AI models are retired often. The owner must re-pick when warned.
  - Per-person busy state is per isolate on Workers, so it is best effort; the daily cap is the hard limit.
- **Risks:**
  - Turkish quality varies by model.
  - Prompt injection through content can at worst produce text the person then sees in a diff before Replace.
