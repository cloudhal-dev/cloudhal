---
"@cloudhal/api": minor
"@cloudhal/cli": minor
---

The Build model eval (RFC-0020 open question 7). `runBuildEvalOnce`, `summariseBuildEval` and `buildEvalTable` run Build chat's turn on several models in memory. They measure finished turns, accepted steps, repairs, refusals, rounds, latency and tokens, then rank the models. `cloudhal ai build-eval [--remote]` runs it locally over REST or on the deployment (`POST /api/admin/sites/:siteId/ai/build-eval`, deployment token).
