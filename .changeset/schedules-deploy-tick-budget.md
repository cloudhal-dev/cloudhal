---
"@cloudhal/cli": minor
---

RFC-0008 §8.2 and §11.6: `cloudhal deploy` now always writes `CLOUDHAL_TICK_BUDGET` and `CLOUDHAL_AUTOMATIONS` into the admin Worker's vars, so a redeploy no longer drops a kill switch set in the dashboard and Workers Paid deployments stop ticking on the Free budget. `--plan free|paid` (or `cloudhal.json` `schedules.plan`) sizes each tick for the account's Workers plan; the plan is remembered in `state.json`, and without one the deploy uses `free` and says how to change it. `cloudhal.json` `schedules.automations: false` writes `CLOUDHAL_AUTOMATIONS=off`. On Node, `cloudhal dev`, `studio`, `mcp` and `schedules run-due` honour `CLOUDHAL_AUTOMATIONS=off` from the environment: automations stop and their keys are refused, while releases and time gates go on (`automationsEnabled()` is exported).
