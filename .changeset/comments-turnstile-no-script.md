---
"@cloudhal/comments": minor
"@cloudhal/astro-renderer": patch
"@cloudhal/api": patch
---

With Turnstile on, posts from browsers without JavaScript are refused (`script_required`) unless the owner also sets the new comment setting `allowWithoutScriptWithTurnstile` (default false), because those posts carry no Turnstile token. `withoutScriptAllowed(settings)` decides for the pipeline, the rendered form and `cloudhal comments status`. Under proof of work nothing changes. Stored without a migration (bit 1 of `allow_without_script`); sites already on Turnstile have the path turned off until the owner opts in.
