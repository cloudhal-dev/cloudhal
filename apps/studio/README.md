# Cloudhal Studio

The admin UI: Vite 8 + React 19 SPA, TanStack Router/Query, Tailwind 4, Kumo via `@cloudhal/ui`.

Screens: login/sign-up, sites, site overview (pages), page editor (sections), articles + article editor (draft → review → published with an approval dialog), snapshots (timeline, publish, roll back), ⌘K command palette. UI language: English and Turkish (`src/i18n`), auto-detected and switchable.

```bash
# API for a project (serves the built Studio too when apps/studio/dist exists)
node packages/cli/bin/cloudhal.ts studio --port 8787      # run inside a project created by `cloudhal init`
# Studio with HMR, proxying /api to :8787
pnpm --filter @cloudhal/studio dev
pnpm --filter @cloudhal/studio build
```

Adding a UI string: add it to `src/i18n/en.ts` (the typed source) and `tr.ts`; `useT()("section.key")` is type-checked, and a test asserts both catalogs have the same keys.
