---
"@cloudhal/cli": patch
---

`cloudhal deploy` retries its post-deploy calls (push check, primary domain) for up to 90 seconds while they get 401: a Workers Builds deploy makes a new deployment token, and the edge can answer from the previous admin Worker version for a few seconds. Such a build used to fail after both Workers had deployed.
