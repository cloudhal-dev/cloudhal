---
"@cloudhal/api": patch
"@cloudhal/core-ts": patch
"@cloudhal/schedules": patch
"@cloudhal/agent-runtime": patch
"@cloudhal/cli": patch
---

Second ReDoS sweep (#174). Input that made a regex backtrack is now handled in linear time; results are unchanged.

- **Unauthenticated password-reset request.** `POST /api/password-reset/request` (and invite creation) checks the address length before anything else, and the address check no longer backtracks: `a@` followed by many dots used to cost seconds of CPU per request. Public token endpoints (`/api/password-reset/*`, invite acceptance) refuse a JSON body over 64 KiB with `413 payload_too_large`, whether or not it declares a `content-length`.
- **core-ts.** Redirect path normalising and matching (on every site request): `normalisePath`, `joinTarget`, and `ancestorPaths`, which no longer lists ancestors holding `//` that no redirect can match. Search text built at publish time: fenced code, links, images and tags. SVG upload checks: CSS comments, `url(…)` references (about cubic on `url(` followed by spaces) and width/height lengths (new `css-scan.ts`).
- **schedules.** The feed check's CDATA, element and `<enclosure>`/`<media:content>` url scans, and `urlPath`.
- **agent-runtime.** SKILL.md frontmatter lines (a line of spaces was quadratic).
- **Studio** (in `@cloudhal/cli`): the markdown body editor's trailing-newline trims.
