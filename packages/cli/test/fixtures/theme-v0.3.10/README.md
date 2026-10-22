# Frozen theme: the blog starter as released in v0.3.10

`src/` is `starters/blog/src` exactly as tagged `v0.3.10` (`git archive v0.3.10 starters/blog/src`). `test/old-theme-compat.test.ts` creates a project with today's `cloudhal init`, swaps its `src/` for this copy and builds it with today's packages.

Why: `cloudhal init` copies the starter theme into each site's project, and from then on the site's theme calls `@cloudhal/astro-renderer` and `@cloudhal/core-ts` as they were at that release. In 0.3.11 the renderer's `entryPath(entry)` became `entryPath(site, entry)`; sites with an older copy rendered empty pages (status 200) on 0.3.12, and CI did not notice because it only rendered the current starter, updated in the same PR. 0.3.13 restored the old call as a deprecated overload.

**Never update this copy** to the current starter, and do not reformat it (Biome and the TypeScript check skip it): it stands for the themes that already exist in sites. When a release changes theme-facing APIs, add a new frozen copy beside it (`theme-v<version>/`) and list the version in the test's `FROZEN`. Only `src/` is kept; `astro.config.mjs`, `tsconfig.json` and `public/` (fonts) come from the project `init` creates.
