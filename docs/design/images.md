# Image presentation: placeholders and fit — research and decisions

Research for the next RFC (images that load gracefully and fit any frame). Sources at the end.

## What we have today
- **Contract** (`asset.schema.json`, `AssetImage`): `width`, `height`, `animated`, `blurhash` (nothing computes it) and `lqip` (a raster `data:` URL, ≤ 4096 characters). No colour, focal point or alpha flag; `ImageRef` has no fit fields.
- **Ingest**: Studio computes the LQIP in the browser (`apps/studio/src/lib/media.ts`, ≤ 32 px WebP); the server only validates it. Agent and import uploads get none.
- **Rendering** (`astro-renderer/src/media.ts`): the LQIP is a `background-image` on the `<img>` itself, scaled with `cover`, unblurred, no fade. Transformations are opt-in (`cdn-cgi`), `fit=scale-down`, no `gravity`.
- **Fit**: surface `Image` crops with `object-fit: cover` for a ratio; the lightbox stage uses `contain`.
- **Two bugs** in the current approach:
  1. a transparent PNG/WebP keeps showing its LQIP through its transparent pixels after it loads;
  2. wherever an image is `contain`ed in a larger box, the blocky 32 px LQIP shows in the bars.

## Placeholder techniques

| Technique | Bytes | Needs visitor JS | Quality | Alpha | Notes |
|---|---|---|---|---|---|
| Dominant colour | ~7 B | No | Calm | — | Unsplash ships it with a hash |
| CSS-only gradient LQIP | ~20 B | No | Very coarse | No | Clever, too coarse |
| BlurHash | ~30 B | Yes (canvas) | Good | No | Breaks our no-JS rule |
| ThumbHash | ~35 B | Yes, or server decode | Better | Yes | Same problem |
| Tiny raster LQIP (16–24 px WebP) | 100–400 B | No | Best per byte, once blurred | Yes | Facebook, Medium, Mux |
| LQIP in an SVG `feGaussianBlur` | + ~300 B | No | Smooth | Yes | Next.js `placeholder="blur"` |

- There is no CSS `:loaded`; a fade-in needs a script, and images must never be hidden when JS is off.
- Blur is cheap when static and drawn from a tiny source; animating a blur radius is expensive.

## Mismatched aspect ratios
- **cover + focal point** (crop steered by a stored `{x, y}` → `object-position`, and `gravity=XxY` with transformations): cards, grids, heroes.
- **contain + blur-fill** (the image whole, its side areas filled by the same image enlarged and blurred — the look of social video tools and media galleries): lightbox stages, gallery carousels, portrait shots in landscape frames.
- **contain + colour-fill** (the bars in the image's dominant colour): logos, transparent images, screenshots.
- Gimmicky when used everywhere, behind small tiles, or with a large radius.

## Decisions
1. **Visitors get LQIP + colour, no hash.** No JavaScript, best quality per byte. `blurhash` stays in the contract (unused, documented); no ThumbHash.
2. **New optional `AssetImage` fields**: `color` (`#rrggbb`), `alpha: true` (transparency, read from the file's header at ingest: PNG colour type/`tRNS`, WebP VP8X, AVIF `auxC`), `focal` (`{x, y}` in 0–1). The LQIP target tightens to 16–24 px, ≤ ~400 B.
3. **Renderer**: the placeholder moves from the `<img>` to a wrapper (`--ch-ph`, `--ch-bg`, `--ch-fx`, `--ch-fy`); no LQIP for transparent images (fixes bug 1); bars never show the raw LQIP (fixes bug 2).
4. **Fit modes**: `cover` (default with a ratio), `contain`, `blur-fill`, `color-fill`, `natural`. Defaults: Image with a ratio → cover; Lightbox stage → blur-fill; carousel gallery slides → blur-fill; cards and heroes → cover with the focal point.
5. **Blur-fill** is a wrapper `::before` painted from the LQIP already in the page, statically blurred (~20 px) and slightly scaled, decorative, gone in print and forced colours. No second image download, no `backdrop-filter`.
6. **No fade-in** for now: the image paints over its placeholder (honest, no script). A later optional module gated by `@media (scripting: enabled)` may add one.
7. **Budget**: placeholders up to ~24 KB per page; beyond that, colour only. `render_page` counts them and flags images cropped by `cover` with no focal point when the ratios differ a lot.
8. **Focal point**: set by people in Studio and by agents through the existing policy-checked asset update; per-use overrides and `fit` on `ImageRef` wait until a page needs them (a contract change for every image use).
9. **Server-side placeholders** for agent and import uploads: through the Cloudflare Images binding **when the deployment has one** (a 16–24 px WebP + colour; 5,000 unique transformations a month are free, then billed). Otherwise Studio computes them, and a `cloudhal media placeholders` backfill fills old assets. *Turning the binding on for the live deployment is the owner's call.*

## Rollout (RFC-0028)
1. Contract `color`/`alpha`/`focal`; alpha from the header parsers; Studio adds colour and alpha; the wrapper placeholder; bugs 1 and 2 fixed; budgets.
2. Fit modes and focal point in the catalog, CSS and transformations; `render_page` checks.
3. Server-side placeholders through the Images binding; the backfill command.
4. Optional fade-in; optional `gravity=auto` focal suggestions.

## Sources
- ThumbHash https://evanw.github.io/thumbhash/ · CSS-only LQIP https://leanrada.com/notes/css-only-lqip/ · Mux https://www.mux.com/blog/blurry-image-placeholders-on-the-web · Facebook preview photos https://engineering.fb.com/2015/08/06/android/the-technology-behind-preview-photos/ · Medium https://jmperezperez.com/medium-image-progressive-loading-placeholder/ · Unsplash https://unsplash.com/documentation/changelog · Next.js Image https://nextjs.org/docs/app/api-reference/components/image
- Cloudflare transformations https://developers.cloudflare.com/images/transform-images/transform-via-url/ · Images binding https://developers.cloudflare.com/images/transform-images/bindings/ · pricing https://developers.cloudflare.com/images/pricing/ · limits https://developers.cloudflare.com/images/get-started/limits/ · Workers limits https://developers.cloudflare.com/workers/platform/limits/ · jSquash https://github.com/jamsinclair/jSquash
- `:loaded` https://lists.w3.org/Archives/Public/public-css-archive/2025Sep/0177.html · fade-in needs JS https://medienbaecker.com/articles/animate-native-lazy-loading · no-JS failure https://forum.getpublii.com/topic/fadein-lazy-load-feature-causes-broken-images-without-javascript-enabled/ · blur cost https://developer.chrome.com/blog/animated-blur/ · forced colours https://www.w3.org/TR/css-color-adjust-1/
