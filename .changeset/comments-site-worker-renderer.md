---
"@cloudhal/astro-renderer": minor
"@cloudhal/comments": minor
"@cloudhal/core-ts": minor
---

RFC-0007 rollout step 4 — reader comments on the site. The Site Worker entry answers `GET /__cloudhal/comments/challenge`, `POST /__cloudhal/comments` and `POST /__cloudhal/comments/report` before Astro, never cached (`SiteComments` wires `@cloudhal/comments`' pipeline: published entries only, same origin, `CF-Connecting-IP` as the client address, honeypot, proof of work or Turnstile `siteverify` with hostname/action checks, optional `COMMENTS_RL` Rate Limiting binding); without a usable `CLOUDHAL_COMMENTS_KEY` comments are off. `loadComments` + `<Comments />` (`@cloudhal/astro-renderer/comments`, `/components`) render approved comments two levels deep as escaped plain text, the plain HTML form, `#comment-pending`-style notes and closed/hidden/off/preview states, tag entry pages `cloudhal-comments-<id>` (accepted by `/__cloudhal/purge`: `isCloudhalCacheTag` learns the prefix) and widen the CSP for Turnstile only on pages with an open form. The `cloudhal()` integration builds the module `/_cloudhal/c.<hash>.js` (≤ 4 KB gzipped) and its proof-of-work worker `/_cloudhal/cw.<hash>.js` (≤ 1 KB, `@cloudhal/comments/client`), and `cloudhal dev` answers the endpoints on the local SQLite store with a local key. `cloudhal.json` `comments.available: false` removes all of it.
