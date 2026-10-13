---
"@cloudhal/cli": patch
---

`cloudhal deploy` no longer ships a stale Studio from the monorepo: when `apps/studio/dist` is missing or older than the newest file in `apps/studio/src`, `apps/studio/index.html` or `packages/ui/src`, it runs `pnpm --filter @cloudhal/studio build` first. `--no-build-studio` skips the build and fails on a missing or stale build instead, naming the command. A published install ships Studio prebuilt and is not checked.
