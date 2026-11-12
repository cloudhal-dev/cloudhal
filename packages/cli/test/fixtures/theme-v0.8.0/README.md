# Frozen theme: the blog starter as released in v0.8.0

`src/` is `starters/blog/src` exactly as tagged `v0.8.0` (`git archive v0.8.0 starters/blog/src`). `test/old-theme-compat.test.ts` creates a project with today's `cloudhal init`, swaps its `src/` for this copy and builds it with today's packages.

Why this copy: RFC-0045 step 3 taught the renderer reference and repeater fields — `entryFields` resolves references to cards of the targets the page's view shows and repeaters to their items, the sources gained `groupMembers` and `referencedBy`, and `EntryFields.astro` (which ships in the renderer) draws references as links and items as nested lists. Sites created with 0.8.0 keep this theme, which knows none of that: it must keep building, and its entry pages get the links and items from the renderer's component with no change of their own. See `../theme-v0.3.10/README.md` for the history of this test.

**Never update this copy** to the current starter, and do not reformat it (Biome and the TypeScript check skip it): it stands for the themes that already exist in sites. Only `src/` is kept; `astro.config.mjs`, `tsconfig.json` and `public/` (fonts) come from the project `init` creates.
