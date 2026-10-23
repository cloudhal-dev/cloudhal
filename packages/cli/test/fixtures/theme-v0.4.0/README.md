# Frozen theme: the blog starter as released in v0.4.0

`src/` is `starters/blog/src` exactly as tagged `v0.4.0` (`git archive v0.4.0 starters/blog/src`). `test/old-theme-compat.test.ts` creates a project with today's `cloudhal init`, swaps its `src/` for this copy and builds it with today's packages.

Why this copy: RFC-0041 step 6 added typed custom fields to the renderer (`GraphSource.entryFields`, `formatFieldValue`, `EntryFields.astro`) and changed the starter's article to show them. Sites created with 0.4.0 keep this theme, which knows nothing about fields; it must keep building and rendering exactly as before (it simply does not show field values). See `../theme-v0.3.10/README.md` for the history of this test.

**Never update this copy** to the current starter, and do not reformat it (Biome and the TypeScript check skip it): it stands for the themes that already exist in sites. Only `src/` is kept; `astro.config.mjs`, `tsconfig.json` and `public/` (fonts) come from the project `init` creates.
