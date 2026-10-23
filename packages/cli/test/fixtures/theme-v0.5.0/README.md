# Frozen theme: the blog starter as released in v0.5.0

`src/` is `starters/blog/src` exactly as tagged `v0.5.0` (`git archive v0.5.0 starters/blog/src`). `test/old-theme-compat.test.ts` creates a project with today's `cloudhal init`, swaps its `src/` for this copy and builds it with today's packages.

Why this copy: RFC-0042 step 3 added collections stage 3 to the renderer — derived expiry gates, listings by field (`queryEntries`, `contentList` sections with `where`/`orderBy`) and JSON-LD presets (`withStructuredData`) — and changed the starter to call `withStructuredData` and `contentListEntries`. Sites created with 0.5.0 keep this theme: it must keep building and rendering exactly as before, with the generic `BlogPosting` for every entry (`entryHead` is unchanged). What it gets on upgrade without a change of its own comes from settings the site opts into: entries past an expiry leave its lists and feeds, and `contentList` sections with `where` filter (`ContentList.astro` ships in the renderer). See `../theme-v0.3.10/README.md` for the history of this test.

**Never update this copy** to the current starter, and do not reformat it (Biome and the TypeScript check skip it): it stands for the themes that already exist in sites. Only `src/` is kept; `astro.config.mjs`, `tsconfig.json` and `public/` (fonts) come from the project `init` creates.
