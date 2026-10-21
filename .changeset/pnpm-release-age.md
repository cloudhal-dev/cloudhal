---
"@cloudhal/cli": patch
---
New projects exempt `@cloudhal/*` and `create-cloudhal` from pnpm's `minimumReleaseAge` in their `pnpm-workspace.yaml`, so pnpm installs a Cloudhal release on the day it ships instead of refusing it for a day.
