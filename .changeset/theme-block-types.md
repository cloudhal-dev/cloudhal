---
"@cloudhal/core-ts": minor
"@cloudhal/astro-renderer": minor
"@cloudhal/cli": minor
"@cloudhal/cloudflare": minor
"@cloudhal/api": patch
"@cloudhal/mcp-server": patch
"@cloudhal/ui": patch
---

Theme block types, RFC-0015 phase 6d (first part). A theme declares its types in `src/blocks.ts`; `cloudhal studio`, `cloudhal mcp` and `cloudhal deploy` load and check them (`openLocalStore(dir, { blocks })`), and the admin Worker bundles them (`createAdminWorker({ blockTypes })`). Theme components render inside bodies too: `Body.astro` and `EntryArticle.astro` (`renderBodyParts`, `entryArticleParts`), with `{ props, content, contentHtml, media }`; `Block.astro` checks a theme type's props first. Previews tell theme types from unknown ones (`MediaContext.blocks`). The blog starter ships a `testimonial` type.
