# Cloudhal blog starter

Created by `cloudhal init`. Pages, posts and sections live in `.cloudhal/` (SQLite + blobs); this project only holds the theme: `src/layouts`, `src/styles`, `src/theme.ts` (component overrides) and the two routes under `src/pages`.

```bash
cloudhal dev      # live preview of the current graph (drafts visible)
cloudhal snapshot # freeze the current state
cloudhal build    # static HTML from the published (or latest) snapshot
```
