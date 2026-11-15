---
"@cloudhal/cli": patch
---

Workers Builds deploys no longer fail when the new deployment token is still propagating (#245). After uploading the Workers, `cloudhal deploy` checks whether the deployment already has the site. That check counted any answer other than 200 as "absent", so a 401 from the token not yet having spread led to a push that the deployment refused with "diverged". Now only a 404 means absent: a 401 is retried while the token spreads, any other answer is an error and nothing is pushed, and a push refused because the deployment already has the site counts as already deployed. `cloudhal push` keeps its divergence error.
