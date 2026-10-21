---
"@cloudhal/cli": patch
---

Studio switches screens faster: the signed-in session is kept between navigations (asked again after five minutes, on sign-out, on revoking sessions and on any 401) instead of being checked with the server on every click, and the pending screen shows after 150 ms instead of the router's one second, so a short wait no longer looks frozen.
