# RFC-0028: Image placeholders and fit
- Status: Accepted (2026-10-17; the directions were decided in the companion research)
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-17
- Related:
  - RFC-0010 (media library), RFC-0020 (surfaces), RFC-0025 (`Lightbox`), RFC-0027 (carousel `gallery`);
  - `docs/design/images.md`, the research: placeholder techniques compared, how mismatched ratios are handled elsewhere, and the decisions taken here (sources there).

## Summary
Images get a calm placeholder that needs no JavaScript (a tiny blurred LQIP over the image's dominant colour), painted on a wrapper rather than on the `<img>`. They also get a fit that suits their frame: `cover` steered by a focal point, `contain`, `blur-fill` (the image whole, its bars filled with itself enlarged and blurred), `color-fill` and `natural`. Three optional `AssetImage` fields carry what this needs (`color`, `alpha`, `focal`). Two current bugs go away: LQIPs showing through transparent images, and blocky LQIPs in `contain` bars.

## Motivation
- Agents and people put photographs of every shape into frames of fixed ratios (cards, heroes, galleries, the lightbox). Today a portrait photo in a 16:9 slide is either cropped blind or shown with flat bars.
- The placeholder sits on the `<img>` itself, so it shows through transparent PNGs after they load and fills `contain` bars with a blocky 32 px image.
- Only Studio uploads get an LQIP; nothing records a colour, a transparency flag or where the subject is.

## Proposal

### 1. Contract (`asset.schema.json`, `AssetImage`, all optional)
```jsonc
"color": { "type": "string", "pattern": "^#[0-9a-f]{6}$",
           "description": "Dominant colour, lowercase #rrggbb: the placeholder under the LQIP and the color-fill bars." },
"alpha": { "type": "boolean", "enum": [true],
           "description": "The image has transparent pixels (read from its header at ingest). Absent means opaque." },
"focal": { "type": "object", "additionalProperties": false, "required": ["x", "y"],
           "properties": { "x": { "type": "number", "minimum": 0, "maximum": 1 },
                           "y": { "type": "number", "minimum": 0, "maximum": 1 } },
           "description": "Where the subject is, from the top-left: cover crops keep it in view." }
```
- `blurhash` stays, unused and documented as such. The LQIP's target tightens to 24 px and about 400 B (the 4096-character limit stays, so old assets remain valid).
- `alpha` is read from the file's header at ingest (PNG colour type or `tRNS`, WebP VP8X, AVIF `auxC`), on every path: Studio, agents, imports.

### 2. The placeholder
```html
<img … style="background-color:#a3b18a;background-image:url(&quot;data:image/svg+xml,…&quot;);background-size:100% 100%">
```
- The placeholder is the `<img>`'s own background: the colour, then the LQIP drawn inside a small SVG whose `feGaussianBlur` (with `edgeMode="duplicate"` and alpha forced opaque, so the edges stay crisp) smooths it. The SVG covers the box (`preserveAspectRatio="xMidYMid slice"`). The image paints over it; no script and no fade, and with JavaScript off nothing is hidden.
- Under `object-fit: contain` that same layer shows in the bars: the image enlarged and blurred. This is blur-fill, with no wrapper and no second download (§3).
- Images with `alpha` get no placeholder at all (bug 1). Bars never show the raw, blocky LQIP (bug 2): it is always blurred.
- No new markup: an earlier draft wrapped every image in a `<span>`. The background keeps every theme's selectors and layouts as they are.

### 3. Fit modes
| `fit` | What it does | Default for |
|---|---|---|
| `cover` | fills the frame, cropping around `focal` (and `gravity` when transformations are on) | an `Image` with a ratio, cards, heroes |
| `contain` | the whole image, bars in the surrounding surface | screenshots inside text |
| `blur-fill` | the whole image, bars filled by itself enlarged and blurred, from the LQIP already in the page | the `Lightbox` stage, `gallery` carousels |
| `color-fill` | the whole image, bars in its `color` | logos, transparent images |
| `natural` | the image at its own ratio, no frame | images without a ratio |
- `fit` is a catalog prop of `Image` (no contract change: like RFC-0024/0025/0027 components, the catalog checks props). Per-use focal points on `ImageRef` wait until a page needs them.
- Blur-fill is the placeholder layer of §2 left visible around a contained image. It is decorative (a background), so it is gone in forced colours. No second image download and no `backdrop-filter`.

### 4. Checks and budgets
- Placeholders up to about 24 KB per page; beyond that, the renderer uses the colour only.
- `render_page` adds `image-fit`: an image cropped by `cover` with no focal point where the ratios differ a lot; an LQIP on a transparent image; placeholders over budget.

### 5. Server-side placeholders
Agent and import uploads get an LQIP and a colour through the Cloudflare Images binding **when the deployment has one** (a 16–24 px WebP). Otherwise Studio computes them on upload, and `cloudhal media placeholders` fills old assets.

### Invariants
1. No image is ever hidden waiting for a script.
2. A placeholder never shows after its image has loaded, transparent pixels included.
3. Nothing the reader needs is cropped away silently: a cover crop keeps the focal point, and the checks flag blind crops.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| BlurHash / ThumbHash | ~30 B, good quality | Needs a canvas decode in the visitor's browser (or server decoding) | Breaks the no-JavaScript rule; a 300 B LQIP looks as good once blurred |
| CSS-only gradient LQIP | ~20 B, no script | Very coarse | Too coarse for photographs |
| Blur-fill with a second, blurred image | Sharper fill | A second download per image | The LQIP already in the page is enough when blurred |
| `backdrop-filter` | One element | Costly, and it blurs what lies behind it, not the image | Static blur of a tiny source is cheap |
| `fit` and `focal` on every `ImageRef` | Per-use control | A contract change for every image use | The asset's focal point covers most cases |

## Compatibility & migration
- All new fields are optional, and old assets render as today with the colour missing. No `schemaVersion` change.
- The renderer's markup is unchanged; only the `<img>`'s inline background differs.
- Rollback: restore the old background and drop the catalog prop; the fields stay harmless.

## Security & policy impact
- `focal` is set through the existing policy-checked asset update; no new scope.
- The Images binding is billed beyond its free allowance; turning it on for a deployment is the owner's decision, never an agent's.

## Rollout
| Phase | Scope |
|---|---|
| 28a | Contract `color`/`alpha`/`focal`; alpha header parsers; Studio adds colour; the blurred placeholder; bugs 1 and 2; budget |
| 28b | Fit modes and focal point in the catalog, CSS and transformations; `image-fit` check; gallery and lightbox default to blur-fill |
| 28c | Server-side placeholders through the Images binding (the owner turns it on); the backfill command |
| 28d | Optional fade-in module (`@media (scripting: enabled)`); optional `gravity=auto` focal suggestions |

## Open questions
None; `docs/design/images.md` decided them. Whether the live deployment gets the Images binding is asked of the owner at 28c.

## Status
- **28a shipped.**
  - **Contract.** `AssetImage` gains `color`, `alpha` and `focal`, with fixtures for each; TypeScript and Rust are regenerated.
  - **Ingest.** Every path reads `alpha` from the file header: PNG colour type or `tRNS`, WebP VP8X, `ALPH` or the VP8L alpha bit, a GIF transparency flag, an AVIF alpha `auxC`. An SVG always counts as transparent.
  - **Studio.**
    - Uploads send a 24 px LQIP and the dominant colour (the mean of the visible pixels).
    - The LQIP drops the ~450 B ICC profile Chrome's canvas embeds, so a typical one goes from ~780 to ~140 characters.
    - The API accepts `image.color`.
  - **Renderer.** `placeholderStyle` draws the colour and the blurred LQIP as the image's background, nothing for transparent images. A per-page budget (`PLACEHOLDER_BUDGET`, 24 KB, `MediaContext.budget`) falls back to the colour. Both bugs are gone, and gallery and lightbox bars already show the blurred image.
