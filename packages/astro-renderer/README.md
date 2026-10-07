# @cloudhal/astro-renderer

Renders a Cloudhal Site Graph with Astro 7. Three pieces:

| Export | What |
|---|---|
| `@cloudhal/astro-renderer/integration` | `cloudhal({ dataDir, siteId })` — exposes the project config as `virtual:cloudhal/config`, externalises the native SQLite module, and in dev watches the data directory to clear Astro's route cache when pages are added (Astro ≥6.3 caches `getStaticPaths()` across requests). |
| `@cloudhal/astro-renderer/runtime` | `getSource(config)` — a `GraphSource`: **live** nodes in dev (drafts visible), a **snapshot** in builds (`CLOUDHAL_SOURCE=snapshot:<id>`). |
| `@cloudhal/astro-renderer/components` | `Sections` dispatcher + `Hero`, `RichText`, `Image`, `ContentList` `.astro` components. Themes override any of them through the `components` prop. |

A page route in a starter looks like this:

```astro
---
import { Sections } from "@cloudhal/astro-renderer/components";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import config from "virtual:cloudhal/config";
export async function getStaticPaths() {
  const source = await getSource(config);
  return (await source.pages()).map((p) => ({ params: { path: p.path === "/" ? undefined : p.path.slice(1) } }));
}
const source = await getSource(config);
const page = await source.pageByPath(Astro.params.path ? `/${Astro.params.path}` : "/");
---
<Sections sections={page.sections} />
```

`.astro` files ship as source (no build step); the consumer's Astro compiles them. `astro` is a peer dependency.
